import env from '@/lib/env';
import { ErpApiError, erp } from '@/lib/erp';
import { ApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import {
  ADMIN_DASHBOARD_DEFAULT_PAGE_SIZE,
  ADMIN_DASHBOARD_MAX_PAGE_SIZE,
  ADMIN_DASHBOARD_MAX_SEARCH_LENGTH,
  ADMIN_DASHBOARD_MIN_PAGE_SIZE,
  AdminDashboardPayload,
  AdminDashboardQuery,
  AdminDashboardSummary,
  AdminDashboardSweep,
  AdminHealthStatus,
  AdminTenantRecord,
  AdminTenantsPage,
  AdminTenantStatusFilter,
  isAdminTenantStatusFilter,
  normalizeErpSubscription,
} from 'models/adminDashboard';

/**
 * Strict select whitelist for Team records in Admin context.
 * NEVER select erpAccessToken, erpApiUrl, or any credential material.
 */
const ADMIN_TEAM_SELECT = {
  id: true,
  name: true,
  slug: true,
  domain: true,
  erpTenantId: true,
  erpSubdomain: true,
  erpLinkedAt: true,
  createdAt: true,
  _count: {
    select: {
      members: true,
    },
  },
} as const;

/** Per-tenant ERP read budget. Mirrors the 3s probe budget. */
export const ERP_ROW_TIMEOUT_MS = 3000;

/** Max concurrent ERP billing reads while building the dashboard. */
const ADMIN_ERP_CONCURRENCY = 5;

/**
 * How long a completed sweep is reused before the next request re-sweeps.
 *
 * The TTL exists so that paginating, filtering, refreshing and extra browser
 * tabs within this window all share ONE ERP sweep instead of each triggering
 * a fresh per-tenant ERP read storm (5 concurrent reads × 3s max per row).
 */
export const ADMIN_DASHBOARD_SWEEP_TTL_MS = 30_000;

/** Sentinel message used to recognise our own timeout rejection. */
const ERP_TIMEOUT_TOKEN = 'erp-row-timeout';

/**
 * Rejects with `ERP_TIMEOUT_TOKEN` once `ms` elapses.
 *
 * `Promise.allSettled` bounds *failure* but not *time*: an ERP that accepts the
 * TCP connection and then stalls would keep every per-tenant read pending
 * forever and `/api/admin/dashboard` would never respond — breaking the
 * graceful-degradation requirement for the hardest outage mode.
 *
 * `Promise.race` attaches handlers to both inputs, so a late rejection from
 * `promise` after the timeout has already won is handled (no unhandled
 * rejection).
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(ERP_TIMEOUT_TOKEN)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

/**
 * Runs `fn` over `items` with at most `limit` promises in flight, preserving
 * input order in the returned settled results.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);

  for (let start = 0; start < items.length; start += limit) {
    const settled = await Promise.allSettled(
      items.slice(start, start + limit).map(fn)
    );
    settled.forEach((result, offset) => {
      results[start + offset] = result;
    });
  }

  return results;
}

/**
 * Probes the ERP WebAPI health with a strict 3s timeout.
 *
 * Mirrors the probe in `pages/api/health.ts` — including its endpoint choice.
 * The probe MUST target a genuinely public route: the registration catalog is
 * public (200) and proves the ERP API is up, whereas `/payments/methods`
 * requires auth (P2.17 86cbcq7g2 — 401 for unauthenticated callers). Probing
 * the billing route made every production health check report
 * `ok:false, error:http-401` even when the ERP was perfectly reachable, which
 * would pin the Admin health card to a permanent amber "available but
 * erroring" false alarm. Guarded by the regression test in
 * `__tests__/lib/adminDashboard.spec.ts` (and the equivalent one in
 * `__tests__/api/health.spec.ts`).
 */
export async function probeErpHealth(): Promise<AdminHealthStatus> {
  const startedAt = Date.now();
  try {
    const response = await fetch(
      `${env.erp.apiUrl}/platform/TenantRegistration/catalog/packages`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      }
    );
    const latencyMs = Date.now() - startedAt;

    if (response.ok) {
      return {
        ok: true,
        reachable: true,
        latencyMs,
        statusCode: response.status,
      };
    }

    return {
      ok: false,
      reachable: true,
      latencyMs,
      statusCode: response.status,
      error: `http-${response.status}`,
    };
  } catch (err: any) {
    const isTimeout =
      err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return {
      ok: false,
      reachable: false,
      error: isTimeout ? 'timeout' : 'unreachable',
    };
  }
}

