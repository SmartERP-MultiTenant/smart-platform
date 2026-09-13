import env from '@/lib/env';
import { ErpApiError, erp } from '@/lib/erp';
import { prisma } from '@/lib/prisma';
import {
  AdminDashboardPayload,
  AdminDashboardSummary,
  AdminHealthStatus,
  AdminTenantRecord,
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
 * Builds the complete Admin Dashboard payload from scratch.
 *
 * Cost characteristic (known and accepted): this is a full-team scan plus ONE
 * ERR read per linked tenant, bounded to `ADMIN_ERP_CONCURRENCY` in flight, so
 * a sweep costs `ceil(linkedTeams / ADMIN_ERP_CONCURRENCY) * ERP_ROW_TIMEOUT_MS`
 * in the worst (stalled-ERP) case. At a few hundred linked tenants that can
 * exceed the 30s client refresh interval, so the refresh is de-duplicated on
 * both sides instead of paginated: SWR's `dedupingInterval` collapses the same
 * tab's overlapping refreshes, and `getAdminDashboardData` coalesces the
 * concurrent sweeps issued by different tabs. Pagination is deliberately NOT
 * used here — ticket P5.3 requires the page to list ALL platform teams with
 * unlinked teams shown explicitly, so hiding rows behind a page size would
 * break the acceptance criterion.
 *
 * Guarantees:
 * - ERP down never throws; health.ok is set to false and dashboard returns 200.
 * - Promise.allSettled guarantees that one tenant error does not fail the whole list.
 * - Teams ordered by createdAt desc.
 */
async function buildAdminDashboardData(
  now: Date
): Promise<AdminDashboardPayload> {
  const [teams, health] = await Promise.all([
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

/** In-flight sweep shared by every caller that arrives while one is running. */
let inFlightSweep: Promise<AdminDashboardPayload> | null = null;

/**
 * Loads the complete Admin Dashboard payload.
 *
 * Sweeps are de-duplicated by time (SWR `dedupingInterval` on the client) and
 * by concurrency here: callers that pile up while a sweep is still running
 * share that single sweep instead of each launching a new full-team ERP read
 * storm. The reference is cleared as soon as the sweep settles, so a later
 * caller always gets fresh subscription data (no TTL staleness).
 */
export function getAdminDashboardData(
  now: Date = new Date()
): Promise<AdminDashboardPayload> {
  if (inFlightSweep) {
    return inFlightSweep;
  }

  const sweep = buildAdminDashboardData(now).finally(() => {
    inFlightSweep = null;
  });

  inFlightSweep = sweep;

  return sweep;
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
