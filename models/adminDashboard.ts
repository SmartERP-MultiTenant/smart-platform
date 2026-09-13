/**
 * Domain models and normalizers for the Platform Admin Dashboard (P5.3).
 *
 * All functions here are pure and deterministic (safe for unit tests without DB/network).
 */

export type AdminSubscriptionStatus =
  | 'trial'
  | 'active'
  | 'expired'
  | 'cancelled'
  | 'unknown';

export interface AdminTenantSubscription {
  status: AdminSubscriptionStatus;
  rawStatus?: string | null;
  isTrial: boolean;
  planName?: string | null;
  priceMonthly?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  extendedUntil?: string | null;
  daysRemaining?: number | null;
}

export interface AdminTenantRecord {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  erpTenantId?: string | null;
  erpSubdomain?: string | null;
  erpLinkedAt?: string | null;
  createdAt: string;
  memberCount: number;
  subscription: AdminTenantSubscription | null;
  erpReachable: boolean;
  error?: string | null;
}

export interface AdminHealthStatus {
  ok: boolean;
  reachable: boolean;
  latencyMs?: number;
  statusCode?: number;
  error?: string;
}

export interface AdminDashboardSummary {
  totalTeams: number;
  linkedTeams: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  expiredSubscriptions: number;
}

/**
 * One page of tenant rows.
 *
 * `total` counts the teams matching the ACTIVE filters across the WHOLE
 * dataset (not just this page), so the client can render "الصفحة X من Y" and
 * the filtered total without ever holding every row.
 */
export interface AdminTenantsPage {
  items: AdminTenantRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * API payload for `GET /api/admin/dashboard`.
 *
 * The subscription KPIs stay GLOBAL over every team (see the sweep cache in
 * `lib/adminDashboard.ts`), so `summary`/`health` are computed from the full
 * sweep while `tenants` carries only the requested page.
 */
export interface AdminDashboardPayload {
  generatedAt: string;
  summary: AdminDashboardSummary;
  health: AdminHealthStatus;
  tenants: AdminTenantsPage;
  recentRegistrations: AdminTenantRecord[];
}

/**
 * Internal, server-only sweep result: every team with its resolved
 * subscription. Never shipped whole to the browser — the route derives a
 * single {@link AdminTenantsPage} from it.
 */
export interface AdminDashboardSweep {
  generatedAt: string;
  summary: AdminDashboardSummary;
  health: AdminHealthStatus;
  /** ALL teams, newest first. */
  tenants: AdminTenantRecord[];
  recentRegistrations: AdminTenantRecord[];
}

/**
 * Server-side tenant filter vocabulary, mirroring the status `<select>` in
 * `components/admin/AdminTenantTable.tsx` (plus `cancelled`, which the status
 * badge already renders).
 */
export const ADMIN_TENANT_STATUS_FILTERS = [
  'all',
  'active',
  'trial',
  'expired',
  'cancelled',
  'linked',
  'unlinked',
] as const;

export type AdminTenantStatusFilter =
  (typeof ADMIN_TENANT_STATUS_FILTERS)[number];

export const isAdminTenantStatusFilter = (
  value: unknown
): value is AdminTenantStatusFilter =>
  typeof value === 'string' &&
  (ADMIN_TENANT_STATUS_FILTERS as readonly string[]).includes(value);

/** `pageSize` bounds accepted by `GET /api/admin/dashboard`. */
export const ADMIN_DASHBOARD_MIN_PAGE_SIZE = 10;
export const ADMIN_DASHBOARD_MAX_PAGE_SIZE = 100;
export const ADMIN_DASHBOARD_DEFAULT_PAGE_SIZE = 25;

/** Upper bound for the `search` query parameter. */
export const ADMIN_DASHBOARD_MAX_SEARCH_LENGTH = 100;

/** Validated query parameters for the paginated tenant list. */
export interface AdminDashboardQuery {
  page: number;
  pageSize: number;
  search: string;
  status: AdminTenantStatusFilter;
}

/** Upper bound for ERP-provided free text echoed back to the client. */
const MAX_ECHOED_TEXT = 120;

/**
 * Parses an ERP datetime into an ISO-8601 UTC string.
 *
 * Two deliberate behaviours:
 *
 * 1. **Offset-less values are treated as UTC.** The .NET WebAPI frequently
 *    serializes datetimes without a zone designator (`2026-10-01T00:00:00`).
 *    ECMAScript parses date-*time* forms without an offset as *local* time, so
 *    the same payload would classify as `active` on a UTC server and `expired`
 *    on an Asia/Riyadh one. Pinning to UTC keeps classification server-
 *    independent (plan rule: "use UTC internally"). Date-only forms
 *    (`YYYY-MM-DD`) are already UTC by spec and are left untouched.
 * 2. **Unparseable input returns `null` instead of throwing.**
 *    `new Date('garbage').toISOString()` throws `RangeError: Invalid time
 *    value`, which would abort the whole tenant row over one bad field.
 *
 * Epoch-milliseconds input is handled explicitly: `String(1727654400000)` is
 * `'1727654400000'`, which matched neither the zone nor the date-only pattern
 * and got a `'Z'` appended → `Invalid Date` → `null`. Numeric input is part of
 * the accepted signature, so it must actually work.
 */
export function toIso(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }

