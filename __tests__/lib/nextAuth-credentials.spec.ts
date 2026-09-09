import { getAuthOptions } from '@/lib/nextAuth';
import { getUser } from 'models/user';
import { verifyPassword } from '@/lib/auth';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth', () => ({
  isAuthProviderEnabled: jest.fn((provider: string) => provider === 'credentials'),
  verifyPassword: jest.fn(),
}));

jest.mock('models/account', () => ({
  getAccount: jest.fn(),
}));

jest.mock('models/team', () => ({
  addTeamMember: jest.fn(),
  getTeam: jest.fn(),
}));

jest.mock('models/user', () => ({
  createUser: jest.fn(),
  getUser: jest.fn(),
}));

jest.mock('@/lib/email/utils', () => ({
  isEmailAllowed: jest.fn(),
}));

jest.mock('@/lib/recaptcha', () => ({
  validateRecaptcha: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/lib/accountLock', () => ({
  clearLoginAttempts: jest.fn(),
  exceededLoginAttemptsThreshold: jest.fn(() => false),
  incrementLoginAttempts: jest.fn(),
}));

jest.mock('@/lib/email/sendMagicLink', () => ({
  sendMagicLink: jest.fn(),
}));

jest.mock('@/lib/slack', () => ({
  slackNotify: jest.fn(),
}));

jest.mock('@/lib/common', () => ({
  maxLengthPolicies: { name: 50, email: 100, password: 40 },
}));

jest.mock('@/lib/server-common', () => ({
  forceConsume: jest.fn(),
}));

jest.mock('cookies-next', () => ({
  setCookie: jest.fn(),
  getCookie: jest.fn(),
}));

jest.mock('@/lib/env', () => ({
  __esModule: true,
  default: {
    appUrl: 'http://localhost:4002',
    confirmEmail: false,
    groupPrefix: '',
    nextAuth: { secret: 'test-secret', sessionStrategy: 'jwt' },
  },
}));

jest.mock('next-auth/jwt', () => ({
  encode: jest.fn(),
  decode: jest.fn(),
}));

const getUserMock = getUser as unknown as jest.Mock;
const verifyPasswordMock = verifyPassword as unknown as jest.Mock;

describe('NextAuth Credentials Authorize — disabledAt login gate', () => {
  let credentialsAuthorize: any;

  beforeAll(() => {
    const authOptions = getAuthOptions({} as any, {} as any);
    const credentialsProvider: any = authOptions.providers.find(
      (p: any) => p.id === 'credentials'
    );
    expect(credentialsProvider).toBeDefined();
    credentialsAuthorize = credentialsProvider.options?.authorize || credentialsProvider.authorize;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects login when credentials are not provided', async () => {
    await expect(credentialsAuthorize(null)).rejects.toThrow('no-credentials');
  });

  it('returns null when email or password is missing', async () => {
    const result = await credentialsAuthorize({ email: '', password: '' });
    expect(result).toBeNull();
  });

  it('rejects login with invalid-credentials when user is not found', async () => {
    getUserMock.mockResolvedValue(null);

    await expect(
      credentialsAuthorize({ email: 'nonexistent@example.com', password: 'password123' })
    ).rejects.toThrow('invalid-credentials');
  });

  it('rejects login with user-disabled when user.disabledAt is set', async () => {
    getUserMock.mockResolvedValue({
      id: 'u-disabled',
      email: 'disabled@example.com',
      disabledAt: new Date(),
    });

    await expect(
      credentialsAuthorize({ email: 'disabled@example.com', password: 'password123' })
    ).rejects.toThrow('user-disabled');

    // Ensure password check was not even attempted for a disabled account
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it('allows login when user is active (disabledAt is null) and password matches', async () => {
    getUserMock.mockResolvedValue({
      id: 'u-active',
      name: 'Active User',
      email: 'active@example.com',
      password: 'hashed-password',
      disabledAt: null,
    });
    verifyPasswordMock.mockResolvedValue(true);

    const user = await credentialsAuthorize({
      email: 'active@example.com',
      password: 'correct-password',
    });

    expect(user).toEqual({
      id: 'u-active',
      name: 'Active User',
      email: 'active@example.com',
    });
  });
});
