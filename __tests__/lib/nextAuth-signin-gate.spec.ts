import { getAuthOptions } from '@/lib/nextAuth';
import { getUser, createUser } from 'models/user';
import { getAccount } from 'models/account';

// Minimal prisma mock: PrismaAdapter is constructed at module import, and the
// first-time-signup path calls adapter.linkAccount → prisma.account.create.
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    account: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// No providers registered: the signIn callback contract is independent of the
// provider list, so the tests below exercise it with synthetic providers.
jest.mock('@/lib/auth', () => ({
  isAuthProviderEnabled: jest.fn(() => false),
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
  isEmailAllowed: jest.fn(() => true),
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
const createUserMock = createUser as unknown as jest.Mock;
const getAccountMock = getAccount as unknown as jest.Mock;

const DISABLED_USER = {
  id: 'u-disabled',
  name: 'Disabled User',
  email: 'disabled@example.com',
  disabledAt: new Date(),
};

const ACTIVE_USER = {
  id: 'u-active',
  name: 'Active User',
  email: 'active@example.com',
  disabledAt: null,
};

describe('NextAuth signIn callback — provider-wide disabledAt gate (H2a)', () => {
  let signInCallback: any;

  beforeAll(() => {
    const authOptions = getAuthOptions({} as any, {} as any);
    signInCallback = authOptions.callbacks!.signIn;
    expect(signInCallback).toBeDefined();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    'credentials',
    'email',
    'github',
    'google',
    'boxyhq-saml',
    'boxyhq-idp',
  ])(
    'rejects sign-in with a user-disabled error redirect for provider %s when the account is disabled',
    async (provider) => {
      getUserMock.mockResolvedValue(DISABLED_USER);

      const result = await signInCallback({
        user: { name: 'Disabled User', email: DISABLED_USER.email },
        account: { provider },
        profile: {},
      });

      expect(result).toBe('/auth/login?error=user-disabled');
      expect(getUserMock).toHaveBeenCalledWith({
        email: DISABLED_USER.email,
      });
    }
  );

  it('allows sign-in for an active existing user (email magic-link path)', async () => {
    getUserMock.mockResolvedValue(ACTIVE_USER);

    const result = await signInCallback({
      user: { name: 'Active User', email: ACTIVE_USER.email },
      account: { provider: 'email' },
      profile: {},
    });

    expect(result).toBe(true);
  });

  it('allows sign-in for an active existing user (OAuth path with a linked account)', async () => {
    getUserMock.mockResolvedValue(ACTIVE_USER);
    getAccountMock.mockResolvedValue({ id: 'acct-1' });

    const result = await signInCallback({
      user: { name: 'Active User', email: ACTIVE_USER.email },
      account: { provider: 'github' },
      profile: {},
    });

    expect(result).toBe(true);
    expect(getAccountMock).toHaveBeenCalledWith({ userId: ACTIVE_USER.id });
  });

  it('does not block first-time users (they cannot be disabled yet)', async () => {
    getUserMock.mockResolvedValue(null);
    createUserMock.mockResolvedValue({ id: 'u-new', email: 'new@example.com' });

    const result = await signInCallback({
      user: { name: 'New User', email: 'new@example.com' },
      account: { provider: 'github', providerAccountId: 'gh-123' },
      profile: {},
    });

    expect(result).toBe(true);
    expect(createUserMock).toHaveBeenCalledWith({
      name: 'New User',
      email: 'new@example.com',
    });
  });

  it('does not reject disabled accounts before the email allowlist gate', async () => {
    // Gate order: work-email allowlist runs first — a non-business email is
    // rejected even for a disabled account (no information leak about the
    // account state to outsiders).
    const { isEmailAllowed } = jest.requireMock('@/lib/email/utils') as {
      isEmailAllowed: jest.Mock;
    };
    isEmailAllowed.mockReturnValue(false);

    const result = await signInCallback({
      user: { name: 'X', email: 'disabled@example.com' },
      account: { provider: 'github' },
      profile: {},
    });

    expect(result).toBe('/auth/login?error=allow-only-work-email');
    expect(getUserMock).not.toHaveBeenCalled();
  });
});
