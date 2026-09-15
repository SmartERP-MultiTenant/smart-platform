interface AdminRevenueSubscription {
  teamId?: string;
  tenantId: string | null;
  tenantName: string;
  subdomain: string | null;
  planName: string | null;
  priceMonthly: number | null;
  status: 'Active' | 'Trial' | 'Expired' | string;
  isTrial: boolean;
  endDate: string | null;
  endDateFormatted?: string | null;
}

interface AdminTrialExpiration {
  teamId?: string;
  tenantId?: string | null;
  tenantName: string;
  subdomain?: string | null;
  endDate: string;
  endDateFormatted: string;
  daysRemaining: number;
}

export interface AdminRevenuePayload {
  generatedAt: string;
  source: 'erp-aggregate' | 'erp-per-tenant';
  ok: boolean;
  error?: string;
  counts: {
    active: number;
    trial: number;
    expired: number;
    total: number;
  };
  mrr: number;
  subscriptions: AdminRevenueSubscription[];
  trialExpirations: AdminTrialExpiration[];
}

export function formatKsaDate(
  dateIso: string | Date | null | undefined
): string | null {
  if (!dateIso) return null;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return null;
  // `calendar: 'gregory'` is pinned explicitly instead of relying on the
  // ICU/CLDR default calendar for `ar-SA`, which is not guaranteed across
  // runtimes/ICU versions. Revenue dates must render on the Gregorian
  // calendar to stay consistent with the ERP UI (pages/teams/[slug]/erp.tsx)
  // and the transactional emails (lib/email/utils.ts).
  return d.toLocaleDateString('ar-SA', {
    timeZone: 'Asia/Riyadh',
    calendar: 'gregory',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function calculateDaysRemaining(
  endDateIso: string | Date | null | undefined,
  now: Date = new Date()
): number {
  if (!endDateIso) return 0;
  const end = new Date(endDateIso).getTime();
  const diff = end - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function deriveSubscriptionStatus(
  rawStatus: string | undefined,
  isTrial: boolean | undefined,
  endDate: string | null | undefined,
  now: Date = new Date()
): {
  status: 'Active' | 'Trial' | 'Expired' | string;
  isExpired: boolean;
  isTrial: boolean;
} {
  const isTrialEffective = Boolean(
    isTrial || rawStatus?.toLowerCase() === 'trial'
  );

  if (endDate) {
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime()) && end.getTime() < now.getTime()) {
      return { status: 'Expired', isExpired: true, isTrial: isTrialEffective };
    }
  }

  if (isTrialEffective) {
    return { status: 'Trial', isExpired: false, isTrial: true };
  }

  const normalized = rawStatus || 'Active';
  if (normalized.toLowerCase() === 'active') {
    return { status: 'Active', isExpired: false, isTrial: false };
  }

  return { status: normalized, isExpired: false, isTrial: false };
}

/**
 * Resolves the `source` label recorded on an `AdminRevenuePayload`.
 *
 * P5.7 acceptance requires the data-source switch to be isolated to this file,
 * so this is the single place that knows how a source maps onto the payload.
 *
 * Today only the M2M aggregate endpoint (`GET /platform/billing/subscriptions`
 * via `erp.listSubscriptionsM2M`) is wired in `pages/api/admin/revenue.ts`, so
 * the caller passes no mode and the payload is labelled `erp-aggregate`.
 * `erp-per-tenant` is the documented fallback (see the ticket: per-tenant M2M
 * reads via `erp.getTenantBillingSubscription`), and is NOT produced today
 * because no per-tenant sweep is wired and no super-admin token is configured
 * (`lib/env.ts` exposes only `erp.platformApiKey`). Do not assume the revenue
 * view ever emits it until a caller passes 'per-tenant'.
 */
export const resolveRevenueSource = (
  mode?: string
): AdminRevenuePayload['source'] =>
  mode === 'per-tenant' ? 'erp-per-tenant' : 'erp-aggregate';

export function aggregateRevenueData(
  rawData: unknown,
  source: 'erp-aggregate' | 'erp-per-tenant' = 'erp-aggregate',
  now: Date = new Date()
): AdminRevenuePayload {
  // Raw items array extraction
  let items: any[] = [];
  if (Array.isArray(rawData)) {
    items = rawData;
  } else if (rawData && typeof rawData === 'object') {
    const obj = rawData as Record<string, any>;
    if (Array.isArray(obj.subscriptions)) {
      items = obj.subscriptions;
    } else if (Array.isArray(obj.data)) {
      items = obj.data;
    } else if (Array.isArray(obj.items)) {
      items = obj.items;
    }
  }

  let activeCount = 0;
  let trialCount = 0;
  let expiredCount = 0;
  let mrr = 0;

  const subscriptions: AdminRevenueSubscription[] = [];
  const trialExpirationsRaw: AdminTrialExpiration[] = [];

  for (const item of items) {
    const tenantId = String(item.tenantId || item.id || '') || null;
    // Platform `Team.id`, echoed by the ERP payload when available. The
    // aggregate DTO may nest it under `subscription`, and it is absent for
    // tenants whose ERP record is not linked to a platform team — in that
    // case it stays undefined rather than being faked from `tenantId`.
    const rawTeamId = item.teamId || item.subscription?.teamId;
    const teamId = rawTeamId ? String(rawTeamId) : undefined;
    const tenantName = String(
      item.tenantName ||
        item.companyName ||
        item.name ||
        item.subdomain ||
        'منشأة'
    );
    const subdomain = item.subdomain ? String(item.subdomain) : null;
    const planName =
      item.planName || item.packageName || item.package?.name || null;
    const priceMonthly =
      typeof item.priceMonthly === 'number'
        ? item.priceMonthly
        : typeof item.price === 'number'
          ? item.price
          : null;

    const rawEndDate =
      item.endDate || item.trialEndDate || item.subscription?.endDate || null;
    const endDate = rawEndDate ? new Date(rawEndDate).toISOString() : null;

    const { status, isExpired, isTrial } = deriveSubscriptionStatus(
      item.status || item.subscription?.status,
      item.isTrial ?? item.subscription?.isTrial,
      endDate,
      now
    );

    if (isExpired) {
      expiredCount += 1;
    } else if (isTrial) {
      trialCount += 1;
      if (endDate) {
        trialExpirationsRaw.push({
          teamId,
          tenantId,
          tenantName,
          subdomain,
          endDate,
          endDateFormatted: formatKsaDate(endDate) || endDate,
          daysRemaining: calculateDaysRemaining(endDate, now),
        });
      }
    } else if (status === 'Active') {
      activeCount += 1;
      if (priceMonthly && priceMonthly > 0) {
        mrr += priceMonthly;
      }
    }

    subscriptions.push({
      teamId,
      tenantId,
      tenantName,
      subdomain,
      planName,
      priceMonthly,
      status,
      isTrial,
      endDate,
      endDateFormatted: formatKsaDate(endDate),
    });
  }

  // Sort trial expirations by nearest endDate
  trialExpirationsRaw.sort(
    (a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
  );

  return {
    generatedAt: now.toISOString(),
    source,
    ok: true,
    counts: {
      active: activeCount,
      trial: trialCount,
      expired: expiredCount,
      total: subscriptions.length,
    },
    mrr,
    subscriptions,
    trialExpirations: trialExpirationsRaw,
  };
}

export function createDegradedRevenuePayload(
  errorMsg: string = 'تعذر الاتصال بنظام فوترة الـ ERP',
  now: Date = new Date()
): AdminRevenuePayload {
  return {
    generatedAt: now.toISOString(),
    source: 'erp-aggregate',
    ok: false,
    error: errorMsg,
    counts: {
      active: 0,
      trial: 0,
      expired: 0,
      total: 0,
    },
    mrr: 0,
    subscriptions: [],
    trialExpirations: [],
  };
}