/**
 * Fetches and resolves subscription data for a single team.
 */
async function resolveTeamSubscription(
  team: {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
    erpTenantId: string | null;
    erpSubdomain: string | null;
    erpLinkedAt: Date | null;
    createdAt: Date;
    _count: { members: number };
  },
  now: Date
): Promise<AdminTenantRecord> {
  const baseRecord: AdminTenantRecord = {
    id: team.id,
    name: team.name,
    slug: team.slug,
    domain: team.domain,
    erpTenantId: team.erpTenantId,
    erpSubdomain: team.erpSubdomain,
    erpLinkedAt: team.erpLinkedAt ? team.erpLinkedAt.toISOString() : null,
    createdAt: team.createdAt.toISOString(),
    memberCount: team._count.members,
    subscription: null,
    erpReachable: false,
    error: null,
  };

  if (!team.erpTenantId) {
    return baseRecord;
  }

  let rawData: unknown;

  try {
    // The same budget is applied twice on purpose: the `withTimeout` race
    // guarantees the dashboard responds by `ERP_ROW_TIMEOUT_MS`, while the
    // AbortSignal actually CANCELS the in-flight ERP request at that same
    // deadline. Without the signal, losing the race left the ERP read pending
    // for undici's default timeouts, so an ERP that accepts TCP and then
    // stalls accumulated one never-settled request per refresh.
    const signal = AbortSignal.timeout(ERP_ROW_TIMEOUT_MS);

    rawData = await withTimeout(
      erp.getTenantBillingSubscription(
        env.erp.platformApiKey,
        team.erpTenantId,
        signal
      ),
      ERP_ROW_TIMEOUT_MS
    );
  } catch (err: any) {
    // A 404 from the M2M billing endpoint means "this tenant has no
    // subscription row yet" — a normal state, not an ERP outage. Surfacing it
    // as unreachable would label a healthy linked tenant as unavailable.
    if (err instanceof ErpApiError && err.status === 404) {
      return {
        ...baseRecord,
        subscription: null,
        erpReachable: true,
        error: 'no-subscription',
      };
    }

    // An aborted read counts as a timeout: whichever of the race sentinel and
    // the AbortSignal fires first, the row is classified identically.
    const isTimeout =
      (err instanceof Error && err.message === ERP_TIMEOUT_TOKEN) ||
      err?.name === 'AbortError' ||
      err?.name === 'TimeoutError';

    return {
      ...baseRecord,
      subscription: null,
      erpReachable: false,
      error: isTimeout ? 'erp-timeout' : 'erp-unavailable',
    };
  }

  try {
    return {
      ...baseRecord,
      subscription: normalizeErpSubscription(rawData, now),
      erpReachable: true,
    };
  } catch {
    // ERP answered but the body could not be normalized — distinct from an
    // outage so the operator can tell the two apart.
    return {
      ...baseRecord,
      subscription: null,
      erpReachable: true,
      error: 'erp-malformed-payload',
    };
  }
}

/**
 * Aggregates summary counters from the normalized tenant records.
 */
