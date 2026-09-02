/*
 * Shared dashboard types + pure helpers.
 *
 * The payload travels over the wire as JSON, so every Date is serialized to
 * an ISO string here. Restricted sections are `null` instead of zeros when
 * the caller lacks the corresponding permission (see models/dashboard.ts).
 */

export type DashboardRoleCount = {
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  count: number;
};

export type DashboardMember = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  createdAt: string;
};

export type DashboardApiKey = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

export type DashboardSubscription = {
  planName: string | null;
  startDate: string;
  endDate: string;
};

export type DashboardErp = {
  linked: boolean;
  tenantId: string | null;
  subdomain: string | null;
  linkedAt: string | null;
};

export type DashboardGrowthPoint = {
  /** Calendar month in `YYYY-MM` (local time). */
  month: string;
  count: number;
};

export type DashboardPayload = {
  teamName: string;
  teamSlug: string;
  memberCount: number | null;
  memberRoleCounts: DashboardRoleCount[] | null;
  memberGrowth: DashboardGrowthPoint[] | null;
  pendingInvitationsCount: number | null;
  apiKeysCount: number | null;
  recentApiKeys: DashboardApiKey[] | null;
  recentMembers: DashboardMember[] | null;
  serviceCount: number;
  planCount: number;
  activeSubscription: DashboardSubscription | null;
  erp: DashboardErp;
};

/** `YYYY-MM` key of a Date's calendar month (local time). */
export const monthKey = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Build a zero-filled series of the last `months` calendar months (oldest →
 * newest) from member `createdAt` dates, ignoring dates outside the window.
 */
export const buildMemberGrowth = (
  createdAts: Date[],
  months = 6,
  now = new Date()
): DashboardGrowthPoint[] => {
  const buckets = new Map<string, number>();

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(monthKey(date), 0);
  }

  for (const createdAt of createdAts) {
    const key = monthKey(new Date(createdAt));
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
  }

  return Array.from(buckets.entries()).map(([month, count]) => ({
    month,
    count,
  }));
};

/**
 * Aggregate member roles in a stable order (OWNER, ADMIN, MEMBER), skipping
 * roles that have no members so charts never render empty series.
 */
export const buildRoleCounts = (roles: string[]): DashboardRoleCount[] => {
  const order: DashboardRoleCount['role'][] = ['OWNER', 'ADMIN', 'MEMBER'];
  const counts = new Map<string, number>();

  for (const role of roles) {
    counts.set(role, (counts.get(role) || 0) + 1);
  }

  return order.flatMap((role) => {
    const count = counts.get(role) || 0;
    return count > 0 ? [{ role, count }] : [];
  });
};
