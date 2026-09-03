import { ApiError } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

const getSessionMock = getSession as unknown as jest.Mock;
const findUniqueMock = prisma.user.findUnique as unknown as jest.Mock;

const req = {} as any;
const res = {} as any;

const adminUserRow = {
  id: 'user-1',
  email: 'admin@example.com',
  name: 'Admin',
  platformRole: 'PLATFORM_ADMIN',
};

describe('Lib - requirePlatformAdmin (P5.2)', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    findUniqueMock.mockReset();
  });

  it('throws 401 when there is no session', async () => {
    getSessionMock.mockResolvedValue(null);

    await expect(requirePlatformAdmin(req, res)).rejects.toMatchObject({
      status: 401,
      message: 'Unauthorized',
    });
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it('throws 401 when the session has no user id', async () => {
    getSessionMock.mockResolvedValue({ user: { email: 'a@b.com' } });

    await expect(requirePlatformAdmin(req, res)).rejects.toMatchObject({
      status: 401,
    });
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it('throws 403 for an authenticated non-admin', async () => {
    getSessionMock.mockResolvedValue({
      user: { id: 'user-1', email: 'a@b.com' },
    });
    findUniqueMock.mockResolvedValue({ ...adminUserRow, platformRole: null });

    await expect(requirePlatformAdmin(req, res)).rejects.toMatchObject({
      status: 403,
      message: 'Forbidden',
    });
  });

  it('throws 403 when the user no longer exists', async () => {
    getSessionMock.mockResolvedValue({
      user: { id: 'user-1', email: 'a@b.com' },
    });
    findUniqueMock.mockResolvedValue(null);

    await expect(requirePlatformAdmin(req, res)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('throws 403 when the database role was revoked even with a stale admin claim', async () => {
    getSessionMock.mockResolvedValue({
      user: { id: 'user-1', email: 'a@b.com', isPlatformAdmin: true },
    });
    findUniqueMock.mockResolvedValue({ ...adminUserRow, platformRole: null });

    await expect(requirePlatformAdmin(req, res)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('returns a safe actor object for a platform admin', async () => {
    getSessionMock.mockResolvedValue({
      user: { id: 'user-1', email: 'a@b.com', isPlatformAdmin: true },
    });
    findUniqueMock.mockResolvedValue(adminUserRow);

    const actor = await requirePlatformAdmin(req, res);

    expect(actor).toEqual({
      id: 'user-1',
      email: 'admin@example.com',
      name: 'Admin',
    });
  });

  it('checks the database role with a narrow select (no credential fields)', async () => {
    getSessionMock.mockResolvedValue({
      user: { id: 'user-1', email: 'a@b.com' },
    });
    findUniqueMock.mockResolvedValue(adminUserRow);

    await requirePlatformAdmin(req, res);

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        id: true,
        email: true,
        name: true,
        platformRole: true,
      },
    });
  });

  it('error messages never leak secrets', async () => {
    getSessionMock.mockResolvedValue({
      user: { id: 'user-1', email: 'secret-email@example.com' },
    });
    findUniqueMock.mockResolvedValue(null);

    const error: ApiError = await requirePlatformAdmin(req, res).catch(
      (thrown) => thrown
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.message).toBe('Forbidden');
    expect(JSON.stringify(error)).not.toContain('secret-email');
  });
});
