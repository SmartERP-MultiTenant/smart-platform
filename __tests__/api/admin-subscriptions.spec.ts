import { Prisma } from '@prisma/client';
import auditLogsHandler from 'pages/api/admin/audit-logs';
import revenueHandler from 'pages/api/admin/revenue';
import syncHandler from 'pages/api/admin/rules/sync';
import cancelHandler from 'pages/api/admin/subscriptions/[teamId]/cancel';
import extendHandler from 'pages/api/admin/subscriptions/[teamId]/extend';
import createHandler from 'pages/api/admin/subscriptions/[teamId]/index';
import trialOverrideHandler from 'pages/api/admin/subscriptions/[teamId]/trial-override';
import { ERP_M2M_READ_TIMEOUT_MS, ErpApiError, erp } from '@/lib/erp';
import { adminErrorCopy } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

// The REAL `classifyErpError` is deliberately kept (only `erp` is stubbed), so
// the status/code mapping asserted below is the shipping mapper and not a
// test-local copy. `@/lib/prisma` is mocked so the real audit store — including
// its redaction choke point — runs against a fake delegate.
jest.mock('@/lib/session', () => ({ getSession: jest.fn() }));

jest.mock('@/lib/env', () => ({
  __esModule: true,
  default: {
    erp: {
      apiUrl: 'http://erp.test/api',
      platformApiKey: 'test-platform-api-key',
    },
  },
}));

