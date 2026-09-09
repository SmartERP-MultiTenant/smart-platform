import handler from 'pages/api/auth/reset-password';
import { getPasswordReset, deletePasswordReset } from 'models/passwordReset';
import { updateUser } from 'models/user';
import { unlockAccount } from '@/lib/accountLock';
import { hashPassword } from '@/lib/auth';
import { recordMetric } from '@/lib/metrics';

jest.mock('models/passwordReset', () => ({
  getPasswordReset: jest.fn(),
  deletePasswordReset: jest.fn(),
}));

jest.mock('models/user', () => ({
  updateUser: jest.fn(),
}));

jest.mock('models/session', () => ({
  deleteManySessions: jest.fn(),
}));

jest.mock('@/lib/accountLock', () => ({
  unlockAccount: jest.fn(),
}));

jest.mock('@/lib/auth', () => ({
  hashPassword: jest.fn(),
}));

jest.mock('@/lib/metrics', () => ({
  recordMetric: jest.fn(),
}));

const mockGetPasswordReset = getPasswordReset as jest.Mock;
const mockDeletePasswordReset = deletePasswordReset as jest.Mock;
const mockUpdateUser = updateUser as jest.Mock;
const mockUnlockAccount = unlockAccount as jest.Mock;
const mockHashPassword = hashPassword as jest.Mock;
const mockRecordMetric = recordMetric as jest.Mock;

function mockReqRes(method = 'POST', body: any = {}) {
  const req = {
    method,
    body,
  } as any;

  const res = {
    statusCode: 200,
    status: jest.fn().mockImplementation(function (code: number) {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn().mockImplementation(function (data: any) {
      res.data = data;
      return res;
    }),
    setHeader: jest.fn(),
  } as any;

  return { req, res };
}

describe('API - /api/auth/reset-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 422 when password reset token is missing', async () => {
    const { req, res } = mockReqRes('POST', {
      token: '',
      password: 'newPassword123!',
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.data).toEqual({
      error: { message: 'Validation Error: Token is required' },
    });
  });

  it('returns 422 (not 500) when token is already consumed / reused (not found)', async () => {
    mockGetPasswordReset.mockResolvedValue(null);

    const { req, res } = mockReqRes('POST', {
      token: 'consumed-or-invalid-token',
      password: 'newPassword123!',
    });

    await handler(req, res);

    expect(mockGetPasswordReset).toHaveBeenCalledWith(
      'consumed-or-invalid-token'
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.data).toEqual({
      error: {
        message: 'Invalid password reset token. Please request a new one.',
      },
    });
  });

  it('returns 422 (not 500) when token has expired', async () => {
    mockGetPasswordReset.mockResolvedValue({
      id: 'pr-1',
      email: 'user@example.com',
      token: 'expired-token',
      expiresAt: new Date(Date.now() - 60_000), // 1 min ago
    });

    const { req, res } = mockReqRes('POST', {
      token: 'expired-token',
      password: 'newPassword123!',
    });

    await handler(req, res);

    expect(mockGetPasswordReset).toHaveBeenCalledWith('expired-token');
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.data).toEqual({
      error: {
        message: 'Password reset token has expired. Please request a new one.',
      },
    });
  });

  it('returns 200 and resets password on valid token', async () => {
    mockGetPasswordReset.mockResolvedValue({
      id: 'pr-1',
      email: 'user@example.com',
      token: 'valid-token',
      expiresAt: new Date(Date.now() + 3600_000), // in 1 hour
    });
    mockHashPassword.mockResolvedValue('hashed-new-password');
    mockUpdateUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    mockUnlockAccount.mockResolvedValue(undefined);
    mockDeletePasswordReset.mockResolvedValue(undefined);

    const { req, res } = mockReqRes('POST', {
      token: 'valid-token',
      password: 'newPassword123!',
    });

    await handler(req, res);

    expect(mockHashPassword).toHaveBeenCalledWith('newPassword123!');
    expect(mockUpdateUser).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
      data: { password: 'hashed-new-password' },
    });
    expect(mockUnlockAccount).toHaveBeenCalled();
    expect(mockDeletePasswordReset).toHaveBeenCalledWith('valid-token');
    expect(mockRecordMetric).toHaveBeenCalledWith('user.password.reset');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.data).toEqual({
      message: 'Password reset successfully',
    });
  });

  it('returns 405 for non-POST methods', async () => {
    const { req, res } = mockReqRes('GET');

    await handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST');
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.data).toEqual({
      error: { message: 'Method GET Not Allowed' },
    });
  });
});