export function buildAdminSummary(
  tenants: AdminTenantRecord[]
): AdminDashboardSummary {
  const totalTeams = tenants.length;
  let linkedTeams = 0;
  let activeSubscriptions = 0;
  let trialSubscriptions = 0;
  let expiredSubscriptions = 0;

  for (const tenant of tenants) {
    if (tenant.erpTenantId) {
      linkedTeams++;
    }

    if (tenant.subscription) {
      switch (tenant.subscription.status) {
        case 'active':
          activeSubscriptions++;
          break;
        case 'trial':
          trialSubscriptions++;
          break;
        case 'expired':
          expiredSubscriptions++;
          break;
      }
    }
  }

  return {
    totalTeams,
    linkedTeams,
    activeSubscriptions,
    trialSubscriptions,
    expiredSubscriptions,
  };
}

/**
 * Builds the full Admin Dashboard sweep from scratch.
 *
 * Cost characteristic (known and accepted): this is a full-team scan plus ONE
 * ERP read per linked tenant, bounded to `ADMIN_ERP_CONCURRENCY` in flight, so
 * a sweep costs `ceil(linkedTeams / ADMIN_ERP_CONCURRENCY) * ERP_ROW_TIMEOUT_MS`
 * in the worst (stalled-ERP) case.
 *
 * WHY A FULL SWEEP AT ALL: the subscription KPIs (`active`/`trial`/`expired`)
 * are the point of this monitoring console, and the only ERP contract available
 * is a PER-TENANT billing read — there is no aggregate endpoint (that is P5.7).
 * A global summary therefore inherently needs one read per linked tenant. What
 * the browser does NOT need is every tenant row: `getAdminDashboardData` slices
 * this sweep into a single page and ships only that, which is what keeps the
 * response bounded on a platform with hundreds of tenants.
 *
 * Guarantees:
 * - ERP down never throws; health.ok is set to false and the route returns 200.
 * - Promise.allSettled guarantees that one tenant error does not fail the whole list.
 * - Teams ordered by createdAt desc.
 */
async function buildAdminDashboardSweep(
  now: Date
): Promise<AdminDashboardSweep> {
  const [teams, health] = await Promise.all([
    // Unbounded on purpose: the summary above is global over ALL teams, and
    // `status` filtering is derived from per-tenant ERP data that Prisma
    // cannot express in a `where`. The result is cached (TTL below) and only
    // ONE page of it is ever serialized to the client.
    prisma.team.findMany({
      select: ADMIN_TEAM_SELECT,
      orderBy: { createdAt: 'desc' },
    }),
    probeErpHealth(),
  ]);

  const settledResults = await mapWithConcurrency(
    teams,
    ADMIN_ERP_CONCURRENCY,
    (team) => resolveTeamSubscription(team, now)
  );

  const tenants: AdminTenantRecord[] = settledResults.map((result, idx) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    const team = teams[idx];
    return {
      id: team.id,
      name: team.name,
      slug: team.slug,
      domain: team.domain,
      erpTenantId: team.erpTenantId,
      erpSubdomain: team.erpSubdomain,
      erpLinkedAt: team.erpLinkedAt ? team.erpLinkedAt.toISOString() : null,
      createdAt: team.createdAt.toISOString(),
      memberCount: team._count.members,
      subscription: null,
      erpReachable: false,
      error: 'resolution-failed',
    };
  });

  const summary = buildAdminSummary(tenants);
  const recentRegistrations = tenants.slice(0, 5);

  return {
    generatedAt: now.toISOString(),
    summary,
    health,
    tenants,
    recentRegistrations,
  };
}

/** A completed sweep and the wall-clock time its build STARTED. */
interface SweepCacheEntry {
  storedAt: number;
  payload: AdminDashboardSweep;
}

/** Last completed sweep, reused for `ADMIN_DASHBOARD_SWEEP_TTL_MS`. */
let cachedSweep: SweepCacheEntry | null = null;

/** In-flight sweep shared by every caller that arrives while one is running. */
let inFlightSweep: Promise<AdminDashboardSweep> | null = null;

/**
 * Clears the sweep cache (both the completed entry and any in-flight sweep).
 *
 * Required by tests: without it a cached payload from one test would be served
 * to the next, which is exactly why a TTL cache was rejected the first time it
 * was proposed. Also usable by operational tooling that must force a re-sweep.
 */
