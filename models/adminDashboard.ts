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

export interface AdminDashboardPayload {
  generatedAt: string;
  summary: AdminDashboardSummary;
  health: AdminHealthStatus;
  tenants: AdminTenantRecord[];
  recentRegistrations: AdminTenantRecord[];
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
 */
export function toIso(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
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

  if (!status) {
    return 'unknown';
  }

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
    payload.daysRemaining !== undefined && payload.daysRemaining !== null
      ? Number(payload.daysRemaining)
      : calculateDaysRemaining(effectiveEndDate, now);

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