jest.mock('@/lib/erp', () => ({
  ...jest.requireActual('@/lib/erp'),
  erp: {
    getTenantBillingSubscription: jest.fn(),
    createTenantSubscription: jest.fn(),
    extendTenantSubscription: jest.fn(),
    cancelTenantSubscription: jest.fn(),
    trialOverrideTenantSubscription: jest.fn(),
    // `pages/api/admin/revenue` and `pages/api/admin/rules/sync` read these off
    // the same `erp` object. Leaving them out would make the reads `undefined`,
    // throw a `TypeError` inside those routes, and let their own catch blocks
    // answer with a degraded payload — a green test asserting nothing.
    listSubscriptionsM2M: jest.fn(),
    syncSubscriptionsModulesM2M: jest.fn(),
  },
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    team: { findUnique: jest.fn(), findFirst: jest.fn() },
    adminAuditLog: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const getSessionMock = getSession as unknown as jest.Mock;
const userFindUniqueMock = prisma.user.findUnique as unknown as jest.Mock;
const teamFindUniqueMock = prisma.team.findUnique as unknown as jest.Mock;
const teamFindFirstMock = prisma.team.findFirst as unknown as jest.Mock;
const auditCreateMock = prisma.adminAuditLog.create as unknown as jest.Mock;
const auditUpdateMock = prisma.adminAuditLog.update as unknown as jest.Mock;
const auditFindUniqueMock = prisma.adminAuditLog
  .findUnique as unknown as jest.Mock;
const auditFindManyMock = prisma.adminAuditLog.findMany as unknown as jest.Mock;
const auditCountMock = prisma.adminAuditLog.count as unknown as jest.Mock;

const erpGetSubscriptionMock = erp.getTenantBillingSubscription as jest.Mock;
const erpCreateMock = erp.createTenantSubscription as jest.Mock;
const erpExtendMock = erp.extendTenantSubscription as jest.Mock;
const erpCancelMock = erp.cancelTenantSubscription as jest.Mock;
const erpTrialOverrideMock = erp.trialOverrideTenantSubscription as jest.Mock;
const erpListSubscriptionsMock = erp.listSubscriptionsM2M as jest.Mock;
const erpSyncModulesMock = erp.syncSubscriptionsModulesM2M as jest.Mock;

/**
 * A distinctive string planted in mocked upstream failures. It stands in for a
 * real ERP response body, which `ErpApiError` carries verbatim. It must never
 * appear in a client response.
 */
const UPSTREAM_SECRET = 'UPSTREAM-SECRET-MUST-NOT-LEAK';

const LOG_ID = 'audit-log-1';
const TEAM_ID = 'team-1';
const ERP_TENANT_ID = 'erp-tenant-1';

const adminRow = {
  id: 'admin-1',
  email: 'admin@platform.test',
  name: 'Platform Admin',
  platformRole: 'PLATFORM_ADMIN',
};

const teamRow = { id: TEAM_ID, erpTenantId: ERP_TENANT_ID };

const createMockReqRes = (options: {
  method?: string;
  query?: Record<string, any>;
  body?: Record<string, any>;
}) => {
  const req = {
    method: options.method || 'POST',
    query: options.query || { teamId: TEAM_ID },
    body: options.body || {},
  } as any;

  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as any,
    setHeader: jest.fn((key: string, value: string) => {
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

/** Body that passes `addSubscriptionSchema`. */
const validCreateBody = {
  packageId: 'pkg-1',
  startDate: '2026-01-01',
  endDate: '2027-01-01',
  isTrial: false,
};

/**
 * Must be LATER than `FAR_FUTURE` (the mocked current end date), otherwise the
 * deliberate "an extend may not shorten a subscription" guard answers 422 before
 * the ERP is ever called.
 */
const validExtendBody = { newEndDate: '2040-06-01T00:00:00Z' };
const validTrialOverrideBody = { newTrialEndDate: '2026-09-01T00:00:00Z' };

/** Authenticates as a platform admin and resolves a linked team. */
const asAdminWithLinkedTeam = () => {
  getSessionMock.mockResolvedValue({ user: { id: adminRow.id } });
  userFindUniqueMock.mockResolvedValue(adminRow);
  teamFindUniqueMock.mockImplementation(({ where }: any) =>
    Promise.resolve(where.id === TEAM_ID ? teamRow : null)
  );
  teamFindFirstMock.mockResolvedValue(null);
};

const FAR_FUTURE = '2035-01-01T00:00:00Z';

const SUBSCRIPTION_WITH_SECRETS = {
  subscription: {
    tenantId: ERP_TENANT_ID,
    status: 'active',
    endDate: FAR_FUTURE,
    planName: 'Growth',
    // Must never be persisted nor returned.
    erpAccessToken: UPSTREAM_SECRET,
  },
};

const ROUTES = [
  { name: 'create', handler: createHandler, body: validCreateBody },
  { name: 'extend', handler: extendHandler, body: validExtendBody },
  { name: 'cancel', handler: cancelHandler, body: {} },
  {
    name: 'trial-override',
    handler: trialOverrideHandler,
    body: validTrialOverrideBody,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  auditCreateMock.mockResolvedValue({ id: LOG_ID });
  auditUpdateMock.mockResolvedValue({ id: LOG_ID });
  auditFindUniqueMock.mockResolvedValue(null);
  erpGetSubscriptionMock.mockResolvedValue(SUBSCRIPTION_WITH_SECRETS);
});

afterEach(() => {
  (console.error as unknown as jest.Mock).mockRestore();
  (console.warn as unknown as jest.Mock).mockRestore();
});

describe.each(ROUTES)(
  'admin subscription route — $name',
  ({ handler, body }) => {
    describe('guard & method contract', () => {
      it('returns 401 before any other work when there is no session', async () => {
        getSessionMock.mockResolvedValue(null);
        const { req, res } = createMockReqRes({ body });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          error: { message: 'Unauthorized' },
        });
        // Nothing downstream may have been touched.
        expect(erpCreateMock).not.toHaveBeenCalled();
        expect(erpExtendMock).not.toHaveBeenCalled();
        expect(erpCancelMock).not.toHaveBeenCalled();
        expect(erpTrialOverrideMock).not.toHaveBeenCalled();
        expect(auditCreateMock).not.toHaveBeenCalled();
      });

      it('returns 401 — not 422 — when an anonymous caller sends an invalid body', async () => {
        // Pins guard ORDERING, not just the guard: validation must not be able
        // to answer before authentication.
        getSessionMock.mockResolvedValue(null);
        const { req, res } = createMockReqRes({ body: { nonsense: true } });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
      });

      it('returns 403 when the session user is not a PLATFORM_ADMIN', async () => {
        getSessionMock.mockResolvedValue({ user: { id: 'regular-1' } });
        userFindUniqueMock.mockResolvedValue({
          id: 'regular-1',
          email: 'regular@platform.test',
          name: 'Regular',
          platformRole: null,
        });
        const { req, res } = createMockReqRes({ body });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
          error: { message: 'Forbidden' },
        });
        expect(erpExtendMock).not.toHaveBeenCalled();
      });

      it('returns 405 with an Allow header for a non-POST method', async () => {
        asAdminWithLinkedTeam();
        const { req, res } = createMockReqRes({ method: 'GET', body });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(405);
        expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST');
      });
    });

    describe('team resolution', () => {
      it('returns 404 for an unknown teamId and never reaches the ERP', async () => {
        getSessionMock.mockResolvedValue({ user: { id: adminRow.id } });
        userFindUniqueMock.mockResolvedValue(adminRow);
        teamFindUniqueMock.mockResolvedValue(null);
        teamFindFirstMock.mockResolvedValue(null);

        const { req, res } = createMockReqRes({
          query: { teamId: 'does-not-exist' },
          body,
        });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
          error: { message: 'team-not-found' },
        });

        // The blocker this pins: the raw client-supplied teamId must never be
        // forwarded to the ERP as a tenant id.
        expect(erpGetSubscriptionMock).not.toHaveBeenCalled();
        expect(erpCreateMock).not.toHaveBeenCalled();
        expect(erpExtendMock).not.toHaveBeenCalled();
        expect(erpCancelMock).not.toHaveBeenCalled();
        expect(erpTrialOverrideMock).not.toHaveBeenCalled();
        expect(auditCreateMock).not.toHaveBeenCalled();
      });

      it('returns 400 when the team has no ERP link', async () => {
        getSessionMock.mockResolvedValue({ user: { id: adminRow.id } });
        userFindUniqueMock.mockResolvedValue(adminRow);
        teamFindUniqueMock.mockImplementation(({ where }: any) =>
          Promise.resolve(
            where.id === TEAM_ID ? { id: TEAM_ID, erpTenantId: null } : null
          )
        );
        teamFindFirstMock.mockResolvedValue(null);

        const { req, res } = createMockReqRes({ body });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: { message: 'erp-not-linked' },
        });
        expect(erpGetSubscriptionMock).not.toHaveBeenCalled();
      });

      it('falls back to slug/erpTenantId lookups and uses the resolved ERP tenant id', async () => {
        getSessionMock.mockResolvedValue({ user: { id: adminRow.id } });
        userFindUniqueMock.mockResolvedValue(adminRow);
        teamFindUniqueMock.mockResolvedValue(null);
        teamFindFirstMock.mockResolvedValue(teamRow);
        erpCreateMock.mockResolvedValue({ ok: true });
        erpExtendMock.mockResolvedValue({ ok: true });
        erpCancelMock.mockResolvedValue({ ok: true });
        erpTrialOverrideMock.mockResolvedValue({ ok: true });

        const { req, res } = createMockReqRes({
          query: { teamId: 'acme-slug' },
          body,
        });

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        // Exact arity on purpose. The wrapper deliberately adds NO budget of its
        // own (pinned in `__tests__/lib/erp-classifier.spec.ts`), so the bound
        // has to come from the call site — a two-argument call here means the
        // pre-read can hang for the whole undici default and stall the
        // operator's mutation. `expect.any(AbortSignal)` is a real type check,
        // not `expect.anything()`.
        expect(erpGetSubscriptionMock).toHaveBeenCalledWith(
          'test-platform-api-key',
          ERP_TENANT_ID,
          expect.any(AbortSignal)
        );
      });
    });
  }
);

