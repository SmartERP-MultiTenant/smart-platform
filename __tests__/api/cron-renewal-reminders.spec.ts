import handler from 'pages/api/cron/renewal-reminders';
import { prisma } from '@/lib/prisma';
import { erp } from '@/lib/erp';
import { sendRenewalReminder } from '@/lib/email/sendRenewalReminder';
import env from '@/lib/env';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    team: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/erp', () => ({
  erp: {
    getTenantBillingSubscription: jest.fn(),
  },
}));

jest.mock('@/lib/email/sendRenewalReminder', () => ({
  sendRenewalReminder: jest.fn(),
}));

jest.mock('@/lib/env', () => ({
  __esModule: true,
  default: {
    appUrl: 'http://localhost:4002',
    cronSecret: 'test-cron-secret-123',
    erp: {
      platformApiKey: 'test-platform-key',
    },
  },
}));

const findManyTeamsMock = prisma.team.findMany as unknown as jest.Mock;
const updateTeamMock = prisma.team.update as unknown as jest.Mock;
const getTenantBillingSubMock =
  erp.getTenantBillingSubscription as unknown as jest.Mock;
const sendRenewalReminderMock = sendRenewalReminder as unknown as jest.Mock;

const createMockReqRes = (options: {
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}) => {
  const req = {
    method: options.method || 'POST',
    headers: options.headers || {},
    query: options.query || {},
  } as any;

  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader: jest.fn((k, v) => {
      res.headers[k] = v;
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

describe('Cron Renewal Reminders API (/api/cron/renewal-reminders)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore the configured-secret default: the env mock object is shared
    // and mutated in place by the 503/query-vector cases below.
    env.cronSecret = 'test-cron-secret-123';
  });

  describe('Security & HTTP Method', () => {
    it('returns 401 when CRON_SECRET is missing or incorrect', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: { 'x-cron-secret': 'wrong-secret' },
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(findManyTeamsMock).not.toHaveBeenCalled();
    });

    it('returns 401 when no secret is provided but CRON_SECRET is configured', async () => {
      const { req, res } = createMockReqRes({ method: 'POST' });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(findManyTeamsMock).not.toHaveBeenCalled();
    });

    it('returns 503 cron-not-configured when CRON_SECRET is unset (no open mode)', async () => {
      env.cronSecret = null;

      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: { 'x-cron-secret': 'test-cron-secret-123' },
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.body).toEqual({
        error: { message: 'cron-not-configured' },
      });
      expect(findManyTeamsMock).not.toHaveBeenCalled();
    });

    it('rejects the ?secret= query-string vector even when it matches (log-leak guard)', async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        query: { secret: 'test-cron-secret-123' },
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(findManyTeamsMock).not.toHaveBeenCalled();
    });

    it('returns 405 for unsupported HTTP methods', async () => {
      const { req, res } = createMockReqRes({
        method: 'DELETE',
        headers: { 'x-cron-secret': 'test-cron-secret-123' },
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
    });

    it('authenticates successfully via Authorization Bearer token', async () => {
      findManyTeamsMock.mockResolvedValue([]);

      const { req, res } = createMockReqRes({
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret-123' },
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('authenticates successfully via x-cron-secret header', async () => {
      findManyTeamsMock.mockResolvedValue([]);

      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: { 'x-cron-secret': 'test-cron-secret-123' },
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Reminder Milestones (T-7, T-1, EXPIRED)', () => {
    const mockCandidateTeam = (overrides = {}) => ({
      id: 'team-1',
      name: 'Acme Corp',
      slug: 'acme',
      erpTenantId: 'tenant-1',
      lastReminderStage: null,
      lastReminderSentAt: null,
      members: [
        {
          user: {
            id: 'user-1',
            name: 'Ahmed Owner',
            email: 'ahmed@acme.com',
          },
        },
      ],
      ...overrides,
    });

    it('sends T-7 reminder when 7 days remain and records lastReminderStage', async () => {
      const team = mockCandidateTeam({ lastReminderStage: null });
      findManyTeamsMock.mockResolvedValue([team]);

      getTenantBillingSubMock.mockResolvedValue({
        subscription: {
          daysRemaining: 7,
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      const { req, res } = createMockReqRes({
        headers: { 'x-cron-secret': 'test-cron-secret-123' },
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(sendRenewalReminderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ahmed@acme.com',
          teamName: 'Acme Corp',
          teamSlug: 'acme',
          daysLeft: 7,
          milestone: 'T-7',
        })
      );
      expect(updateTeamMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'team-1' },
          data: expect.objectContaining({
            lastReminderStage: 'T-7',
            lastReminderSentAt: expect.any(Date),
          }),
        })
      );
    });

    it('sends T-1 reminder when 1 day remains and team was on T-7', async () => {
      const team = mockCandidateTeam({ lastReminderStage: 'T-7' });
      findManyTeamsMock.mockResolvedValue([team]);

      getTenantBillingSubMock.mockResolvedValue({
        subscription: {
          daysRemaining: 1,
          endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      const { req, res } = createMockReqRes({
        headers: { 'x-cron-secret': 'test-cron-secret-123' },
      });

      await handler(req, res);

      expect(sendRenewalReminderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ahmed@acme.com',
          daysLeft: 1,
          milestone: 'T-1',
        })
      );
      expect(updateTeamMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'team-1' },
          data: expect.objectContaining({
            lastReminderStage: 'T-1',
          }),
        })
      );
    });

    it('sends EXPIRED reminder when subscription has expired (0 days left)', async () => {
      const team = mockCandidateTeam({ lastReminderStage: 'T-1' });
      findManyTeamsMock.mockResolvedValue([team]);

      getTenantBillingSubMock.mockResolvedValue({
        subscription: {
          daysRemaining: 0,
          endDate: new Date().toISOString(),
        },
      });

      const { req, res } = createMockReqRes({
        headers: { 'x-cron-secret': 'test-cron-secret-123' },
      });

      await handler(req, res);

      expect(sendRenewalReminderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ahmed@acme.com',
          daysLeft: 0,
          milestone: 'EXPIRED',
        })
      );
      expect(updateTeamMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'team-1' },
          data: expect.objectContaining({
            lastReminderStage: 'EXPIRED',
          }),
        })
      );
    });
    it('keeps the T-7 milestone when daysRemaining is fractional (7.4) and T-7 was already sent (no reset, no duplicate)', async () => {
      const team = mockCandidateTeam({ lastReminderStage: 'T-7' });
      findManyTeamsMock.mockResolvedValue([team]);

      getTenantBillingSubMock.mockResolvedValue({
        subscription: {
          daysRemaining: 7.4,
          endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      const { req, res } = createMockReqRes({
        headers: { 'x-cron-secret': 'test-cron-secret-123' },
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(sendRenewalReminderMock).not.toHaveBeenCalled();
      expect(updateTeamMock).not.toHaveBeenCalled();
    });

    it('sends the T-7 reminder for fractional daysRemaining (7.4) when no stage is recorded (floors to 7)', async () => {
      const team = mockCandidateTeam({ lastReminderStage: null });
      findManyTeamsMock.mockResolvedValue([team]);

      getTenantBillingSubMock.mockResolvedValue({
        subscription: {
          daysRemaining: 7.4,
          endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      const { req, res } = createMockReqRes({
        headers: { 'x-cron-secret': 'test-cron-secret-123' },
      });

      await handler(req, res);

      expect(sendRenewalReminderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ahmed@acme.com',
          daysLeft: 7,
          milestone: 'T-7',
        })
      );
      expect(updateTeamMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastReminderStage: 'T-7' }),
        })
      );
    });

    it('sends EXPIRED when daysRemaining is 0.5 (floored to 0)', async () => {
      const team = mockCandidateTeam({ lastReminderStage: 'T-1' });
      findManyTeamsMock.mockResolvedValue([team]);

      getTenantBillingSubMock.mockResolvedValue({
        subscription: {
          daysRemaining: 0.5,
          endDate: new Date().toISOString(),
        },
      });

      const { req, res } = createMockReqRes({
        headers: { 'x-cron-secret': 'test-cron-secret-123' },
      });

      await handler(req, res);

      expect(sendRenewalReminderMock).toHaveBeenCalledWith(
        expect.objectContaining({ daysLeft: 0, milestone: 'EXPIRED' })
      );
      expect(updateTeamMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastReminderStage: 'EXPIRED' }),
        })
      );
    });

    it('falls back to endDate math when daysRemaining is NaN', async () => {
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockReturnValue(new Date('2026-09-09T00:00:00.000Z').getTime());

      try {
        const team = mockCandidateTeam({ lastReminderStage: null });
        findManyTeamsMock.mockResolvedValue([team]);

        getTenantBillingSubMock.mockResolvedValue({
          subscription: {
            daysRemaining: NaN,
            endDate: '2026-09-16T00:00:00.000Z',
          },
        });

        const { req, res } = createMockReqRes({
          headers: { 'x-cron-secret': 'test-cron-secret-123' },
        });

        await handler(req, res);

        expect(sendRenewalReminderMock).toHaveBeenCalledWith(
          expect.objectContaining({ daysLeft: 7, milestone: 'T-7' })
        );
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('treats Infinity daysRemaining as absent (endDate fallback)', async () => {
      const team = mockCandidateTeam({ lastReminderStage: null });
      findManyTeamsMock.mockResolvedValue([team]);

      getTenantBillingSubMock.mockResolvedValue({
        subscription: {
          daysRemaining: Infinity,
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      const { req, res } = createMockReqRes({
        headers: { 'x-cron-secret': 'test-cron-secret-123' },
      });

      await handler(req, res);

      expect(sendRenewalReminderMock).toHaveBeenCalledWith(
        expect.objectContaining({ daysLeft: 7, milestone: 'T-7' })
      );
    });
  });

  describe('Deduplication & Renewal Reset', () => {
    it('skips sending duplicate email if team is already in the same stage (idempotency)', async () => {
      const team = {
        id: 'team-1',
        name: 'Acme Corp',
        slug: 'acme',
        erpTenantId: 'tenant-1',
        lastReminderStage: 'T-7', // already sent T-7
        members: [{ user: { email: 'ahmed@acme.com', name: 'Ahmed' } }],
      };
      findManyTeamsMock.mockResolvedValue([team]);

      getTenantBillingSubMock.mockResolvedValue({
        subscription: {
          daysRemaining: 5, // still in T-7 window
          endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      const { req, res } = createMockReqRes({
        headers: { 'x-cron-secret': 'test-cron-secret-123' },
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(sendRenewalReminderMock).not.toHaveBeenCalled();
      expect(updateTeamMock).not.toHaveBeenCalled();
    });

    it('resets lastReminderStage when subscription is renewed (> 7 days left)', async () => {
      const team = {
        id: 'team-1',
        name: 'Acme Corp',
        slug: 'acme',
        erpTenantId: 'tenant-1',
        lastReminderStage: 'EXPIRED', // was previously expired
        members: [{ user: { email: 'ahmed@acme.com', name: 'Ahmed' } }],
      };
      findManyTeamsMock.mockResolvedValue([team]);

      getTenantBillingSubMock.mockResolvedValue({
        subscription: {
          daysRemaining: 30, // renewed to 30 days
          endDate: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ).toISOString(),
        },
      });

      const { req, res } = createMockReqRes({
        headers: { 'x-cron-secret': 'test-cron-secret-123' },
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(sendRenewalReminderMock).not.toHaveBeenCalled();
      expect(updateTeamMock).toHaveBeenCalledWith({
        where: { id: 'team-1' },
        data: {
          lastReminderStage: null,
          lastReminderSentAt: null,
        },
      });
    });
  });
});
