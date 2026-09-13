import {
  deriveSubscriptionStatus,
  calculateDaysRemaining,
  normalizeErpSubscription,
  resolveEffectiveSubscriptionStatus,
  toIso,
} from '../../models/adminDashboard';
import {
  ADMIN_DASHBOARD_SWEEP_TTL_MS,
  DEFAULT_ADMIN_DASHBOARD_QUERY,
  buildAdminSummary,
  filterAdminTenants,
  getAdminDashboardData,
  getAdminDashboardSweep,
  getAdminTenantById,
  paginateAdminTenants,
  parseAdminDashboardQuery,
  probeErpHealth,
  resetAdminDashboardCache,
} from '../../lib/adminDashboard';
import { prisma } from '../../lib/prisma';
import { erp } from '../../lib/erp';
import { ApiError } from '../../lib/errors';

jest.mock('../../lib/prisma', () => ({
  prisma: {
    team: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../lib/env', () => ({
  __esModule: true,
  default: {
    erp: {
      apiUrl: 'https://erp.example.test/api',
      platformApiKey: 'platform-api-key',
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

  describe('toIso', () => {
    it('handles numeric epoch milliseconds explicitly', () => {
      // Regression: `String(1727654400000)` matched neither the zone nor the
      // date-only pattern, so the old code produced `new Date('1727654400000Z')`
      // → Invalid Date → null, silently dropping a supported input type.
      expect(toIso(1727654400000)).toBe('2024-09-30T00:00:00.000Z');
      expect(toIso(0)).toBe('1970-01-01T00:00:00.000Z');
    });

    it('returns null for non-finite numbers', () => {
      expect(toIso(Number.NaN)).toBeNull();
      expect(toIso(Infinity)).toBeNull();
      expect(toIso(-Infinity)).toBeNull();
    });

    it('keeps the offset-less-string and date-only behaviours unchanged', () => {
      expect(toIso('2026-10-01T00:00:00')).toBe('2026-10-01T00:00:00.000Z');
      expect(toIso('2026-10-01')).toBe('2026-10-01T00:00:00.000Z');
      expect(toIso('2026-10-01T00:00:00Z')).toBe('2026-10-01T00:00:00.000Z');
      expect(toIso('garbage')).toBeNull();
      expect(toIso('')).toBeNull();
      expect(toIso(null)).toBeNull();
      expect(toIso(undefined)).toBeNull();
      expect(toIso({})).toBeNull();
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

    it('falls back to the computed days when ERP sends garbage', () => {
      // Regression (F-B): `Number('soon')` is NaN and `Number(Infinity)` is
      // Infinity, and both render sites guard with `typeof x === 'number'` — a
      // guard NaN passes — so "باقي NaN يوم" reached the operator.
      const endDate = '2026-09-20T12:00:00Z'; // exactly 10 days after NOW

      for (const daysRemaining of [
        'soon',
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        'Infinity',
        '',
        true,
        {},
      ]) {
        const result = normalizeErpSubscription(
          { subscription: { status: 'Active', endDate, daysRemaining } },
          NOW
        );

        expect(result?.daysRemaining).toBe(10);
        expect(Number.isFinite(result?.daysRemaining as number)).toBe(true);
      }
    });

    it('keeps a finite ERP-provided daysRemaining, including 0', () => {
      const withNumber = normalizeErpSubscription(
        {
          subscription: {
            status: 'Active',
            endDate: '2026-09-20T12:00:00Z',
            daysRemaining: 3,
          },
        },
        NOW
      );
      expect(withNumber?.daysRemaining).toBe(3);

      // 0 is falsy but perfectly valid — it must NOT be replaced by the
      // computed value.
      const withZero = normalizeErpSubscription(
        {
          subscription: {
            status: 'Expired',
            endDate: '2026-12-20T12:00:00Z',
            daysRemaining: 0,
          },
        },
        NOW
      );
      expect(withZero?.daysRemaining).toBe(0);

      // A numeric string is still usable (some ERP serializers emit it).
      const withString = normalizeErpSubscription(
        {
          subscription: {
            status: 'Active',
            endDate: '2026-09-20T12:00:00Z',
            daysRemaining: '7',
          },
        },
        NOW
      );
      expect(withString?.daysRemaining).toBe(7);
    });

    it('yields null daysRemaining when the end date is unusable too', () => {
      const result = normalizeErpSubscription(
        { subscription: { status: 'Active', daysRemaining: 'soon' } },
        NOW
      );

      expect(result?.daysRemaining).toBeNull();
    });
  });

  describe('resolveEffectiveSubscriptionStatus', () => {
    it('never lets the trial flag override a terminal status', () => {
      expect(resolveEffectiveSubscriptionStatus('expired', true)).toBe(
        'expired'
      );
      expect(resolveEffectiveSubscriptionStatus('cancelled', true)).toBe(
        'cancelled'
      );
    });

    it('promotes a running or indeterminate subscription to trial', () => {
      expect(resolveEffectiveSubscriptionStatus('active', true)).toBe('trial');
      expect(resolveEffectiveSubscriptionStatus('unknown', true)).toBe('trial');
      expect(resolveEffectiveSubscriptionStatus('trial', true)).toBe('trial');
      // `trialing` text with no isTrial flag also stays trial.
      expect(resolveEffectiveSubscriptionStatus('trial', false)).toBe('trial');
    });

    it('leaves non-trial and absent statuses untouched', () => {
      expect(resolveEffectiveSubscriptionStatus('active', false)).toBe(
        'active'
      );
      expect(resolveEffectiveSubscriptionStatus('expired', false)).toBe(
        'expired'
      );
      expect(resolveEffectiveSubscriptionStatus(null, true)).toBeNull();
      expect(resolveEffectiveSubscriptionStatus(undefined, true)).toBeNull();
    });

    it('AGREES with buildAdminSummary for a lapsed trial (the real guard)', () => {
      // The bug was a contradiction on ONE screen: the summary counted this row
      // as expired while the badge said "تجريبي".
      const lapsedTrial = normalizeErpSubscription(
        {
          subscription: {
            status: 'Trialing',
            isTrial: true,
            endDate: '2026-09-01T00:00:00Z', // before NOW
            package: { name: 'Trial' },
          },
        },
        NOW
      );

      expect(lapsedTrial?.status).toBe('expired');
      expect(lapsedTrial?.isTrial).toBe(true);

      const record: any = {
        erpTenantId: 'tenant-1',
        subscription: lapsedTrial,
      };
      const summary = buildAdminSummary([record]);

      expect(summary.expiredSubscriptions).toBe(1);
      expect(summary.trialSubscriptions).toBe(0);
      expect(
        resolveEffectiveSubscriptionStatus(
          lapsedTrial?.status,
          lapsedTrial?.isTrial
        )
      ).toBe('expired');
    });
  });
});

describe('Admin Dashboard Service & Queries', () => {
  const NOW = new Date('2026-09-10T12:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    // The sweep cache is module-level state: without this reset a payload from
    // one test would be served to the next (`ADMIN_DASHBOARD_SWEEP_TTL_MS`).
    resetAdminDashboardCache();
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

    it('probes a genuinely public ERP endpoint (P2.17 regression guard)', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 });

      await probeErpHealth();

      expect(fetch).toHaveBeenCalledWith(
        'https://erp.example.test/api/platform/TenantRegistration/catalog/packages',
        expect.objectContaining({ method: 'GET' })
      );
      // `/payments/methods` requires auth (P2.17 86cbcq7g2) — probing it made
      // every health check report a bogus http-401 and pinned the admin health
      // card to a permanent amber false alarm.
      expect(fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/payments/methods'),
        expect.anything()
      );
    });

    it('reports a reachable-but-erroring ERP with the real status code', async () => {
      // The distinction the health card depends on: reachable ⇒ amber, down ⇒
      // red. A 401 must only ever come from a genuinely auth-walled route.
      (fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });

      const health = await probeErpHealth();

      expect(health).toEqual({
        ok: false,
        reachable: true,
        latencyMs: expect.any(Number),
        statusCode: 401,
        error: 'http-401',
      });
    });

    it('reports a timeout when the probe is aborted', async () => {
      const timeoutErr: any = new Error('aborted');
      timeoutErr.name = 'TimeoutError';
      (fetch as jest.Mock).mockRejectedValueOnce(timeoutErr);

      const health = await probeErpHealth();

      expect(health.ok).toBe(false);
      expect(health.reachable).toBe(false);
      expect(health.error).toBe('timeout');
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

      const dashboard = await getAdminDashboardData(
        DEFAULT_ADMIN_DASHBOARD_QUERY,
        NOW
      );

      expect(dashboard.summary.totalTeams).toBe(2);
      expect(dashboard.summary.linkedTeams).toBe(1);
      expect(dashboard.summary.activeSubscriptions).toBe(1);
      expect(dashboard.health.ok).toBe(true);
      expect(dashboard.tenants.items).toHaveLength(2);
      expect(dashboard.tenants.page).toBe(1);
      expect(dashboard.tenants.pageSize).toBe(25);
      expect(dashboard.tenants.total).toBe(2);
      expect(dashboard.tenants.totalPages).toBe(1);
      expect(dashboard.tenants.items[0].name).toBe('Acme Corp');
      expect(dashboard.tenants.items[0].subscription?.planName).toBe(
        'Standard'
      );
      expect(dashboard.tenants.items[1].subscription).toBeNull();
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

      const dashboard = await getAdminDashboardData(
        DEFAULT_ADMIN_DASHBOARD_QUERY,
        NOW
      );

      expect(dashboard.health.ok).toBe(false);
      expect(dashboard.tenants.items[0].erpReachable).toBe(false);
      expect(dashboard.tenants.items[0].error).toBe('erp-unavailable');
      expect(dashboard.summary.totalTeams).toBe(1);
    });

    it('passes an abort signal so a stalled ERP read is cancelled, not just raced', async () => {
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
      (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 });

      let receivedSignal: AbortSignal | undefined;
      (erp.getTenantBillingSubscription as jest.Mock).mockImplementationOnce(
        (_apiKey: string, _tenantId: string, signal?: AbortSignal) => {
          receivedSignal = signal;
          // A stalled ERP: the request only settles when it is ABORTED. Without
          // the signal this promise would stay pending forever.
          return new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              const abortError: any = new Error('The operation was aborted.');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          });
        }
      );

      const dashboard = await getAdminDashboardData(
        DEFAULT_ADMIN_DASHBOARD_QUERY,
        NOW
      );

      expect(receivedSignal).toBeInstanceOf(AbortSignal);
      expect(erp.getTenantBillingSubscription).toHaveBeenCalledWith(
        'platform-api-key',
        'tenant-123',
        expect.any(AbortSignal)
      );
      // The in-flight request is cancelled at the row deadline…
      expect(receivedSignal?.aborted).toBe(true);
      // …and the row is still classified as a TIMEOUT, not a generic outage.
      expect(dashboard.tenants.items[0].erpReachable).toBe(false);
      expect(dashboard.tenants.items[0].error).toBe('erp-timeout');
    }, 15000);

    it('falls back to the race sentinel when a stalled read ignores the signal', async () => {
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
      (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 });
      // Never settles, never rejects — only the race can rescue the request.
      (erp.getTenantBillingSubscription as jest.Mock).mockImplementationOnce(
        () => new Promise(() => {})
      );

      const dashboard = await getAdminDashboardData(
        DEFAULT_ADMIN_DASHBOARD_QUERY,
        NOW
      );

      expect(dashboard.tenants.items[0].erpReachable).toBe(false);
      expect(dashboard.tenants.items[0].error).toBe('erp-timeout');
    }, 15000);

    it('coalesces concurrent sweeps into one team scan + ERP sweep', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Acme Corp',
          slug: 'acme',
          domain: null,
          erpTenantId: 'tenant-123',
          erpSubdomain: 'acme',
          erpLinkedAt: null,
          createdAt: new Date('2026-09-01'),
          _count: { members: 1 },
        },
      ];

      (prisma.team.findMany as jest.Mock).mockResolvedValue(mockTeams);
      (fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
      (erp.getTenantBillingSubscription as jest.Mock).mockResolvedValue({
        subscription: { status: 'Active' },
      });

      // Overlapping refreshes (slow sweep + focus revalidate + a second tab)
      // must not each launch their own full ERP read storm.
      const [first, second] = await Promise.all([
        getAdminDashboardData(DEFAULT_ADMIN_DASHBOARD_QUERY, NOW),
        getAdminDashboardData(DEFAULT_ADMIN_DASHBOARD_QUERY, NOW),
        getAdminDashboardData(DEFAULT_ADMIN_DASHBOARD_QUERY, NOW),
      ]);

      expect(prisma.team.findMany).toHaveBeenCalledTimes(1);
      expect(erp.getTenantBillingSubscription).toHaveBeenCalledTimes(1);
      // Both callers see the same sweep data. (The payload object itself is
      // rebuilt per call — the expensive, de-duplicated artefact is the sweep.)
      expect(first.tenants.items).toEqual(second.tenants.items);
      expect(first.generatedAt).toBe(second.generatedAt);
    });

    it('serves further requests from the TTL cache and re-sweeps once it expires', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Acme Corp',
          slug: 'acme',
          domain: null,
          erpTenantId: 'tenant-123',
          erpSubdomain: 'acme',
          erpLinkedAt: null,
          createdAt: new Date('2026-09-01'),
          _count: { members: 1 },
        },
      ];

      (prisma.team.findMany as jest.Mock).mockResolvedValue(mockTeams);
      (fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
      (erp.getTenantBillingSubscription as jest.Mock).mockResolvedValue({
        subscription: { status: 'Active' },
      });

      const t0 = 1_700_000_000_000;
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);

      try {
        const firstSweep = await getAdminDashboardSweep(NOW);
        expect(prisma.team.findMany).toHaveBeenCalledTimes(1);

        // Same cached object, not a re-built one.
        expect(await getAdminDashboardSweep(NOW)).toBe(firstSweep);
        expect(prisma.team.findMany).toHaveBeenCalledTimes(1);

        // Page 2 one millisecond before the TTL lapses: cached, no new sweep.
        nowSpy.mockReturnValue(t0 + ADMIN_DASHBOARD_SWEEP_TTL_MS - 1);
        await getAdminDashboardData(
          { ...DEFAULT_ADMIN_DASHBOARD_QUERY, page: 2 },
          NOW
        );
        expect(prisma.team.findMany).toHaveBeenCalledTimes(1);
        expect(erp.getTenantBillingSubscription).toHaveBeenCalledTimes(1);

        // Exactly at the TTL the entry is stale again → fresh sweep.
        nowSpy.mockReturnValue(t0 + ADMIN_DASHBOARD_SWEEP_TTL_MS);
        const expiredSweep = await getAdminDashboardSweep(NOW);
        expect(prisma.team.findMany).toHaveBeenCalledTimes(2);
        expect(expiredSweep).not.toBe(firstSweep);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('resetAdminDashboardCache clears the cached sweep (test isolation)', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Acme Corp',
          slug: 'acme',
          domain: null,
          erpTenantId: null,
          erpSubdomain: null,
          erpLinkedAt: null,
          createdAt: new Date('2026-09-01'),
          _count: { members: 1 },
        },
      ];

      (prisma.team.findMany as jest.Mock).mockResolvedValue(mockTeams);
      (fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

      await getAdminDashboardData(DEFAULT_ADMIN_DASHBOARD_QUERY, NOW);
      await getAdminDashboardData(DEFAULT_ADMIN_DASHBOARD_QUERY, NOW);
      expect(prisma.team.findMany).toHaveBeenCalledTimes(1);

      // Without this reset a test would observe the previous test's payload —
      // the exact failure mode that made a TTL cache unacceptable before.
      resetAdminDashboardCache();

      await getAdminDashboardData(DEFAULT_ADMIN_DASHBOARD_QUERY, NOW);
      expect(prisma.team.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('parseAdminDashboardQuery', () => {
    const expectInvalid = (raw: Record<string, unknown>, message: string) => {
      let caught: unknown;
      try {
        parseAdminDashboardQuery(raw);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ApiError);
      // 422 is this route family's "invalid query input" code (400 is reserved
      // for malformed bodies) — see pages/api/admin/tenants/[teamId].ts.
      expect((caught as ApiError).status).toBe(422);
      expect((caught as Error).message).toBe(message);
    };

    it('applies the documented defaults when nothing is supplied', () => {
      expect(parseAdminDashboardQuery()).toEqual({
        page: 1,
        pageSize: 25,
        search: '',
        status: 'all',
      });
      expect(parseAdminDashboardQuery({})).toEqual(
        DEFAULT_ADMIN_DASHBOARD_QUERY
      );
    });

    it('accepts valid values, including the inclusive pageSize bounds', () => {
      expect(
        parseAdminDashboardQuery({
          page: '3',
          pageSize: '10',
          search: '  acme  ',
          status: 'trial',
        })
      ).toEqual({ page: 3, pageSize: 10, search: 'acme', status: 'trial' });

      expect(parseAdminDashboardQuery({ pageSize: '100' }).pageSize).toBe(100);
      expect(parseAdminDashboardQuery({ pageSize: '25' }).pageSize).toBe(25);

      // Empty form fields are "absent", not "unknown".
      expect(
        parseAdminDashboardQuery({ status: '', search: '' })
      ).toMatchObject({ status: 'all', search: '' });
    });

    it('rejects an invalid page with 422', () => {
      for (const page of ['0', '-1', 'abc', '1.5', '1e2', 'NaN']) {
        expectInvalid({ page }, 'Invalid page parameter');
      }

      // Repeated parameters arrive as an array from Next.js.
      expectInvalid({ page: ['1', '2'] }, 'Invalid page parameter');

      // A whitespace-only value is "absent", not "unknown" — it falls back to
      // the default instead of erroring on an untouched form field.
      expect(parseAdminDashboardQuery({ page: ' ' }).page).toBe(1);
    });

    it('rejects a pageSize outside 10–100 with 422', () => {
      for (const pageSize of ['0', '9', '101', '1000', 'abc', '10.5', '-25']) {
        expectInvalid({ pageSize }, 'Invalid pageSize parameter');
      }
    });

    it('rejects an over-long search and an unknown status with 422', () => {
      expectInvalid({ search: 'x'.repeat(101) }, 'Invalid search parameter');
      {
        const maxLength = parseAdminDashboardQuery({ search: 'x'.repeat(100) });
        expect(maxLength.search).toHaveLength(100);
      }

      expectInvalid({ status: 'bogus' }, 'Invalid status parameter');
      expectInvalid({ status: ['all', 'trial'] }, 'Invalid status parameter');
    });

    it('accepts every documented status filter', () => {
      for (const status of [
        'all',
        'active',
        'trial',
        'expired',
        'cancelled',
        'linked',
        'unlinked',
      ]) {
        expect(parseAdminDashboardQuery({ status }).status).toBe(status);
      }
    });
  });

  describe('paginated tenant rows (server-side paging + filtering)', () => {
    /** 30 linked teams, each with a deterministic subscription status. */
    const buildTeams = (count: number) =>
      Array.from({ length: count }, (_, index) => {
        const n = index + 1;
        return {
          id: `team-${n}`,
          name: `شركة ${n}`,
          slug: `team-${n}`,
          domain: null,
          // Team 1 is deliberately unlinked so the linked/unlinked filters have
          // something to discriminate.
          erpTenantId: n === 1 ? null : `erp-${n}`,
          erpSubdomain: n === 1 ? null : `team-${n}`,
          erpLinkedAt: null,
          createdAt: new Date(Date.UTC(2026, 7, 1) + index * 86_400_000),
          _count: { members: n },
        };
      });

    /** One subscription envelope per tenant id (30th team is in trial). */
    const subscriptionsByTenant: Record<string, unknown> = {};
    for (let n = 2; n <= 30; n++) {
      subscriptionsByTenant[`erp-${n}`] =
        n === 30
          ? { subscription: { status: 'Trialing', isTrial: true } }
          : n % 2 === 0
            ? { subscription: { status: 'Active' } }
            : { subscription: { status: 'Cancelled' } };
    }

    beforeEach(() => {
      (prisma.team.findMany as jest.Mock).mockResolvedValue(buildTeams(30));
      (fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
      (erp.getTenantBillingSubscription as jest.Mock).mockImplementation(
        (_apiKey: string, tenantId: string) =>
          Promise.resolve(subscriptionsByTenant[tenantId] ?? null)
      );
    });

    it('returns disjoint, correctly-metadated pages', async () => {
      const page1 = await getAdminDashboardData(
        { page: 1, pageSize: 10, search: '', status: 'all' },
        NOW
      );
      const page2 = await getAdminDashboardData(
        { page: 2, pageSize: 10, search: '', status: 'all' },
        NOW
      );

      expect(page1.tenants.items).toHaveLength(10);
      expect(page2.tenants.items).toHaveLength(10);
      expect(page1.tenants).toMatchObject({
        page: 1,
        pageSize: 10,
        total: 30,
        totalPages: 3,
      });
      expect(page2.tenants).toMatchObject({
        page: 2,
        pageSize: 10,
        total: 30,
        totalPages: 3,
      });

      const ids1 = page1.tenants.items.map((tenant) => tenant.id);
      const ids2 = page2.tenants.items.map((tenant) => tenant.id);

      // Disjoint AND contiguous: page 2 starts where page 1 ended.
      expect(ids1.filter((id) => ids2.includes(id))).toEqual([]);
      expect(ids1[0]).toBe('team-1');
      expect(ids1[9]).toBe('team-10');
      expect(ids2[0]).toBe('team-11');
    });

    it('caps the shipped page at pageSize and defaults to 25', async () => {
      const defaulted = await getAdminDashboardData(
        DEFAULT_ADMIN_DASHBOARD_QUERY,
        NOW
      );
      expect(defaulted.tenants.pageSize).toBe(25);
      expect(defaulted.tenants.items).toHaveLength(25);
      expect(defaulted.tenants.totalPages).toBe(2);

      const lastPage = await getAdminDashboardData(
        { ...DEFAULT_ADMIN_DASHBOARD_QUERY, page: 2 },
        NOW
      );
      expect(lastPage.tenants.items).toHaveLength(5);
    });

    it('returns an empty page with correct metadata past the end', async () => {
      const beyond = await getAdminDashboardData(
        { page: 4, pageSize: 10, search: '', status: 'all' },
        NOW
      );

      expect(beyond.tenants.items).toEqual([]);
      expect(beyond.tenants).toMatchObject({
        page: 4,
        pageSize: 10,
        total: 30,
        totalPages: 3,
      });
      // The GLOBAL summary is unaffected by the page being out of range.
      expect(beyond.summary.totalTeams).toBe(30);
    });

    it('narrows search across the WHOLE dataset, not just the current page', async () => {
      // `team-27` lives on page 3; filtering client-side over page 1 would
      // report "no results" for it.
      const found = await getAdminDashboardData(
        { page: 1, pageSize: 10, search: 'team-27', status: 'all' },
        NOW
      );

      expect(found.tenants.total).toBe(1);
      expect(found.tenants.totalPages).toBe(1);
      expect(found.tenants.items.map((tenant) => tenant.id)).toEqual([
        'team-27',
      ]);
    });

    it('narrows status/linked filters across the whole dataset', async () => {
      const trial = await getAdminDashboardData(
        { page: 1, pageSize: 10, search: '', status: 'trial' },
        NOW
      );
      expect(trial.tenants.total).toBe(1);
      expect(trial.tenants.items[0].id).toBe('team-30');

      const unlinked = await getAdminDashboardData(
        { page: 1, pageSize: 10, search: '', status: 'unlinked' },
        NOW
      );
      expect(unlinked.tenants.total).toBe(1);
      expect(unlinked.tenants.items[0].id).toBe('team-1');

      const linked = await getAdminDashboardData(
        { page: 1, pageSize: 10, search: '', status: 'linked' },
        NOW
      );
      expect(linked.tenants.total).toBe(29);
      expect(linked.tenants.totalPages).toBe(3);

      const cancelled = await getAdminDashboardData(
        { page: 1, pageSize: 10, search: '', status: 'cancelled' },
        NOW
      );
      expect(cancelled.tenants.total).toBe(14);
    });

    it('keeps the summary GLOBAL no matter which page/filter is requested', async () => {
      const filtered = await getAdminDashboardData(
        { page: 2, pageSize: 10, search: 'team-3', status: 'linked' },
        NOW
      );

      expect(filtered.summary.totalTeams).toBe(30);
      expect(filtered.summary.linkedTeams).toBe(29);
      expect(filtered.tenants.total).toBeLessThan(30);
      // Recent registrations are platform-wide, not page-scoped.
      expect(filtered.recentRegistrations).toHaveLength(5);
    });

    it('reuses the cached sweep across pages (one ERP sweep for many pages)', async () => {
      await getAdminDashboardData(
        { page: 1, pageSize: 10, search: '', status: 'all' },
        NOW
      );
      await getAdminDashboardData(
        { page: 2, pageSize: 10, search: '', status: 'all' },
        NOW
      );
      await getAdminDashboardData(
        { page: 3, pageSize: 10, search: 'x', status: 'all' },
        NOW
      );

      expect(prisma.team.findMany).toHaveBeenCalledTimes(1);
      expect(erp.getTenantBillingSubscription).toHaveBeenCalledTimes(29);
    });
  });

  describe('filterAdminTenants / paginateAdminTenants', () => {
    const tenant = (overrides: Record<string, unknown>) =>
      ({
        id: 'team-1',
        name: 'Acme Corp',
        slug: 'acme',
        erpTenantId: 'erp-1',
        erpSubdomain: 'acme',
        subscription: null,
        erpReachable: true,
        createdAt: '2026-09-01T00:00:00.000Z',
        memberCount: 1,
        ...overrides,
      }) as any;

    it('never matches a status filter for a tenant with no subscription', () => {
      const rows = [tenant({ subscription: null })];

      expect(
        filterAdminTenants(rows, { search: '', status: 'active' })
      ).toEqual([]);
      expect(
        filterAdminTenants(rows, { search: '', status: 'unlinked' })
      ).toHaveLength(0);
      expect(
        filterAdminTenants(rows, { search: '', status: 'linked' })
      ).toHaveLength(1);
    });

    it('matches the ERP subdomain and tenant id, not only name+slug', () => {
      const rows = [tenant({ name: 'شركة الأفق', slug: 'alofoq' })];

      expect(
        filterAdminTenants(rows, { search: 'alofoq', status: 'all' })
      ).toHaveLength(1);
      expect(
        filterAdminTenants(rows, { search: 'erp-', status: 'all' })
      ).toHaveLength(1);
      expect(
        filterAdminTenants(rows, { search: 'الأفق', status: 'all' })
      ).toHaveLength(1);
      expect(
        filterAdminTenants(rows, { search: 'nope', status: 'all' })
      ).toHaveLength(0);
    });

    it('reports totalPages 1 for an empty dataset', () => {
      expect(paginateAdminTenants([], 1, 25)).toEqual({
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 1,
      });
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
