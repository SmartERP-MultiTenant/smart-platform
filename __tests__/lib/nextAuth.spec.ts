import { getAuthOptions } from '@/lib/nextAuth';
import { prisma } from '@/lib/prisma';

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

// Hermetic env — lib/nextAuth only reads these at module init for this path.
jest.mock('@/lib/env', () => ({
  __esModule: true,
  default: {
    appUrl: 'http://localhost:4002',
    confirmEmail: false,
    groupPrefix: '',
    nextAuth: { secret: 'test-secret', sessionStrategy: 'jwt' },
  },
}));

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
  isEmailAllowed: jest.fn(),
}));

jest.mock('@/lib/recaptcha', () => ({
  validateRecaptcha: jest.fn(),
}));

// accountLock transitively creates a nodemailer transporter at module load
// (env.smtp) — stub the boundary; lockout helpers are not exercised here.
jest.mock('@/lib/accountLock', () => ({
  clearLoginAttempts: jest.fn(),
  exceededLoginAttemptsThreshold: jest.fn(),
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

// next-auth/jwt pulls the ESM jose browser build, which jest's CJS runtime
// cannot parse. The tests never call encode/decode — stub the boundary.
jest.mock('next-auth/jwt', () => ({
  encode: jest.fn(),
  decode: jest.fn(),
}));

const findUniqueMock = prisma.user.findUnique as unknown as jest.Mock;
const accountFindUniqueMock = prisma.account.findUnique as unknown as jest.Mock;

const req = { query: {}, method: 'GET' } as any;
const res = {} as any;

const getCallbacks = () => {
  const callbacks = getAuthOptions(req, res).callbacks;

  if (!callbacks?.session || !callbacks.jwt) {
    throw new Error('Auth callbacks are not configured');
  }

  return callbacks;
};

// NextAuth v4's callback param types are stricter than what the callbacks
// actually read — the tests drive them through the same shape NextAuth uses.
// getCallbacks() already guarantees both callbacks exist at runtime.
const callSession = (params: Record<string, unknown>) =>
  getCallbacks().session!(params as any);

const callJwt = (params: Record<string, unknown>) =>
  getCallbacks().jwt!(params as any);

const sessionFixture = () =>
  ({ user: { id: undefined, name: 'Admin', email: 'a@b.com' } }) as any;

describe('NextAuth platform-admin claim (P5.2)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    accountFindUniqueMock.mockReset();
  });

  describe('session callback — JWT strategy', () => {
    it('exposes isPlatformAdmin from the token claim', async () => {
      const session = sessionFixture();

      await callSession({
        session,
        token: { sub: 'user-1', isPlatformAdmin: true },
        user: undefined,
      });

      expect(session.user.isPlatformAdmin).toBe(true);
      expect(session.user.id).toBe('user-1');
    });

    it('defaults to false when the token has no claim', async () => {
      const session = sessionFixture();

      await callSession({
        session,
        token: { sub: 'user-1' },
        user: undefined,
      });

      expect(session.user.isPlatformAdmin).toBe(false);
    });
  });

  describe('session callback — database strategy', () => {
    it('resolves the flag fresh from the database', async () => {
      findUniqueMock.mockResolvedValue({ platformRole: 'PLATFORM_ADMIN' });
      const session = sessionFixture();

      await callSession({
        session,
        token: undefined,
        user: { id: 'user-1' },
      });

      expect(session.user.isPlatformAdmin).toBe(true);
      expect(session.user.id).toBe('user-1');
      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { platformRole: true },
      });
    });

    it('returns false when the user has no platform role', async () => {
      findUniqueMock.mockResolvedValue({ platformRole: null });
      const session = sessionFixture();

      await callSession({
        session,
        token: undefined,
        user: { id: 'user-1' },
      });

      expect(session.user.isPlatformAdmin).toBe(false);
    });
  });

  describe('jwt callback', () => {
    it('sets the claim at sign-in from the database role', async () => {
      findUniqueMock.mockResolvedValue({ platformRole: 'PLATFORM_ADMIN' });

      const token = await callJwt({
        token: {},
        trigger: undefined,
        session: undefined,
        account: undefined,
        user: { id: 'user-1' },
      });

      expect(token.isPlatformAdmin).toBe(true);
      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { platformRole: true },
      });
    });

    it('refreshes the claim from the database on subsequent calls', async () => {
      // Role revoked after sign-in → the refreshed claim must flip to false.
      findUniqueMock.mockResolvedValue({ platformRole: null });

      const token = await callJwt({
        token: { sub: 'user-1', isPlatformAdmin: true },
        trigger: undefined,
        session: undefined,
        account: undefined,
        user: undefined,
      });

      expect(token.isPlatformAdmin).toBe(false);
    });

    it('defaults to false when there is no user and no sub yet', async () => {
      const token = await callJwt({
        token: {},
        trigger: undefined,
        session: undefined,
        account: undefined,
        user: undefined,
      });

      expect(token.isPlatformAdmin).toBe(false);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('keeps the existing claim across a profile update', async () => {
      const token = await callJwt({
        token: { sub: 'user-1', isPlatformAdmin: true },
        trigger: 'update',
        session: { name: 'New Name' },
        account: undefined,
        user: undefined,
      });

      expect(token.name).toBe('New Name');
      expect(token.isPlatformAdmin).toBe(true);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    // The BoxyHQ IdP branch returns early in the jwt callback, so it must
    // resolve the claim itself — regression guard for the first sign-in.
    it('carries the claim on first BoxyHQ IdP sign-in (early-return branch)', async () => {
      // getUserByAccount → account.findUnique({ select: { user: true } }).
      accountFindUniqueMock.mockResolvedValue({ user: { id: 'user-9' } });
      findUniqueMock.mockResolvedValue({ platformRole: 'PLATFORM_ADMIN' });

      const token = await callJwt({
        token: {},
        trigger: 'signIn',
        session: undefined,
        account: { provider: 'boxyhq-idp', providerAccountId: 'acc-1' },
        user: { id: 'user-9' },
      });

      expect(token.sub).toBe('user-9');
      expect(token.isPlatformAdmin).toBe(true);
      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { id: 'user-9' },
        select: { platformRole: true },
      });
    });

    it('marks a non-admin BoxyHQ IdP sign-in as false', async () => {
      accountFindUniqueMock.mockResolvedValue({ user: { id: 'user-9' } });
      findUniqueMock.mockResolvedValue({ platformRole: null });

      const token = await callJwt({
        token: {},
        trigger: 'signIn',
        session: undefined,
        account: { provider: 'boxyhq-idp', providerAccountId: 'acc-1' },
        user: { id: 'user-9' },
      });

      expect(token.isPlatformAdmin).toBe(false);
    });

    it('defaults to false when the IdP account cannot be resolved', async () => {
      accountFindUniqueMock.mockResolvedValue(null);

      const token = await callJwt({
        token: {},
        trigger: 'signIn',
        session: undefined,
        account: { provider: 'boxyhq-idp', providerAccountId: 'acc-404' },
        user: undefined,
      });

      expect(token.sub).toBeUndefined();
      expect(token.isPlatformAdmin).toBe(false);
    });
  });
});