export function resetAdminDashboardCache(): void {
  cachedSweep = null;
  inFlightSweep = null;
}

/**
 * Returns the full sweep, cached for `ADMIN_DASHBOARD_SWEEP_TTL_MS`.
 *
 * Two layers of de-duplication:
 * 1. **TTL** — a completed sweep is reused, so page 2, a filter change, a
 *    refresh and a second tab within the window all share one ERP sweep.
 * 2. **In-flight coalescing** — callers piling up while a sweep is still
 *    running await that same promise instead of launching a read storm.
 *
 * The TTL is measured from the moment the sweep STARTED (not when it settled),
 * so a slow sweep cannot extend its own lifetime.
 */
export function getAdminDashboardSweep(
  now: Date = new Date()
): Promise<AdminDashboardSweep> {
  if (
    cachedSweep &&
    Date.now() - cachedSweep.storedAt < ADMIN_DASHBOARD_SWEEP_TTL_MS
  ) {
    return Promise.resolve(cachedSweep.payload);
  }

  if (inFlightSweep) {
    return inFlightSweep;
  }

  const startedAt = Date.now();
  const sweep = buildAdminDashboardSweep(now)
    .then((payload) => {
      cachedSweep = { storedAt: startedAt, payload };
      return payload;
    })
    .finally(() => {
      inFlightSweep = null;
    });

  inFlightSweep = sweep;

  return sweep;
}

/** Query defaults for a plain (unfiltered, first-page) dashboard request. */
export const DEFAULT_ADMIN_DASHBOARD_QUERY: AdminDashboardQuery = {
  page: 1,
  pageSize: ADMIN_DASHBOARD_DEFAULT_PAGE_SIZE,
  search: '',
  status: 'all',
};

/**
 * Reads one query-string parameter, rejecting repeated (?page=1&page=2) values.
 */
function readStringParam(
  raw: Record<string, unknown>,
  key: string
): string | undefined {
  const value = raw[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ApiError(422, `Invalid ${key} parameter`);
  }

  return value;
}

/**
 * Parses and validates `GET /api/admin/dashboard` query parameters.
 *
 * Invalid input is a client error, so it throws `ApiError(422)` — the error
 * contract this route family already uses (see
 * `pages/api/admin/tenants/[teamId].ts`): 400 is reserved for malformed
 * request BODIES, 422 for invalid query input. The route's existing catch maps
 * it to `{ error: { message } }`.
 *
 * Empty (`?status=`) or whitespace-only values are treated as absent, because
 * an empty form field is not an unknown filter.
 */
export function parseAdminDashboardQuery(
  raw: Record<string, unknown> = {}
): AdminDashboardQuery {
  const rawPage = readStringParam(raw, 'page');
  let page = 1;

  if (rawPage !== undefined && rawPage.trim() !== '') {
    const trimmed = rawPage.trim();
    if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1) {
      throw new ApiError(422, 'Invalid page parameter');
    }
    page = Number(trimmed);
  }

  const rawPageSize = readStringParam(raw, 'pageSize');
  let pageSize = ADMIN_DASHBOARD_DEFAULT_PAGE_SIZE;

  if (rawPageSize !== undefined && rawPageSize.trim() !== '') {
    const trimmed = rawPageSize.trim();
    const parsed = Number(trimmed);

    if (
      !/^\d+$/.test(trimmed) ||
      parsed < ADMIN_DASHBOARD_MIN_PAGE_SIZE ||
      parsed > ADMIN_DASHBOARD_MAX_PAGE_SIZE
    ) {
      throw new ApiError(422, 'Invalid pageSize parameter');
    }

    pageSize = parsed;
  }

  const rawSearch = readStringParam(raw, 'search');
  let search = '';

  if (rawSearch !== undefined) {
    if (rawSearch.length > ADMIN_DASHBOARD_MAX_SEARCH_LENGTH) {
      throw new ApiError(422, 'Invalid search parameter');
    }
    search = rawSearch.trim();
  }

  const rawStatus = readStringParam(raw, 'status');
  let status: AdminTenantStatusFilter = 'all';

  if (rawStatus !== undefined && rawStatus.trim() !== '') {
    const candidate = rawStatus.trim();

    if (!isAdminTenantStatusFilter(candidate)) {
      throw new ApiError(422, 'Invalid status parameter');
    }

    status = candidate;
  }

  return { page, pageSize, search, status };
}