// ---------------------------------------------------------------------------
// Per-route behaviour
// ---------------------------------------------------------------------------

describe('POST /api/admin/subscriptions/[teamId] (create)', () => {
  beforeEach(() => {
    asAdminWithLinkedTeam();
  });

  it('creates the subscription through the CREATE endpoint and audits before/after', async () => {
    erpCreateMock.mockResolvedValue({ ok: true });

    const { req, res } = createMockReqRes({ body: validCreateBody });

    await createHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    // The CREATE row must come from the create endpoint, not a silent extend.
    expect(erpCreateMock).toHaveBeenCalledTimes(1);
    expect(erpExtendMock).not.toHaveBeenCalled();
    expect(erpCancelMock).not.toHaveBeenCalled();

    // One operation → one audit row: insert STARTED, then UPDATE the same row.
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock.mock.calls[0][0].where).toEqual({ id: LOG_ID });
    expect(auditUpdateMock.mock.calls[0][0].data).toMatchObject({
      status: 'SUCCEEDED',
    });
  });

  it('records the sanitized before/after snapshots without credential material', async () => {
    erpCreateMock.mockResolvedValue({ ok: true });

    const { req, res } = createMockReqRes({ body: validCreateBody });

    await createHandler(req, res);

    const started = auditCreateMock.mock.calls[0][0].data;
    const completed = auditUpdateMock.mock.calls[0][0].data;

    expect(started.before).toMatchObject({
      status: 'active',
      planName: 'Growth',
    });
    expect(completed.after).toMatchObject({ status: 'active' });

    // The ERP token planted in the upstream read must not be persisted.
    expect(JSON.stringify(started)).not.toContain(UPSTREAM_SECRET);
    expect(JSON.stringify(completed)).not.toContain(UPSTREAM_SECRET);
  });

  it('returns 422 for malformed dates and never calls the ERP', async () => {
    for (const bad of [
      '2026-13-45',
      '2026-01-01garbage',
      'March 5, 2026',
      '2026/1/1',
      '',
      '0000-00-00',
      '2026-02-30',
    ]) {
      jest.clearAllMocks();
      asAdminWithLinkedTeam();

      const { req, res } = createMockReqRes({
        body: { ...validCreateBody, startDate: bad },
      });

      await createHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(erpCreateMock).not.toHaveBeenCalled();
      expect(auditCreateMock).not.toHaveBeenCalled();
    }
  });

  it('accepts both accepted date shapes', async () => {
    erpCreateMock.mockResolvedValue({ ok: true });

    for (const good of ['2026-01-01', '2026-01-01T00:00:00.000Z']) {
      jest.clearAllMocks();
      asAdminWithLinkedTeam();
      erpCreateMock.mockResolvedValue({ ok: true });

      const { req, res } = createMockReqRes({
        body: { ...validCreateBody, startDate: good },
      });

      await createHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    }
  });

  it('returns 422 when endDate is not after startDate', async () => {
    const { req, res } = createMockReqRes({
      body: {
        ...validCreateBody,
        startDate: '2027-01-01',
        endDate: '2026-01-01',
      },
    });

    await createHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(erpCreateMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed packageId with 422', async () => {
    const { req, res } = createMockReqRes({
      body: { ...validCreateBody, packageId: '' },
    });

    await createHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('whitelists audit metadata — a planted unknown field is not persisted', async () => {
    erpCreateMock.mockResolvedValue({ ok: true });

    const { req, res } = createMockReqRes({
      body: { ...validCreateBody, secretAccessToken: UPSTREAM_SECRET },
    });

    await createHandler(req, res);

    expect(JSON.stringify(auditCreateMock.mock.calls[0][0].data)).not.toContain(
      UPSTREAM_SECRET
    );
  });

  it('records a failed before-state read as beforeFetchError instead of losing it', async () => {
    erpGetSubscriptionMock.mockRejectedValue(
      new ErpApiError(UPSTREAM_SECRET, 500)
    );
    erpCreateMock.mockResolvedValue({ ok: true });

    const { req, res } = createMockReqRes({ body: validCreateBody });

    await createHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(auditCreateMock.mock.calls[0][0].data.metadata).toMatchObject({
      beforeFetchError: 'erp-upstream-failure',
    });
  });

  it('treats a 404 on the before-read as "no subscription yet", not an error', async () => {
    erpGetSubscriptionMock.mockRejectedValue(
      new ErpApiError(UPSTREAM_SECRET, 404)
    );
    erpCreateMock.mockResolvedValue({ ok: true });

    const { req, res } = createMockReqRes({ body: validCreateBody });

    await createHandler(req, res);

    const createArgs = auditCreateMock.mock.calls[0][0].data;
    expect(createArgs.metadata.beforeFetchError).toBeUndefined();
    // Discriminating on purpose. `before` is explicitly set to `Prisma.DbNull`
    // for an absent snapshot, and `Prisma.DbNull` IS defined — so the previous
    // `toBeDefined()` assertion here could never fail, even if the route
    // started storing a fabricated before-state instead of recording the
    // absence.
    expect(createArgs.before).toBe(Prisma.DbNull);
    // The mutation itself still went ahead: a missing subscription is the
    // expected starting point for a CREATE.
    expect(erpCreateMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('POST /api/admin/subscriptions/[teamId]/extend (extend)', () => {
  beforeEach(() => {
    asAdminWithLinkedTeam();
    erpExtendMock.mockResolvedValue({ ok: true });
  });

  it('extends and resolves one audit row', async () => {
    const { req, res } = createMockReqRes({ body: validExtendBody });

    await extendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpExtendMock).toHaveBeenCalledWith(
      'test-platform-api-key',
      ERP_TENANT_ID,
      validExtendBody.newEndDate
    );
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a newEndDate in the past with 422 and never calls the ERP', async () => {
    const { req, res } = createMockReqRes({
      body: { newEndDate: '2020-01-01' },
    });

    await extendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'end-date-not-in-future' },
    });
    expect(erpExtendMock).not.toHaveBeenCalled();

    // The refused attempt is itself auditable: it resolves the STARTED row as
    // FAILED rather than leaving a phantom in-progress row.
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock.mock.calls[0][0].data).toMatchObject({
      status: 'FAILED',
      errorCode: 'end-date-not-in-future',
    });
  });

  it('rejects a newEndDate that does not lengthen the subscription (shortening is P3.2)', async () => {
    // Current end is 2035; asking for 2030 would shorten it.
    const { req, res } = createMockReqRes({
      body: { newEndDate: '2030-01-01T00:00:00Z' },
    });

    await extendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'end-date-not-after-current-end' },
    });
    expect(erpExtendMock).not.toHaveBeenCalled();
  });

  it('accepts a genuinely later date', async () => {
    const { req, res } = createMockReqRes({
      body: { newEndDate: '2040-01-01T00:00:00Z' },
    });

    await extendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpExtendMock).toHaveBeenCalledTimes(1);
  });

  it('fails open when the before-read failed, leaving the ERP as the authority', async () => {
    erpGetSubscriptionMock.mockRejectedValue(
      new ErpApiError(UPSTREAM_SECRET, 500)
    );

    const { req, res } = createMockReqRes({
      body: { newEndDate: '2040-01-01T00:00:00Z' },
    });

    await extendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpExtendMock).toHaveBeenCalledTimes(1);
    expect(auditCreateMock.mock.calls[0][0].data.metadata).toMatchObject({
      beforeFetchError: 'erp-upstream-failure',
    });
  });
});

