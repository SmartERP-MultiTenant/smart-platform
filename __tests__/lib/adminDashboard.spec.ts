import {
  deriveSubscriptionStatus,
  calculateDaysRemaining,
  normalizeErpSubscription,
} from '../../models/adminDashboard';
import {
  buildAdminSummary,
  getAdminDashboardData,
  getAdminTenantById,
  probeErpHealth,
} from '../../lib/adminDashboard';
import { prisma } from '../../lib/prisma';
import { erp } from '../../lib/erp';

jest.mock('../../lib/prisma', () => ({
  prisma: {
    team: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../lib/erp', () => {
  const actual = jest.requireActual('../../lib/erp');
  return {
    ...actual,
    erp: {
      ...actual.erp,
      // Only the per-tenant billing read is stubbed. `ErpApiError` must stay
      // the REAL class: lib/adminDashboard.ts narrows ERP failures with
      // `err instanceof ErpApiError`, and a factory that dropped it would make
      // that expression throw a TypeError inside the catch block — surfacing
      // as the generic `resolution-failed` instead of `erp-unavailable`.
      getTenantBillingSubscription: jest.fn(),
    },
  };
});

global.fetch = jest.fn() as any;

describe('Admin Dashboard Models & Normalization', () => {
  const NOW = new Date('2026-09-10T12:00:00Z');

  describe('deriveSubscriptionStatus', () => {
    it('returns cancelled for cancelled or canceled status', () => {
      expect(deriveSubscriptionStatus('Cancelled', null, false, NOW)).toBe(
        'cancelled'
      );
      expect(deriveSubscriptionStatus('canceled', null, false, NOW)).toBe(
        'cancelled'
      );
    });

    it('returns expired when endDate is in the past', () => {
      const pastDate = new Date('2026-09-01T00:00:00Z');
      expect(deriveSubscriptionStatus('Active', pastDate, false, NOW)).toBe(
        'expired'
      );
    });

    it('returns trial when isTrial is true or status is trial/trialing', () => {
      const futureDate = new Date('2026-09-20T00:00:00Z');
      expect(deriveSubscriptionStatus(null, futureDate, true, NOW)).toBe(
        'trial'
      );
      expect(deriveSubscriptionStatus('trialing', futureDate, false, NOW)).toBe(
        'trial'
      );
    });

    it('returns active when active and not expired', () => {
      const futureDate = new Date('2026-09-20T00:00:00Z');
      expect(deriveSubscriptionStatus('Active', futureDate, false, NOW)).toBe(
        'active'
      );
    });

    it('returns unknown when status is null or unrecognizable without dates', () => {
      expect(deriveSubscriptionStatus(null, null, false, NOW)).toBe('unknown');
      expect(deriveSubscriptionStatus('something_else', null, false, NOW)).toBe(
        'unknown'
      );
    });
  });

  describe('calculateDaysRemaining', () => {
    it('calculates remaining days accurately', () => {
      const future = new Date('2026-09-15T12:00:00Z'); // 5 days from NOW
      expect(calculateDaysRemaining(future, NOW)).toBe(5);
    });

    it('returns 0 for dates in the past', () => {
      const past = new Date('2026-09-05T12:00:00Z');
      expect(calculateDaysRemaining(past, NOW)).toBe(0);
    });

    it('returns null for missing or invalid dates', () => {
      expect(calculateDaysRemaining(null, NOW)).toBeNull();
      expect(calculateDaysRemaining('invalid-date', NOW)).toBeNull();
    });
  });

  describe('normalizeErpSubscription', () => {
    it('normalizes standard ERP subscription envelope', () => {
      const raw = {
        subscription: {
          status: 'Active',
          startDate: '2026-09-01T00:00:00Z',
          endDate: '2026-10-01T00:00:00Z',
          isTrial: false,
          package: {
            name: 'Enterprise Gold',
            priceMonthly: 499,
          },
        },
      };

      const result = normalizeErpSubscription(raw, NOW);
      expect(result).not.toBeNull();
      expect(result?.status).toBe('active');
      expect(result?.planName).toBe('Enterprise Gold');
      expect(result?.priceMonthly).toBe(499);
      expect(result?.isTrial).toBe(false);
      expect(result?.endDate).toBe('2026-10-01T00:00:00.000Z');
    });

    it('handles nested data.subscription and extendedUntil overrides', () => {
      const raw = {
        data: {
          subscription: {
            status: 'Active',
            startDate: '2026-09-01T00:00:00Z',
            endDate: '2026-09-05T00:00:00Z',
            extendedUntil: '2026-09-25T00:00:00Z',
            isTrial: true,
            packageName: 'Pro Trial',
          },
        },
      };

      const result = normalizeErpSubscription(raw, NOW);
      expect(result?.status).toBe('trial');
      expect(result?.endDate).toBe('2026-09-25T00:00:00.000Z');
      expect(result?.planName).toBe('Pro Trial');
    });

    it('returns null for null, empty or invalid raw payload', () => {
      expect(normalizeErpSubscription(null, NOW)).toBeNull();
      expect(normalizeErpSubscription(undefined, NOW)).toBeNull();
      expect(normalizeErpSubscription('string', NOW)).toBeNull();
    });
  });
});

describe('Admin Dashboard Service & Queries', () => {
  const NOW = new Date('2026-09-10T12:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildAdminSummary', () => {
    it('computes summary numbers across tenants', () => {
      const tenants: any[] = [
        {
          erpTenantId: 't1',
          subscription: { status: 'active' },
        },
        {
          erpTenantId: 't2',
          subscription: { status: 'trial' },
        },
        {
          erpTenantId: 't3',
          subscription: { status: 'expired' },
        },
        {
          erpTenantId: null,
          subscription: null,
        },
      ];

      const summary = buildAdminSummary(tenants);
      expect(summary.totalTeams).toBe(4);
      expect(summary.linkedTeams).toBe(3);
      expect(summary.activeSubscriptions).toBe(1);
      expect(summary.trialSubscriptions).toBe(1);
      expect(summary.expiredSubscriptions).toBe(1);
    });
  });

  describe('probeErpHealth', () => {
    it('returns ok: true when ERP responds 200', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const health = await probeErpHealth();
      expect(health.ok).toBe(true);
      expect(health.reachable).toBe(true);
      expect(health.statusCode).toBe(200);
    });

    it('returns ok: false when ERP responds with non-200 status', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const health = await probeErpHealth();
      expect(health.ok).toBe(false);
      expect(health.reachable).toBe(true);
      expect(health.statusCode).toBe(503);
      expect(health.error).toBe('http-503');
    });

    it('returns unreachable when fetch rejects/times out without throwing', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Connection refused')
      );

      const health = await probeErpHealth();
      expect(health.ok).toBe(false);
      expect(health.reachable).toBe(false);
      expect(health.error).toBe('unreachable');
    });
  });

  describe('getAdminDashboardData', () => {
    it('returns full payload and resolves tenant subscriptions with allSettled', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Acme Corp',
          slug: 'acme',
          domain: 'acme.com',
          erpTenantId: 'tenant-123',
          erpSubdomain: 'acme',
          erpLinkedAt: new Date('2026-09-01'),
          createdAt: new Date('2026-09-01'),
          _count: { members: 5 },
        },
        {
          id: 'team-2',
          name: 'Unlinked Org',
          slug: 'unlinked',
          domain: null,
          erpTenantId: null,
          erpSubdomain: null,
          erpLinkedAt: null,
          createdAt: new Date('2026-09-02'),
          _count: { members: 1 },
        },
      ];

      (prisma.team.findMany as jest.Mock).mockResolvedValueOnce(mockTeams);
      (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 });
      (erp.getTenantBillingSubscription as jest.Mock).mockResolvedValueOnce({
        subscription: {
          status: 'Active',
          endDate: '2026-10-10T00:00:00Z',
          package: { name: 'Standard' },
        },
      });

      const dashboard = await getAdminDashboardData(NOW);

      expect(dashboard.summary.totalTeams).toBe(2);
      expect(dashboard.summary.linkedTeams).toBe(1);
      expect(dashboard.summary.activeSubscriptions).toBe(1);
      expect(dashboard.health.ok).toBe(true);
      expect(dashboard.tenants).toHaveLength(2);
      expect(dashboard.tenants[0].name).toBe('Acme Corp');
      expect(dashboard.tenants[0].subscription?.planName).toBe('Standard');
      expect(dashboard.tenants[1].subscription).toBeNull();
    });

    it('gracefully handles ERP failure without throwing', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Acme Corp',
          slug: 'acme',
          domain: 'acme.com',
          erpTenantId: 'tenant-123',
          erpSubdomain: 'acme',
          erpLinkedAt: new Date('2026-09-01'),
          createdAt: new Date('2026-09-01'),
          _count: { members: 3 },
        },
      ];

      (prisma.team.findMany as jest.Mock).mockResolvedValueOnce(mockTeams);
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      (erp.getTenantBillingSubscription as jest.Mock).mockRejectedValueOnce(
        new Error('ERP Down')
      );

      const dashboard = await getAdminDashboardData(NOW);

      expect(dashboard.health.ok).toBe(false);
      expect(dashboard.tenants[0].erpReachable).toBe(false);
      expect(dashboard.tenants[0].error).toBe('erp-unavailable');
      expect(dashboard.summary.totalTeams).toBe(1);
    });
  });

  describe('getAdminTenantById', () => {
    it('returns tenant when found', async () => {
      (prisma.team.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'team-1',
        name: 'Acme Corp',
        slug: 'acme',
        domain: null,
        erpTenantId: null,
        erpSubdomain: null,
        erpLinkedAt: null,
        createdAt: new Date('2026-09-01'),
        _count: { members: 2 },
      });

      const tenant = await getAdminTenantById('team-1', NOW);
      expect(tenant).not.toBeNull();
      expect(tenant?.name).toBe('Acme Corp');
    });

    it('returns null when team does not exist', async () => {
      (prisma.team.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const tenant = await getAdminTenantById('non-existent', NOW);
      expect(tenant).toBeNull();
    });
  });
});