/**
 * Applies the search + status filters over the WHOLE tenant list.
 *
 * Filtering MUST happen before slicing: filtering one page client-side would
 * silently report "no results" for a match that lives on another page.
 *
 * `linked`/`unlinked` key off the ERP link; the subscription statuses key off
 * the resolved subscription, so a tenant with no subscription row never
 * matches a status filter (same rule the UI always had).
 */
export function filterAdminTenants(
  tenants: AdminTenantRecord[],
  query: Pick<AdminDashboardQuery, 'search' | 'status'>
): AdminTenantRecord[] {
  const needle = query.search.toLowerCase();
  const { status } = query;

  if (!needle && status === 'all') {
    return tenants;
  }

  return tenants.filter((tenant) => {
    if (needle) {
      // Superset of the documented name+slug match: the search box has always
      // advertised the ERP subdomain and tenant id too (its placeholder is
      // "بحث باسم الشركة، الرابط، أو المعرف"), so dropping them here would
      // silently remove a working operator affordance.
      const haystacks = [
        tenant.name,
        tenant.slug,
        tenant.erpSubdomain,
        tenant.erpTenantId,
      ];

      const matches = haystacks.some(
        (value) => Boolean(value) && value!.toLowerCase().includes(needle)
      );

      if (!matches) {
        return false;
      }
    }

    if (status === 'all') {
      return true;
    }

    if (status === 'linked') {
      return Boolean(tenant.erpTenantId);
    }

    if (status === 'unlinked') {
      return !tenant.erpTenantId;
    }

    return tenant.subscription?.status === status;
  });
}

/**
 * Slices the filtered rows into one bounded page.
 *
 * A page beyond the end is NOT an error: it returns an empty `items` with the
 * correct `total`/`totalPages`, so the client can show an out-of-range state
 * and navigate back.
 */
export function paginateAdminTenants(
  tenants: AdminTenantRecord[],
  page: number,
  pageSize: number
): AdminTenantsPage {
  const total = tenants.length;
  const start = (page - 1) * pageSize;

  return {
    items: tenants.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Combines a cached sweep with the validated query into the API payload. */
function buildAdminDashboardPayload(
  sweep: AdminDashboardSweep,
  query: AdminDashboardQuery
): AdminDashboardPayload {
  return {
    generatedAt: sweep.generatedAt,
    summary: sweep.summary,
    health: sweep.health,
    tenants: paginateAdminTenants(
      filterAdminTenants(sweep.tenants, query),
      query.page,
      query.pageSize
    ),
    recentRegistrations: sweep.recentRegistrations,
  };
}

/**
 * Loads one page of the Admin Dashboard: the GLOBAL summary/health plus the
 * requested (filtered, bounded) tenant page.
 *
 * The expensive part — the full-team ERP sweep — comes from the TTL cache, so
 * paginating and filtering do not each trigger a new per-tenant ERP read.
 */
export async function getAdminDashboardData(
  query: AdminDashboardQuery = DEFAULT_ADMIN_DASHBOARD_QUERY,
  now: Date = new Date()
): Promise<AdminDashboardPayload> {
  const sweep = await getAdminDashboardSweep(now);

  return buildAdminDashboardPayload(sweep, query);
}

/**
 * Resolves a single tenant by platform Team id for drill-down.
 */
export async function getAdminTenantById(
  teamId: string,
  now: Date = new Date()
): Promise<AdminTenantRecord | null> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: ADMIN_TEAM_SELECT,
  });

  if (!team) {
    return null;
  }

  return resolveTeamSubscription(team, now);
}