describe('POST /api/admin/subscriptions/[teamId]/cancel (cancel)', () => {
  beforeEach(() => {
    asAdminWithLinkedTeam();
    erpCancelMock.mockResolvedValue({ ok: true });
  });

  it('cancels an active subscription', async () => {
    const { req, res } = createMockReqRes({ body: {} });

    await cancelHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpCancelMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock.mock.calls[0][0].data).toMatchObject({
      status: 'SUCCEEDED',
    });
  });

  it.each(['canceled', 'expired', 'suspended'])(
    'returns 409 and does not call the ERP when the subscription is %s',
    async (status) => {
      erpGetSubscriptionMock.mockResolvedValue({
        subscription: { status, endDate: FAR_FUTURE },
      });

      const { req, res } = createMockReqRes({ body: {} });

      await cancelHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: { message: 'subscription-not-active' },
      });
      expect(erpCancelMock).not.toHaveBeenCalled();
      expect(auditUpdateMock.mock.calls[0][0].data).toMatchObject({
        status: 'FAILED',
        errorCode: 'subscription-not-active',
      });
    }
  );

  it('accepts a trial subscription as cancellable', async () => {
    erpGetSubscriptionMock.mockResolvedValue({
      subscription: { status: 'trial', endDate: FAR_FUTURE },
    });

    const { req, res } = createMockReqRes({ body: {} });

    await cancelHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpCancelMock).toHaveBeenCalledTimes(1);
  });

  it('fails open when the status could not be read', async () => {
    erpGetSubscriptionMock.mockRejectedValue(
      new ErpApiError(UPSTREAM_SECRET, 503)
    );

    const { req, res } = createMockReqRes({ body: {} });

    await cancelHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpCancelMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/admin/subscriptions/[teamId]/trial-override', () => {
  beforeEach(() => {
    asAdminWithLinkedTeam();
    erpTrialOverrideMock.mockResolvedValue({ ok: true });
  });

  it('calls the TRIAL-OVERRIDE endpoint — never a disguised extend', async () => {
    const { req, res } = createMockReqRes({ body: validTrialOverrideBody });

    await trialOverrideHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpTrialOverrideMock).toHaveBeenCalledWith(
      'test-platform-api-key',
      ERP_TENANT_ID,
      validTrialOverrideBody.newTrialEndDate
    );
    // Ticket P5.4 §4: "never a disguised extend".
    expect(erpExtendMock).not.toHaveBeenCalled();
    expect(erpCreateMock).not.toHaveBeenCalled();
    expect(erpCancelMock).not.toHaveBeenCalled();

    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('returns 422 for an unparseable trial end date', async () => {
    const { req, res } = createMockReqRes({
      body: { newTrialEndDate: 'next tuesday' },
    });

    await trialOverrideHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(erpTrialOverrideMock).not.toHaveBeenCalled();
    expect(erpExtendMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ERP failure mapping (shared contract)
// ---------------------------------------------------------------------------

describe.each([
  {
    label:
      'upstream 404 → 404 erp-not-found (the ERP has no such subscription)',
    error: () => new ErpApiError(UPSTREAM_SECRET, 404),
    status: 404,
    code: 'erp-not-found',
  },
  {
    label: 'upstream 401 → 502 (never a bare 401 that would log the admin out)',
    error: () => new ErpApiError(UPSTREAM_SECRET, 401),
    status: 502,
    code: 'erp-auth-failed',
  },
  {
    label: 'upstream 403 → 502 erp-auth-failed',
    error: () => new ErpApiError(UPSTREAM_SECRET, 403),
    status: 502,
    code: 'erp-auth-failed',
  },
  {
    label: 'upstream 500 → 502 erp-upstream-failure',
    error: () => new ErpApiError(UPSTREAM_SECRET, 500),
    status: 502,
    code: 'erp-upstream-failure',
  },
  {
    label: 'upstream 400 → 400 erp-bad-request',
    error: () => new ErpApiError(UPSTREAM_SECRET, 400),
    status: 400,
    code: 'erp-bad-request',
  },
  {
    label: 'upstream 409 → 409 erp-conflict',
    error: () => new ErpApiError(UPSTREAM_SECRET, 409),
    status: 409,
    code: 'erp-conflict',
  },
  {
    label: 'upstream 422 → 422 erp-rejected',
    error: () => new ErpApiError(UPSTREAM_SECRET, 422),
    status: 422,
    code: 'erp-rejected',
  },
  {
    label: 'unparseable 2xx body → 502 erp-malformed-response',
    error: () =>
      new ErpApiError(UPSTREAM_SECRET, 200, 'ERP_MALFORMED_RESPONSE'),
    status: 502,
    code: 'erp-malformed-response',
  },
  {
    label: 'a timed-out/aborted request → 503 erp-unavailable',
    error: () => Object.assign(new Error('aborted'), { name: 'AbortError' }),
    status: 503,
    code: 'erp-unavailable',
  },
  {
    label: 'a refused connection → 503 erp-unavailable',
    error: () =>
      Object.assign(new TypeError('fetch failed'), { code: 'ECONNREFUSED' }),
    status: 503,
    code: 'erp-unavailable',
  },
  {
    label: 'an unresolvable ERP host → 503 erp-unavailable',
    error: () => Object.assign(new Error('dns'), { code: 'ENOTFOUND' }),
    status: 503,
    code: 'erp-unavailable',
  },
])('ERP failure mapping — $label', ({ error, status, code }) => {
  it('maps the failure and never leaks the upstream body', async () => {
    asAdminWithLinkedTeam();
    erpExtendMock.mockRejectedValue(error());

    const { req, res } = createMockReqRes({ body: validExtendBody });

    await extendHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ error: { message: code } });

    // The inviolable property: upstream text never reaches the client.
    expect(JSON.stringify(res.body)).not.toContain(UPSTREAM_SECRET);
    expect(JSON.stringify(res.body)).not.toContain('fetch failed');
    expect(JSON.stringify(res.body)).not.toContain('aborted');

    // A failed mutation is still recorded, as FAILED, on the STARTED row.
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock.mock.calls[0][0].data).toMatchObject({
      status: 'FAILED',
      errorCode: code,
    });
    expect(JSON.stringify(auditUpdateMock.mock.calls[0][0].data)).not.toContain(
      UPSTREAM_SECRET
    );
  });
});

describe('ERP configuration', () => {
  it('answers 503 when the platform M2M key is not configured', async () => {
    const envModule = jest.requireMock('@/lib/env');
    const previousKey = envModule.default.erp.platformApiKey;
    envModule.default.erp.platformApiKey = '';

    asAdminWithLinkedTeam();

    try {
      const { req, res } = createMockReqRes({ body: validExtendBody });

      await extendHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(erpExtendMock).not.toHaveBeenCalled();

      // The status alone was never the problem: the route raises
      // `ApiError(503, 'erp-not-configured', { expose: true })` precisely so the
      // operator can tell a misconfigured M2M key from a genuine internal
      // fault. Before `expose` existed, `apiErrorMessage` collapsed every 5xx to
      // the opaque `internal-error`, hiding the one thing that is actionable.
      expect(res.json).toHaveBeenCalledWith({
        error: { message: 'erp-not-configured' },
      });
    } finally {
      envModule.default.erp.platformApiKey = previousKey;
    }
  });

  // The deliberate 5xx code must stay localizable: a raw `erp-*` token reaching
  // the screen is the regression the tightening itself was meant to prevent, so
  // this pins the code to a real UI mapping rather than only to the wire format.
  it('emits a 503 code the admin UI can localize', async () => {
    const envModule = jest.requireMock('@/lib/env');
    const previousKey = envModule.default.erp.platformApiKey;
    envModule.default.erp.platformApiKey = '';

    asAdminWithLinkedTeam();

    try {
      const { req, res } = createMockReqRes({ body: validExtendBody });

      await extendHandler(req, res);

      const code = res.body.error.message;

      // A code, not a sentence — the operator sees copy, never the token.
      expect(code).toBe('erp-not-configured');
      expect(adminErrorCopy(code, (key) => `t:${key}`, 'fallback')).toBe(
        't:admin-error-erp-not-configured'
      );
    } finally {
      envModule.default.erp.platformApiKey = previousKey;
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/audit-logs
// ---------------------------------------------------------------------------

describe('GET /api/admin/audit-logs', () => {
  const asAdmin = () => {
    getSessionMock.mockResolvedValue({ user: { id: adminRow.id } });
    userFindUniqueMock.mockResolvedValue(adminRow);
  };

  const asRequests = (query: Record<string, any> = {}) =>
    createMockReqRes({ method: 'GET', query, body: {} });

  beforeEach(() => {
    asAdmin();
    auditFindManyMock.mockResolvedValue([]);
    auditCountMock.mockResolvedValue(0);
  });

  it('returns 401 without a session', async () => {
    getSessionMock.mockResolvedValue(null);

    const { req, res } = asRequests();
    await auditLogsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin session', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'regular-1' } });
    userFindUniqueMock.mockResolvedValue({
      id: 'regular-1',
      email: 'regular@platform.test',
      name: 'Regular',
      platformRole: null,
    });

    const { req, res } = asRequests();
    await auditLogsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it('is GET-only (405 with Allow)', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      query: {},
      body: {},
    });

    await auditLogsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
  });

  it('returns the documented envelope', async () => {
    const items = [{ id: 'a-1', action: 'subscription.extend' }];
    auditFindManyMock.mockResolvedValue(items);
    auditCountMock.mockResolvedValue(1);

    const { req, res } = asRequests({ page: '1', limit: '10' });
    await auditLogsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: { items, total: 1, page: 1, limit: 10, hasMore: false },
    });
  });

  it('clamps an unbounded limit to the hard ceiling', async () => {
    const { req, res } = asRequests({ limit: '1000000' });
    await auditLogsHandler(req, res);

    expect(auditFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it('clamps negative page/limit instead of passing them to Prisma', async () => {
    const { req, res } = asRequests({ page: '-3', limit: '-5' });
    await auditLogsHandler(req, res);

    expect(auditFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 1 })
    );
  });

  it('falls back to the default page size for a non-numeric limit', async () => {
    const { req, res } = asRequests({ limit: 'abc' });
    await auditLogsHandler(req, res);

    expect(auditFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 })
    );
  });

  it('answers 5xx — never a fake empty 200 — when the audit store fails', async () => {
    auditFindManyMock.mockRejectedValue(
      new Error('column "actorEmail" does not exist')
    );

    const { req, res } = asRequests();
    await auditLogsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'internal-error' },
    });
    expect(JSON.stringify(res.body)).not.toContain('actorEmail');
  });
});

// ---------------------------------------------------------------------------
// M2M read budget
// ---------------------------------------------------------------------------

/**
 * An abort raised by `AbortSignal.timeout` (or a caller signal). `name` is the
 * only reliable signal `classifyErpError` can read across the ES5 boundary.
 */
const timeoutError = () =>
  Object.assign(new Error('The operation was aborted due to timeout'), {
    name: 'TimeoutError',
  });

/** A distinctive `endDate` that only the mutation response carries. */
const MUTATION_END_DATE = '2036-02-02T00:00:00Z';

const MUTATION_RESPONSE = {
  subscription: {
    tenantId: ERP_TENANT_ID,
    status: 'active',
    endDate: MUTATION_END_DATE,
  },
};

describe('M2M read budget — both ERP reads on every mutation are bounded', () => {
  beforeEach(() => {
    asAdminWithLinkedTeam();
    erpCreateMock.mockResolvedValue(MUTATION_RESPONSE);
    erpExtendMock.mockResolvedValue(MUTATION_RESPONSE);
    erpCancelMock.mockResolvedValue(MUTATION_RESPONSE);
    erpTrialOverrideMock.mockResolvedValue(MUTATION_RESPONSE);
  });

  // The M2M read wrapper adds NO budget of its own — that guarantee is pinned
  // in `__tests__/lib/erp-classifier.spec.ts` so `adminDashboard` keeps owning
  // its timeout. The bound therefore has to come from the call site, and a
  // two-argument call here would let a hung ERP socket stall the operator's
  // mutation for the whole undici default.
  it.each(ROUTES)(
    'passes a real AbortSignal on the $name pre-read and post-read',
    async ({ handler, body }) => {
      const { req, res } = createMockReqRes({ body });

      await handler(req, res);

      // One read for the "before" snapshot, one for the "after" snapshot.
      expect(erpGetSubscriptionMock).toHaveBeenCalledTimes(2);

      for (const [apiKey, tenantId, signal] of erpGetSubscriptionMock.mock
        .calls) {
        expect(apiKey).toBe('test-platform-api-key');
        expect(tenantId).toBe(ERP_TENANT_ID);
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(typeof signal.addEventListener).toBe('function');
      }

      // A fresh signal per read, not one shared instance: the first read's
      // consumed budget must not shorten the second read's.
      expect(erpGetSubscriptionMock.mock.calls[0][2]).not.toBe(
        erpGetSubscriptionMock.mock.calls[1][2]
      );
    }
  );

  it('bounds each read with the dedicated read budget, not the mutation budget', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');

    try {
      const { req, res } = createMockReqRes({ body: validCreateBody });

      await createHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(timeoutSpy).toHaveBeenCalledWith(ERP_M2M_READ_TIMEOUT_MS);
      // The best-effort read must give up well before the mutation does —
      // inheriting the mutation budget would defeat the point.
      expect(ERP_M2M_READ_TIMEOUT_MS).toBeLessThan(15_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it.each(ROUTES)(
    'degrades a timed-out $name pre-read to beforeFetchError and still mutates',
    async ({ handler, body }) => {
      erpGetSubscriptionMock
        .mockRejectedValueOnce(timeoutError())
        .mockResolvedValueOnce(SUBSCRIPTION_WITH_SECRETS);

      const { req, res } = createMockReqRes({ body });

      await handler(req, res);

      // The mutation went ahead: a transient read failure must not block the
      // operator.
      expect(res.status).toHaveBeenCalledWith(200);

      const createArgs = auditCreateMock.mock.calls[0][0].data;
      expect(createArgs.metadata).toMatchObject({
        beforeFetchError: 'erp-unavailable',
      });
      // The row records the absence honestly rather than inventing a
      // before-state.
      expect(createArgs.before).toBe(Prisma.DbNull);
    }
  );

  it.each(ROUTES)(
    'falls back to the mutation response when the $name post-read times out',
    async ({ handler, body }) => {
      erpGetSubscriptionMock
        .mockResolvedValueOnce(SUBSCRIPTION_WITH_SECRETS)
        .mockRejectedValueOnce(timeoutError());

      const { req, res } = createMockReqRes({ body });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);

      const updateData = auditUpdateMock.mock.calls[0][0].data;
      expect(updateData.status).toBe('SUCCEEDED');
      // `MUTATION_END_DATE` exists ONLY on the mutation response, so this
      // proves the fallback used it rather than the pre-read snapshot (whose
      // `endDate` is `FAR_FUTURE`). A row that silently lost its `after`
      // evidence would fail here.
      expect(updateData.after).toMatchObject({
        tenantId: ERP_TENANT_ID,
        status: 'active',
        endDate: MUTATION_END_DATE,
      });
    }
  );
});

// ---------------------------------------------------------------------------
// /api/admin/revenue — guard ordering
// ---------------------------------------------------------------------------

describe('GET /api/admin/revenue — the guard runs before the method switch', () => {
  const asAdmin = () => {
    getSessionMock.mockResolvedValue({ user: { id: adminRow.id } });
    userFindUniqueMock.mockResolvedValue(adminRow);
  };

  const asRevenueRequest = (method: string) =>
    createMockReqRes({ method, query: {}, body: {} });

  beforeEach(() => {
    asAdmin();
    erpListSubscriptionsMock.mockResolvedValue([]);
  });

  it.each(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])(
    'answers 401 — never 405 — for an anonymous %s',
    async (method) => {
      getSessionMock.mockResolvedValue(null);

      const { req, res } = asRevenueRequest(method);

      await revenueHandler(req, res);

      // The defect this pins: the route used to switch on `req.method` first
      // and guard inside `handleGET`, so an anonymous POST learned the verb was
      // wrong instead of learning it was not authenticated.
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(erpListSubscriptionsMock).not.toHaveBeenCalled();
    }
  );

  it.each(['GET', 'POST'])(
    'answers 403 for an authenticated non-admin using %s',
    async (method) => {
      getSessionMock.mockResolvedValue({ user: { id: 'regular-1' } });
      userFindUniqueMock.mockResolvedValue({
        id: 'regular-1',
        email: 'regular@platform.test',
        name: 'Regular',
        platformRole: null,
      });

      const { req, res } = asRevenueRequest(method);

      await revenueHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(erpListSubscriptionsMock).not.toHaveBeenCalled();
    }
  );

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])(
    'still answers 405 with an Allow header for an authenticated admin using %s',
    async (method) => {
      const { req, res } = asRevenueRequest(method);

      await revenueHandler(req, res);

      // The verb guard must survive the hoist — it is only the *ordering*
      // that changed.
      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
      expect(erpListSubscriptionsMock).not.toHaveBeenCalled();
    }
  );

  it('serves the aggregate payload to an admin GET', async () => {
    const { req, res } = asRevenueRequest('GET');

    await revenueHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpListSubscriptionsMock).toHaveBeenCalledWith(
      'test-platform-api-key'
    );
    expect(res.body.data.ok).toBe(true);
  });

  it('degrades an unreachable ERP to a 200 with a safe code, never the upstream text', async () => {
    erpListSubscriptionsMock.mockRejectedValue(
      new ErpApiError(UPSTREAM_SECRET, 500)
    );

    const { req, res } = asRevenueRequest('GET');

    await revenueHandler(req, res);

    // The UI never crashes: the degraded contract is a 200 with `ok: false`.
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.data.ok).toBe(false);
    expect(res.body.data.error).toBe('erp-unreachable');
    expect(JSON.stringify(res.body)).not.toContain(UPSTREAM_SECRET);
  });
});

