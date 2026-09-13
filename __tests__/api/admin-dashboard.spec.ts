import dashboardHandler from 'pages/api/admin/dashboard';
import tenantByIdHandler from 'pages/api/admin/tenants/[teamId]';
import {
  getAdminDashboardData,
  getAdminTenantById,
} from '@/lib/adminDashboard';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import { ApiError } from '@/lib/errors';

jest.mock('@/lib/guardPlatformAdmin', () => ({
  requirePlatformAdmin: jest.fn(),
}));

jest.mock('@/lib/adminDashboard', () => ({
  getAdminDashboardData: jest.fn(),
  getAdminTenantById: jest.fn(),
}));

const requirePlatformAdminMock = requirePlatformAdmin as unknown as jest.Mock;
const getAdminDashboardDataMock = getAdminDashboardData as unknown as jest.Mock;
const getAdminTenantByIdMock = getAdminTenantById as unknown as jest.Mock;

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

describe('Admin Dashboard API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/dashboard', () => {
    it('returns 401 when requirePlatformAdmin rejects with 401', async () => {
      requirePlatformAdminMock.mockRejectedValueOnce(
        new ApiError(401, 'Unauthorized')
      );
      const { req, res } = createMockReqRes({ method: 'GET' });

      await dashboardHandler(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: { message: 'Unauthorized' } });
    });

    it('returns 403 when requirePlatformAdmin rejects with 403', async () => {
      requirePlatformAdminMock.mockRejectedValueOnce(
        new ApiError(403, 'Forbidden')
      );
      const { req, res } = createMockReqRes({ method: 'GET' });

      await dashboardHandler(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: { message: 'Forbidden' } });
    });

    it('returns 405 Method Not Allowed for non-GET methods', async () => {
      requirePlatformAdminMock.mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@example.com',
      });
      const { req, res } = createMockReqRes({ method: 'POST' });

      await dashboardHandler(req, res);

      expect(res.statusCode).toBe(405);
      expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    });

    it('returns 200 with data for authorized platform admin', async () => {
      requirePlatformAdminMock.mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@example.com',
      });
      const mockPayload = {
        generatedAt: '2026-09-10T00:00:00.000Z',
        summary: { totalTeams: 5 },
        health: { ok: true },
        tenants: [],
        recentRegistrations: [],
      };
      getAdminDashboardDataMock.mockResolvedValueOnce(mockPayload);

      const { req, res } = createMockReqRes({ method: 'GET' });

      await dashboardHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ data: mockPayload });
    });
  });

  describe('GET /api/admin/tenants/[teamId]', () => {
    it('returns 404 when team is not found', async () => {
      requirePlatformAdminMock.mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@example.com',
      });
      getAdminTenantByIdMock.mockResolvedValueOnce(null);

      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { teamId: 'unknown-id' },
      });

      await tenantByIdHandler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: { message: 'Team not found' } });
    });

    it('returns 200 with tenant record when found', async () => {
      requirePlatformAdminMock.mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@example.com',
      });
      const mockTenant = { id: 'team-1', name: 'Acme Corp' };
      getAdminTenantByIdMock.mockResolvedValueOnce(mockTenant);

      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { teamId: 'team-1' },
      });

      await tenantByIdHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ data: mockTenant });
    });
  });
});
