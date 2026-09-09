import listUsersHandler from 'pages/api/admin/users/index';
import userByIdHandler from 'pages/api/admin/users/[id]/index';
import userActionHandler from 'pages/api/admin/users/[id]/[action]';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { recordAdminAudit } from '@/lib/adminAudit';

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@/lib/prisma', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    session: {
      deleteMany: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn((cb: any) => cb(prisma)),
  };

  return { prisma };
});

jest.mock('@/lib/adminAudit', () => ({
  recordAdminAudit: jest.fn(),
}));

const getSessionMock = getSession as unknown as jest.Mock;
const findUniqueMock = prisma.user.findUnique as unknown as jest.Mock;
const findManyMock = prisma.user.findMany as unknown as jest.Mock;
const countMock = prisma.user.count as unknown as jest.Mock;
const updateMock = prisma.user.update as unknown as jest.Mock;
const sessionDeleteManyMock = prisma.session.deleteMany as unknown as jest.Mock;
const recordAdminAuditMock = recordAdminAudit as unknown as jest.Mock;

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
  } as any;

  return { req, res };
};

const adminActor = {
  id: 'admin-1',
  email: 'admin@platform.com',
  name: 'Platform Admin',
  platformRole: 'PLATFORM_ADMIN',
};

describe('Admin Users API Suite (/api/admin/users)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/users (List / Search)', () => {
    it('returns 401 when no session exists', async () => {
      getSessionMock.mockResolvedValue(null);
      const { req, res } = createMockReqRes({ method: 'GET' });

      await listUsersHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: { message: 'Unauthorized' },
      });
    });

    it('returns 403 when session user is not a PLATFORM_ADMIN', async () => {
      getSessionMock.mockResolvedValue({ user: { id: 'regular-user' } });
      findUniqueMock.mockResolvedValue({
        id: 'regular-user',
        email: 'user@test.com',
        platformRole: null,
      });

      const { req, res } = createMockReqRes({ method: 'GET' });

      await listUsersHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: { message: 'Forbidden' },
      });
    });

    it('returns 405 for non-GET methods', async () => {
      getSessionMock.mockResolvedValue({ user: { id: adminActor.id } });
      findUniqueMock.mockResolvedValue(adminActor);

      const { req, res } = createMockReqRes({ method: 'POST' });

      await listUsersHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    });

    it('returns paginated list of users for platform admin without exposing password', async () => {
      getSessionMock.mockResolvedValue({ user: { id: adminActor.id } });
      findUniqueMock.mockResolvedValue(adminActor);

      const mockUsers = [
        {
          id: 'u-1',
          name: 'Alice',
          email: 'alice@example.com',
          teamMembers: [
            {
              id: 'tm-1',
              role: 'OWNER',
              team: { id: 't-1', name: 'Acme', slug: 'acme' },
            },
          ],
          disabledAt: null,
          lockedAt: null,
        },
      ];

      countMock.mockResolvedValue(1);
      findManyMock.mockResolvedValue(mockUsers);

      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { page: '1', limit: '10' },
      });

      await listUsersHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: {
          items: mockUsers,
          total: 1,
          page: 1,
          limit: 10,
          hasMore: false,
        },
      });

      // Verify Prisma call excluded password
      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.not.objectContaining({ password: true }),
        })
      );
    });

    it('filters users by search query (name or email)', async () => {
      getSessionMock.mockResolvedValue({ user: { id: adminActor.id } });
      findUniqueMock.mockResolvedValue(adminActor);

      countMock.mockResolvedValue(1);
      findManyMock.mockResolvedValue([]);

      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { search: 'alice' },
      });

      await listUsersHandler(req, res);

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'alice', mode: 'insensitive' } },
              { email: { contains: 'alice', mode: 'insensitive' } },
            ],
          },
        })
      );
    });
  });

  describe('GET & PATCH /api/admin/users/[id]', () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue({ user: { id: adminActor.id } });
      findUniqueMock.mockImplementation(({ where }) => {
        if (where.id === adminActor.id) return Promise.resolve(adminActor);
        if (where.id === 'target-user') {
          return Promise.resolve({
            id: 'target-user',
            email: 'target@example.com',
            name: 'Target User',
            platformRole: null,
            disabledAt: null,
            lockedAt: null,
          });
        }
        return Promise.resolve(null);
      });
    });

    it('returns 404 when GET target user does not exist', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { id: 'non-existent' },
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: { message: 'User not found' },
      });
    });

    it('returns user details on GET /api/admin/users/[id]', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { id: 'target-user' },
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: expect.objectContaining({ id: 'target-user' }),
      });
    });

    it('returns 422 if neither disabled nor locked is provided on PATCH', async () => {
      const { req, res } = createMockReqRes({
        method: 'PATCH',
        query: { id: 'target-user' },
        body: {},
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
    });

    it('blocks self-disable on PATCH with 422', async () => {
      const { req, res } = createMockReqRes({
        method: 'PATCH',
        query: { id: adminActor.id },
        body: { disabled: true },
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          message: 'Cannot disable or lock your own administrator account',
        },
      });
    });

    it('blocks self-lock on PATCH with 422', async () => {
      const { req, res } = createMockReqRes({
        method: 'PATCH',
        query: { id: adminActor.id },
        body: { locked: true },
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          message: 'Cannot disable or lock your own administrator account',
        },
      });
    });

    it('blocks disabling the last active PLATFORM_ADMIN with 422', async () => {
      findUniqueMock.mockImplementation(({ where }) => {
        if (where.id === adminActor.id) return Promise.resolve(adminActor);
        if (where.id === 'other-admin') {
          return Promise.resolve({
            id: 'other-admin',
            email: 'other@admin.com',
            platformRole: 'PLATFORM_ADMIN',
            disabledAt: null,
          });
        }
        return Promise.resolve(null);
      });

      countMock.mockResolvedValue(0); // 0 other active admins

      const { req, res } = createMockReqRes({
        method: 'PATCH',
        query: { id: 'other-admin' },
        body: { disabled: true },
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          message: 'Cannot disable the last active platform administrator',
        },
      });
    });

    it('updates user disabledAt on PATCH and returns updated user', async () => {
      updateMock.mockResolvedValue({
        id: 'target-user',
        email: 'target@example.com',
        disabledAt: new Date(),
      });

      const { req, res } = createMockReqRes({
        method: 'PATCH',
        query: { id: 'target-user' },
        body: { disabled: true },
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'target-user' },
          data: expect.objectContaining({ disabledAt: expect.any(Date) }),
        })
      );
    });

    it('updates user lockedAt and clears attempts on unlock PATCH', async () => {
      updateMock.mockResolvedValue({
        id: 'target-user',
        email: 'target@example.com',
        lockedAt: null,
        invalid_login_attempts: 0,
      });

      const { req, res } = createMockReqRes({
        method: 'PATCH',
        query: { id: 'target-user' },
        body: { locked: false },
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'target-user' },
          data: expect.objectContaining({
            lockedAt: null,
            invalid_login_attempts: 0,
          }),
        })
      );
    });
  });

  describe('POST /api/admin/users/[id]/[action] Action Endpoints', () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue({ user: { id: adminActor.id } });
      findUniqueMock.mockImplementation(({ where }) => {
        if (where.id === adminActor.id) return Promise.resolve(adminActor);
        if (where.id === 'target-user') {
          return Promise.resolve({
            id: 'target-user',
            email: 'target@example.com',
            name: 'Target User',
            platformRole: null,
            disabledAt: null,
            lockedAt: null,
          });
        }
        return Promise.resolve(null);
      });
    });

    it('returns 404 for unknown actions', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        query: { id: 'target-user', action: 'invalid-action' },
      });

      await userActionHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('executes disable action', async () => {
      updateMock.mockResolvedValue({
        id: 'target-user',
        disabledAt: new Date(),
      });

      const { req, res } = createMockReqRes({
        method: 'POST',
        query: { id: 'target-user', action: 'disable' },
      });

      await userActionHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ disabledAt: expect.any(Date) }),
        })
      );
    });

    it('executes enable action', async () => {
      updateMock.mockResolvedValue({
        id: 'target-user',
        disabledAt: null,
      });

      const { req, res } = createMockReqRes({
        method: 'POST',
        query: { id: 'target-user', action: 'enable' },
      });

      await userActionHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ disabledAt: null }),
        })
      );
    });

    it('executes lock action', async () => {
      updateMock.mockResolvedValue({
        id: 'target-user',
        lockedAt: new Date(),
      });

      const { req, res } = createMockReqRes({
        method: 'POST',
        query: { id: 'target-user', action: 'lock' },
      });

      await userActionHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lockedAt: expect.any(Date) }),
        })
      );
    });

    it('executes unlock action', async () => {
      updateMock.mockResolvedValue({
        id: 'target-user',
        lockedAt: null,
        invalid_login_attempts: 0,
      });

      const { req, res } = createMockReqRes({
        method: 'POST',
        query: { id: 'target-user', action: 'unlock' },
      });

      await userActionHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lockedAt: null,
            invalid_login_attempts: 0,
          }),
        })
      );
    });
  });

  describe('Admin mutations — failure paths, retries & audit events', () => {
    const targetUser = {
      id: 'target-user',
      email: 'target@example.com',
      name: 'Target User',
      platformRole: null,
      disabledAt: null,
      lockedAt: null,
    };

    const mockActorAndTargetLookup = () => {
      getSessionMock.mockResolvedValue({ user: { id: adminActor.id } });
      findUniqueMock.mockImplementation(({ where }: any) => {
        if (where.id === adminActor.id) return Promise.resolve(adminActor);
        if (where.id === 'target-user') return Promise.resolve(targetUser);
        return Promise.resolve(null);
      });
    };

    beforeEach(() => {
      updateMock.mockResolvedValue({
        id: 'target-user',
        email: 'target@example.com',
        disabledAt: null,
        lockedAt: null,
        invalid_login_attempts: 0,
      });
    });

    it('records a FAILED audit and returns a bounded 500 when the update fails', async () => {
      mockActorAndTargetLookup();
      updateMock.mockRejectedValue(new Error('db exploded'));

      const { req, res } = createMockReqRes({
        method: 'PATCH',
        query: { id: 'target-user' },
        body: { disabled: true },
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: { message: 'internal-error' },
      });
      expect(recordAdminAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.disable',
          status: 'FAILED',
          targetUserId: 'target-user',
          details: expect.objectContaining({ httpStatus: 500 }),
        })
      );
    });

    it('records a FAILED audit when self-disable is rejected (422)', async () => {
      mockActorAndTargetLookup();

      const { req, res } = createMockReqRes({
        method: 'PATCH',
        query: { id: adminActor.id },
        body: { disabled: true },
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(recordAdminAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.disable',
          status: 'FAILED',
          details: expect.objectContaining({
            reason: expect.stringContaining('own administrator account'),
            httpStatus: 422,
          }),
        })
      );
    });

    it('records a FAILED audit when disabling the last active PLATFORM_ADMIN is rejected (422)', async () => {
      getSessionMock.mockResolvedValue({ user: { id: adminActor.id } });
      findUniqueMock.mockImplementation(({ where }: any) => {
        if (where.id === adminActor.id) return Promise.resolve(adminActor);
        if (where.id === 'other-admin') {
          return Promise.resolve({
            id: 'other-admin',
            email: 'other@admin.com',
            platformRole: 'PLATFORM_ADMIN',
            disabledAt: null,
            lockedAt: null,
          });
        }
        return Promise.resolve(null);
      });
      countMock.mockResolvedValue(0);

      const { req, res } = createMockReqRes({
        method: 'PATCH',
        query: { id: 'other-admin' },
        body: { disabled: true },
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(recordAdminAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.disable',
          status: 'FAILED',
          details: expect.objectContaining({
            reason: expect.stringContaining(
              'last active platform administrator'
            ),
            httpStatus: 422,
          }),
        })
      );
    });

    it('retries transient P2034 conflicts and succeeds', async () => {
      mockActorAndTargetLookup();
      updateMock.mockRejectedValueOnce({ code: 'P2034' });
      updateMock.mockRejectedValueOnce({ code: 'P2034' });

      const { req, res } = createMockReqRes({
        method: 'PATCH',
        query: { id: 'target-user' },
        body: { disabled: true },
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(updateMock).toHaveBeenCalledTimes(3);
    });

    it('returns 409 after repeated P2034 conflicts', async () => {
      mockActorAndTargetLookup();
      updateMock.mockRejectedValue({ code: 'P2034' });

      const { req, res } = createMockReqRes({
        method: 'PATCH',
        query: { id: 'target-user' },
        body: { disabled: true },
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: { message: 'Concurrent update conflict, please retry' },
      });
      expect(updateMock).toHaveBeenCalledTimes(3);
    });

    it('deletes persisted sessions when a user is disabled', async () => {
      mockActorAndTargetLookup();

      const { req, res } = createMockReqRes({
        method: 'PATCH',
        query: { id: 'target-user' },
        body: { disabled: true },
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(sessionDeleteManyMock).toHaveBeenCalledWith({
        where: { userId: 'target-user' },
      });
    });

    it('records one SUCCEEDED audit per intended action (PATCH disabled + locked)', async () => {
      mockActorAndTargetLookup();

      const { req, res } = createMockReqRes({
        method: 'PATCH',
        query: { id: 'target-user' },
        body: { disabled: true, locked: true },
      });

      await userByIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(recordAdminAuditMock).toHaveBeenCalledTimes(2);
      expect(recordAdminAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.disable', status: 'SUCCEEDED' })
      );
      expect(recordAdminAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.lock', status: 'SUCCEEDED' })
      );
    });

    it('records a FAILED audit when the action endpoint mutation fails', async () => {
      mockActorAndTargetLookup();
      updateMock.mockRejectedValue(new Error('boom'));

      const { req, res } = createMockReqRes({
        method: 'POST',
        query: { id: 'target-user', action: 'disable' },
      });

      await userActionHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(recordAdminAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.disable', status: 'FAILED' })
      );
    });
  });
});