    const fromEpoch = new Date(value);
    return Number.isNaN(fromEpoch.getTime()) ? null : fromEpoch.toISOString();
  }

  if (typeof value !== 'string') {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const parsed = new Date(hasZone || dateOnly ? text : `${text}Z`);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Truncates ERP-provided free text before it is echoed to the client. */
function clampText(value: unknown): string | null {
  return typeof value === 'string' ? value.slice(0, MAX_ECHOED_TEXT) : null;
}

/**
 * Derives a normalized subscription status given raw status text, end date, and trial flag.
 * If endDate is in the past, it marks as expired unless already cancelled.
 */
export function deriveSubscriptionStatus(
  status?: string | null,
  endDate?: string | Date | null,
  isTrial?: boolean | null,
  now: Date = new Date()
): AdminSubscriptionStatus {
  const normalized = (status || '').toLowerCase().trim();

  if (normalized === 'cancelled' || normalized === 'canceled') {
    return 'cancelled';
  }

  if (endDate) {
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime()) && end.getTime() < now.getTime()) {
      return 'expired';
    }
  }

  if (normalized === 'expired') {
    return 'expired';
  }

  if (isTrial || normalized === 'trial' || normalized === 'trialing') {
    return 'trial';
  }

  if (normalized === 'active' || normalized === 'subscribed') {
    return 'active';
  }

  // Anything left (unknown text, or no status at all) is indeterminate.
  return 'unknown';
}

/**
 * Calculates remaining days until target end date.
 */
export function calculateDaysRemaining(
  endDate?: string | Date | null,
  now: Date = new Date()
): number | null {
  if (!endDate) {
    return null;
  }
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) {
    return null;
  }
  const diffMs = end.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
}

/**
 * Resolves the status the operator should SEE for a subscription, given the
 * derived status and the raw ERP trial flag.
 *
 * The trial flag may only PROMOTE a subscription that is still running
 * (`active`) or indeterminate (`unknown`) — it must never override a terminal
 * classification. A trial whose end date has passed derives to `expired`, and
 * `buildAdminSummary` counts that same row under "الاشتراكات المنتهية"; mapping
 * it back to `trial` here made the badge contradict the KPI card on the same
 * screen for the most routine monitoring case there is (a lapsing trial).
 *
 * Shared by `AdminSubscriptionBadge` and the tenant drill-down page so the two
 * can never drift apart again.
 */
export function resolveEffectiveSubscriptionStatus(
  status?: AdminSubscriptionStatus | null,
  isTrial?: boolean | null
): AdminSubscriptionStatus | null {
  if (!status) {
    return null;
  }

  if (isTrial && (status === 'active' || status === 'unknown')) {
    return 'trial';
  }

  return status;
}

/**
 * Accepts an ERP-supplied `daysRemaining` only when it is a FINITE number.
 *
 * `Number('soon')` is `NaN` and `Number(Infinity)` is `Infinity`; both used to
 * reach the operator as "باقي NaN يوم", because the render sites guard with
 * `typeof x === 'number'` — a guard `NaN` passes. Every other echoed ERP field
 * is normalised (`toIso` → `null`, `clampText` truncates), so this one follows
 * the same contract: anything unusable falls back to the value computed from
 * the effective end date instead of propagating junk.
 *
 * Numeric strings are accepted (`JSON` numbers from .NET arrive as numbers,
 * but a stringified int is still perfectly usable); everything else — `NaN`,
 * `Infinity`, `-Infinity`, `'soon'`, `''`, booleans, objects — is rejected.
 */
function toFiniteDaysRemaining(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Normalizes raw ERP M2M subscription API response envelope.
 *
 * Expected ERP envelopes vary between:
 * 1) { subscription: { status, startDate, endDate, extendedUntil, isTrial, package?: { name, priceMonthly } } }
 * 2) { data: { subscription: ... } }
 * 3) { status, startDate, endDate, planName }
 */
export function normalizeErpSubscription(
  raw: unknown,
  now: Date = new Date()
): AdminTenantSubscription | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const obj = raw as Record<string, any>;
  const payload = obj.subscription || obj.data?.subscription || obj.data || obj;

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const rawStatus = clampText(payload.status);
  const isTrial = Boolean(
    payload.isTrial ??
    payload.trial ??
    (rawStatus?.toLowerCase().includes('trial') || false)
  );

  const startDate = toIso(payload.startDate);
  const endDate = toIso(payload.endDate);
  const extendedUntil = toIso(payload.extendedUntil);

  // Use extendedUntil as effective end date if provided
  const effectiveEndDate = extendedUntil || endDate;

  const status = deriveSubscriptionStatus(
    rawStatus,
    effectiveEndDate,
    isTrial,
    now
  );
  const daysRemaining =
    toFiniteDaysRemaining(payload.daysRemaining) ??
    calculateDaysRemaining(effectiveEndDate, now);

  const pkg = payload.package || obj.package || {};
  const planName = clampText(
    pkg.name ||
      payload.packageName ||
      payload.planName ||
      (typeof payload.plan === 'string' ? payload.plan : null)
  );
  const priceMonthly =
    typeof pkg.priceMonthly === 'number'
      ? pkg.priceMonthly
      : typeof payload.priceMonthly === 'number'
        ? payload.priceMonthly
        : null;

  return {
    status,
    rawStatus,
    isTrial,
    planName,
    priceMonthly,
    startDate,
    endDate: effectiveEndDate,
    extendedUntil,
    daysRemaining,
  };
}
