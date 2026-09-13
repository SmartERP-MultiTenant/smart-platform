import dashboardHandler from 'pages/api/admin/dashboard';
import tenantByIdHandler from 'pages/api/admin/tenants/[teamId]';
import { resetAdminDashboardCache } from '@/lib/adminDashboard';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import { erp } from '@/lib/erp';

jest.mock('@/lib/guardPlatformAdmin', () => ({
  requirePlatformAdmin: jest.fn(),
}));

// The route is exercised against the REAL `lib/adminDashboard` pagination and
// validation code (prisma/env/erp are stubbed) so the assertions below cover
// the actual response contract, not a hand-written fixture that could drift.
jest.mock('@/lib/prisma', () => ({
  prisma: {
    team: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/env', () => ({
  __esModule: true,
  default: {
    erp: {
      apiUrl: 'https://erp.example.test/api',
      platformApiKey: 'platform-api-key',
    },
  },
}));

jest.mock('@/lib/erp', () => {
  const actual = jest.requireActual('@/lib/erp');
  return {
    ...actual,
    erp: {
      ...actual.erp,
      getTenantBillingSubscription: jest.fn(),
    },
  };
});

const { prisma } = jest.requireMock('@/lib/prisma');

global.fetch = jest.fn() as any;

const requirePlatformAdminMock = requirePlatformAdmin as unknown as jest.Mock;
const findManyMock = prisma.team.findMany as jest.Mock;
const findUniqueMock = prisma.team.findUnique as jest.Mock;
const billingMock = erp.getTenantBillingSubscription as jest.Mock;

const createMockReqRes = (options: {
  method?: string;
  query?: Record<string, any>;
  body?: Record<string, any>;
}) => {
  const req = {
    method: options.method || 'GET',
    query: options.query || {},
    body: options.body || {},
  } as any;

  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader: jest.fn((key, value) => {
      res.headers[key] = value;
    }),
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((data: any) => {
      res.body = data;
      return res;
    }),
    body: undefined as any,
  } as any;

  return { req, res };
};

const authorize = () =>
  requirePlatformAdminMock.mockResolvedValueOnce({
    id: 'admin-1',
    email: 'admin@example.com',
  });

const buildTeam = (n: number) => ({
  id: `team-${n}`,
  name: `شركة ${n}`,
  slug: `team-${n}`,
  domain: null,
  erpTenantId: null,
  erpSubdomain: null,
  erpLinkedAt: null,
  createdAt: new Date(Date.UTC(2026, 7, 1) + (n - 1) * 86_400_000),
  _count: { members: n },
});