// ---------------------------------------------------------------------------
// /api/admin/rules/sync — body validation
// ---------------------------------------------------------------------------

describe('POST /api/admin/rules/sync — packageId validation', () => {
  const VALID_PACKAGE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  beforeEach(() => {
    asAdminWithLinkedTeam();
    erpSyncModulesMock.mockResolvedValue({ synced: 3 });
  });

  it('rejects a non-UUID packageId with 422 and never reaches the ERP', async () => {
    const { req, res } = createMockReqRes({
      body: { packageId: 'not-a-uuid' },
    });

    await syncHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'Validation Error: invalid-package-id' },
    });
    // The value would otherwise be forwarded to the ERP *and* become the audit
    // row's `targetId` — the same class as the team-resolution defect.
    expect(erpSyncModulesMock).not.toHaveBeenCalled();
    // Rejected before the audit row is opened, so no phantom STARTED entry.
    expect(auditCreateMock).not.toHaveBeenCalled();
    expect(auditUpdateMock).not.toHaveBeenCalled();
  });

  it('forwards a valid UUID and audits it as the target', async () => {
    const { req, res } = createMockReqRes({
      body: { packageId: VALID_PACKAGE_ID },
    });

    await syncHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpSyncModulesMock).toHaveBeenCalledWith(
      'test-platform-api-key',
      VALID_PACKAGE_ID
    );
    expect(auditCreateMock.mock.calls[0][0].data).toMatchObject({
      action: 'package.modules_sync',
      targetType: 'package',
      targetId: VALID_PACKAGE_ID,
    });
  });

  it('still treats an absent packageId as sync-all', async () => {
    const { req, res } = createMockReqRes({ body: {} });

    await syncHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpSyncModulesMock).toHaveBeenCalledWith(
      'test-platform-api-key',
      undefined
    );
    expect(auditCreateMock.mock.calls[0][0].data).toMatchObject({
      targetId: 'ALL_PACKAGES',
    });
  });

  it('resolves one audit row per sync instead of leaving a phantom STARTED', async () => {
    const { req, res } = createMockReqRes({ body: {} });

    await syncHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock.mock.calls[0][0].where).toEqual({ id: LOG_ID });
    expect(auditUpdateMock.mock.calls[0][0].data.status).toBe('SUCCEEDED');
  });
});
