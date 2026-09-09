import { getAuthOptions } from '@/lib/nextAuth';
import { prisma } from '@/lib/prisma';

// Minimal prisma mock: PrismaAdapter is constructed at module import; the jwt
// and session callbacks under test only touch prisma.user.findUnique.
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

// No providers registered: the jwt/session callback contract is independent
// of the provider list.
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

const findUniqueMock = prisma.user.findUnique as unknown as jest.Mock;
const accountFindUniqueMock = prisma.account.findUnique as unknown as jest.Mock;

describe('NextAuth session revocation for disabled accounts (H2b)', () => {
  let authOptions: ReturnType<typeof getAuthOptions>;
  let jwtCallback: any;
  let sessionCallback: any;

  beforeAll(() => {
    authOptions = getAuthOptions({} as any, {} as any);
    jwtCallback = authOptions.callbacks!.jwt;
    sessionCallback = authOptions.callbacks!.session;
    expect(jwtCallback).toBeDefined();
    expect(sessionCallback).toBeDefined();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('jwt callback (JWT strategy)', () => {
    it('neutres the token when the user is disabled (sub cleared + userDisabled flag)', async () => {
      findUniqueMock.mockResolvedValue({
        platformRole: null,
        disabledAt: new Date(),
      });

      const token = await jwtCallback({
        token: { sub: 'u-disabled', name: 'Disabled User' },
        trigger: undefined,
      });

      expect(token.userDisabled).toBe(true);
      expect(token.sub).toBeUndefined();
      expect(token.isPlatformAdmin).toBe(false);
      expect(token.name).toBe('Disabled User'); // unrelated claims survive
      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { id: 'u-disabled' },
        select: { platformRole: true, disabledAt: true },
      });
    });

    it('keeps a revoked token revoked on subsequent calls without extra DB hits', async () => {
      const revokedToken = {
        sub: undefined,
        name: 'Disabled User',
        isPlatformAdmin: false,
        userDisabled: true,
      };

      const token = await jwtCallback({
        token: revokedToken,
        trigger: undefined,
      });

      expect(token.userDisabled).toBe(true);
      expect(token.sub).toBeUndefined();
      // No user id to resolve → no DB round trip on the fast path.
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('refreshes isPlatformAdmin on sign-in for an active user', async () => {
      findUniqueMock.mockResolvedValue({
        platformRole: 'PLATFORM_ADMIN',
        disabledAt: null,
      });

      const token = await jwtCallback({
        token: {},
        trigger: 'signIn',
        account: { provider: 'credentials' },
        user: { id: 'u-admin' },
      });

      expect(token.isPlatformAdmin).toBe(true);
      expect(token.userDisabled).toBeUndefined();
      expect(token.sub).toBeUndefined();
    });

    it('clears the admin claim when a revoked role is refreshed', async () => {
      findUniqueMock.mockResolvedValue({
        platformRole: null,
        disabledAt: null,
      });

      const token = await jwtCallback({
        token: { sub: 'u-former-admin', isPlatformAdmin: true },
        trigger: undefined,
      });

      expect(token.isPlatformAdmin).toBe(false);
      expect(token.userDisabled).toBeUndefined();
      expect(token.sub).toBe('u-former-admin');
    });

    describe('boxyhq-idp sign-in branch', () => {
      const mockIdpUser = (flags: {
        platformRole: string | null;
        disabledAt: Date | null;
      }) => {
        // PrismaAdapter.getUserByAccount returns the nested user relation of
        // the Account row ({ user: {...} }, single query — no userId field).
        accountFindUniqueMock.mockResolvedValue({
          user: { id: 'u-idp', email: 'idp@example.com', name: 'IdP User' },
        });
        // Only the flags query hits prisma.user afterwards.
        findUniqueMock.mockResolvedValue(flags);
      };

      it('resolves the platform-admin claim for an active IdP user', async () => {
        mockIdpUser({ platformRole: 'PLATFORM_ADMIN', disabledAt: null });

        const token = await jwtCallback({
          token: {},
          trigger: 'signIn',
          account: { provider: 'boxyhq-idp', providerAccountId: 'saml-s1' },
          user: { name: 'IdP User', email: 'idp@example.com' },
        });

        expect(accountFindUniqueMock).toHaveBeenCalledWith({
          where: {
            provider_providerAccountId: {
              providerAccountId: 'saml-s1',
              provider: 'boxyhq-idp',
            },
          },
          select: { user: true },
        });
        expect(findUniqueMock).toHaveBeenCalledWith({
          where: { id: 'u-idp' },
          select: { platformRole: true, disabledAt: true },
        });
        expect(token.sub).toBe('u-idp');
        expect(token.isPlatformAdmin).toBe(true);
        expect(token.userDisabled).toBeUndefined();
      });

      it('neutres the token for a disabled IdP user (belt-and-braces behind the signIn gate)', async () => {
        mockIdpUser({ platformRole: null, disabledAt: new Date() });

        const token = await jwtCallback({
          token: {},
          trigger: 'signIn',
          account: { provider: 'boxyhq-idp', providerAccountId: 'saml-s1' },
          user: { name: 'IdP User', email: 'idp@example.com' },
        });

        expect(token.userDisabled).toBe(true);
        expect(token.sub).toBeUndefined();
        expect(token.isPlatformAdmin).toBe(false);
      });
    });
  });

  describe('session callback', () => {
    const baseSession = {
      user: { name: 'N', email: 'n@example.com', image: null },
      expires: '2099-01-01T00:00:00.000Z',
    };

    it('returns null for a JWT-strategy token flagged as userDisabled', async () => {
      const result = await sessionCallback({
        session: baseSession,
        token: { sub: undefined, userDisabled: true, isPlatformAdmin: false },
        user: undefined,
      });

      expect(result).toBeNull();
    });

    it('returns null when the database-strategy user row is disabled', async () => {
      const result = await sessionCallback({
        session: baseSession,
        token: undefined,
        user: {
          id: 'u-disabled',
          name: 'Disabled User',
          email: 'disabled@example.com',
          disabledAt: new Date(),
        },
      });

      expect(result).toBeNull();
      // The DB-strategy revocation check short-circuits before any further
      // session resolution — no extra user query.
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('resolves an active database-strategy user into a full session', async () => {
      findUniqueMock.mockResolvedValue({
        platformRole: 'PLATFORM_ADMIN',
        disabledAt: null,
      });

      const result: any = await sessionCallback({
        session: baseSession,
        token: undefined,
        user: {
          id: 'u-active',
          name: 'Active User',
          email: 'active@example.com',
          disabledAt: null,
        },
      });

      expect(result).not.toBeNull();
      expect(result.user.id).toBe('u-active');
      expect(result.user.isPlatformAdmin).toBe(true);
    });

    it('resolves an active JWT-strategy token into a session', async () => {
      const result: any = await sessionCallback({
        session: baseSession,
        token: { sub: 'u-jwt', isPlatformAdmin: false },
        user: undefined,
      });

      expect(result).not.toBeNull();
      expect(result.user.id).toBe('u-jwt');
      expect(result.user.isPlatformAdmin).toBe(false);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });
  });
});