describe('Admin Dashboard API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAdminDashboardCache();
    (fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });
    billingMock.mockResolvedValue({ subscription: { status: 'Active' } });
  });

  describe('GET /api/admin/dashboard', () => {
    it('returns 401 when requirePlatformAdmin rejects with 401', async () => {
      const { ApiError } = jest.requireActual('@/lib/errors');
      requirePlatformAdminMock.mockRejectedValueOnce(
        new ApiError(401, 'Unauthorized')
      );
      const { req, res } = createMockReqRes({ method: 'GET' });

      await dashboardHandler(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: { message: 'Unauthorized' } });
    });

    it('returns 403 when requirePlatformAdmin rejects with 403', async () => {
      const { ApiError } = jest.requireActual('@/lib/errors');
      requirePlatformAdminMock.mockRejectedValueOnce(
        new ApiError(403, 'Forbidden')
      );
      const { req, res } = createMockReqRes({ method: 'GET' });

      await dashboardHandler(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: { message: 'Forbidden' } });
    });

    it('returns 405 Method Not Allowed for non-GET methods', async () => {
      authorize();
      const { req, res } = createMockReqRes({ method: 'POST' });

      await dashboardHandler(req, res);

      expect(res.statusCode).toBe(405);
      expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    });

    it('returns 200 with a paginated tenants page for an authorized platform admin', async () => {
      authorize();
      findManyMock.mockResolvedValueOnce([buildTeam(1)]);

      const { req, res } = createMockReqRes({ method: 'GET' });

      await dashboardHandler(req, res);

      expect(res.statusCode).toBe(200);

      const payload = res.body.data;

      expect(payload.summary.totalTeams).toBe(1);
      expect(payload.health).toEqual(expect.objectContaining({ ok: true }));
      expect(payload.recentRegistrations).toHaveLength(1);

      // The response shape change: `tenants` is now a PAGE object, not an array.
      expect(payload.tenants).toEqual({
        items: [expect.objectContaining({ id: 'team-1', name: 'شركة 1' })],
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
      });
    });

    it('honours page/pageSize and never ships more than one page', async () => {
      authorize();
      findManyMock.mockResolvedValueOnce(
        Array.from({ length: 12 }, (_, index) => buildTeam(index + 1))
      );

      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { page: '2', pageSize: '10' },
      });

      await dashboardHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.tenants).toEqual({
        items: [
          expect.objectContaining({ id: 'team-11' }),
          expect.objectContaining({ id: 'team-12' }),
        ],
        page: 2,
        pageSize: 10,
        total: 12,
        totalPages: 2,
      });
      // The summary stays GLOBAL although only 2 rows were shipped.
      expect(res.body.data.summary.totalTeams).toBe(12);
    });

    it('returns 200 with health.ok=false when the ERP is down (never a 500)', async () => {
      authorize();
      findManyMock.mockResolvedValueOnce([buildTeam(1)]);
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { search: 'x', status: 'all' },
      });

      await dashboardHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.health.ok).toBe(false);
      expect(res.body.data.tenants.items).toEqual([]);
    });

    it.each([
      [{ page: '0' }, 'Invalid page parameter'],
      [{ page: 'abc' }, 'Invalid page parameter'],
      [{ pageSize: '9' }, 'Invalid pageSize parameter'],
      [{ pageSize: '101' }, 'Invalid pageSize parameter'],
      [{ search: 'x'.repeat(101) }, 'Invalid search parameter'],
      [{ status: 'bogus' }, 'Invalid status parameter'],
    ])('returns 422 for an invalid query %p', async (query, message) => {
      authorize();
      findManyMock.mockResolvedValue([]);

      const { req, res } = createMockReqRes({ method: 'GET', query });

      await dashboardHandler(req, res);

      expect(res.statusCode).toBe(422);
      expect(res.body).toEqual({ error: { message } });
      // Invalid input must be rejected BEFORE paying for a full ERP sweep.
      expect(findManyMock).not.toHaveBeenCalled();
    });

    it('keeps the guard FIRST: an invalid query from an anonymous caller is 401, not 422', async () => {
      const { ApiError } = jest.requireActual('@/lib/errors');
      requirePlatformAdminMock.mockRejectedValueOnce(
        new ApiError(401, 'Unauthorized')
      );

      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { page: 'abc' },
      });

      await dashboardHandler(req, res);

      expect(res.statusCode).toBe(401);
    });

    it('keeps the method check before validation: POST with a bad query is 405, not 422', async () => {
      authorize();

      const { req, res } = createMockReqRes({
        method: 'POST',
        query: { page: 'abc' },
      });

      await dashboardHandler(req, res);

      expect(res.statusCode).toBe(405);
      expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    });
  });

  describe('GET /api/admin/tenants/[teamId]', () => {
    it('returns 404 when team is not found', async () => {
      authorize();
      findUniqueMock.mockResolvedValueOnce(null);

      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { teamId: 'unknown-id' },
      });

      await tenantByIdHandler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: { message: 'Team not found' } });
    });

    it('returns 200 with tenant record when found', async () => {
      authorize();
      findUniqueMock.mockResolvedValueOnce(buildTeam(1));

      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { teamId: 'team-1' },
      });

      await tenantByIdHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toEqual(
        expect.objectContaining({ id: 'team-1', name: 'شركة 1' })
      );
    });
  });
});
