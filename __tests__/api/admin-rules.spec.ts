import env from '@/lib/env';
import { ErpApiError, erp } from '@/lib/erp';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import rulesIndexHandler from 'pages/api/admin/rules';
import planHandler from 'pages/api/admin/rules/plans/[planId]';
import syncHandler from 'pages/api/admin/rules/sync';

/**
 * Coverage for `pages/api/admin/rules/*`.
 *
 * These three routes had no spec at all, which is how two defects survived
 * review: `planId` was forwarded to the ERP and persisted as an audit
 * `targetId` with only a "is it a string" check, and the audit seam was called
 * in a STARTED→terminal sequence while discarding the started row's id (so
 * every save wrote a phantom `STARTED` row plus a detached terminal row). Both
 * are pinned below.
 *
 * The mocks sit at the boundaries on purpose: the REAL guard
 * (`requirePlatformAdmin`), the REAL zod schemas, the REAL audit store and the
 * SHIPPING `classifyErpError` all run, so what is asserted is the shipping
 * behaviour rather than a test-local re-implementation of it. Only `erp`,
 * `prisma` and the session are stubbed.
 */
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
    getPackagesM2M: jest.fn(),
    getSystemModulesM2M: jest.fn(),
    updatePackageModulesM2M: jest.fn(),
    syncSubscriptionsModulesM2M: jest.fn(),
  },
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    adminAuditLog: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

const getSessionMock = getSession as unknown as jest.Mock;
const userFindUniqueMock = prisma.user.findUnique as unknown as jest.Mock;
const auditCreateMock = prisma.adminAuditLog.create as unknown as jest.Mock;
const auditUpdateMock = prisma.adminAuditLog.update as unknown as jest.Mock;
const auditFindUniqueMock = prisma.adminAuditLog
  .findUnique as unknown as jest.Mock;

const erpGetPackagesMock = erp.getPackagesM2M as jest.Mock;
const erpGetModulesMock = erp.getSystemModulesM2M as jest.Mock;
const erpUpdateModulesMock = erp.updatePackageModulesM2M as jest.Mock;
const erpSyncModulesMock = erp.syncSubscriptionsModulesM2M as jest.Mock;

/** `erp.platformApiKey` is read per request, so it can be blanked per test. */
const envErp = env.erp as { platformApiKey: string };

const LOG_ID = 'audit-log-1';
const PACKAGE_ID = '11111111-1111-4111-8111-111111111111';
const MODULE_A = '22222222-2222-4222-8222-222222222222';
const MODULE_B = '33333333-3333-4333-8333-333333333333';

/** Stands in for an ERP response body, which must never reach a client. */
const UPSTREAM_SECRET = 'UPSTREAM-SECRET-MUST-NOT-LEAK';

const adminRow = {
  id: 'admin-1',
  email: 'admin@platform.test',
  name: 'Platform Admin',
  platformRole: 'PLATFORM_ADMIN',
};

/** A real non-admin has no platform role — the guard rejects on the value. */
const memberRow = {
  id: 'admin-1',
  email: 'member@platform.test',
  name: 'Team Member',
  platformRole: null,
};

const createMockReqRes = (options: {
  method?: string;
  query?: Record<string, any>;
  body?: any;
}) => {
  const req = {
    method: options.method || 'GET',
    query: options.query || {},
    body: options.body ?? {},
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

const asAdmin = () => {
  getSessionMock.mockResolvedValue({ user: { id: adminRow.id } });
  userFindUniqueMock.mockResolvedValue(adminRow);
};

const asMember = () => {
  getSessionMock.mockResolvedValue({ user: { id: memberRow.id } });
  userFindUniqueMock.mockResolvedValue(memberRow);
};

const asAnonymous = () => getSessionMock.mockResolvedValue(null);

const validPlanBody = {
  systemModuleIds: [MODULE_A],
  syncExistingSubscriptions: true,
};

/** The three routes, with the verb each one accepts. */
const ROUTES = [
  {
    name: 'GET /api/admin/rules',
    handler: rulesIndexHandler,
    method: 'GET',
    allow: 'GET',
    query: {},
  },
  {
    name: 'POST /api/admin/rules/sync',
    handler: syncHandler,
    method: 'POST',
    allow: 'POST',
    query: {},
  },
  {
    name: 'PUT /api/admin/rules/plans/[planId]',
    handler: planHandler,
    method: 'PUT',
    allow: 'PUT',
    query: { planId: PACKAGE_ID },
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  envErp.platformApiKey = 'test-platform-api-key';
  auditCreateMock.mockResolvedValue({ id: LOG_ID });
  auditUpdateMock.mockResolvedValue({ id: LOG_ID });
  auditFindUniqueMock.mockResolvedValue(null);

  erpGetPackagesMock.mockResolvedValue([{ id: PACKAGE_ID, name: 'Growth' }]);
  erpGetModulesMock.mockResolvedValue([{ code: 'MOD_A' }]);
  erpUpdateModulesMock.mockResolvedValue({
    id: PACKAGE_ID,
    name: 'Growth',
    systemModuleCodes: ['MOD_A'],
  });
  erpSyncModulesMock.mockResolvedValue({ message: 'synced' });
});

afterEach(() => {
  (console.error as unknown as jest.Mock).mockRestore();
  (console.warn as unknown as jest.Mock).mockRestore();
});

// ---------------------------------------------------------------------------
// Guard ordering — the guard must run before the method switch
// ---------------------------------------------------------------------------

describe.each(ROUTES)(
  '$name — the guard runs before the method switch',
  ({ handler, method, allow, query }) => {
    it('answers 401 — never 405 — for an anonymous request', async () => {
      asAnonymous();

      // A verb the route does not accept. If the method check ran first this
      // would be 405, which tells an anonymous caller the route exists and
      // leaks the allowed verb set before authenticating them.
      const { req, res } = createMockReqRes({
        method: method === 'GET' ? 'DELETE' : 'GET',
        query,
      });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.setHeader).not.toHaveBeenCalledWith(
        'Allow',
        expect.anything()
      );
    });

    it('answers 403 for an authenticated caller who is not a platform admin', async () => {
      asMember();

      const { req, res } = createMockReqRes({ method, query });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it(`answers 405 with Allow: ${allow} for an admin using the wrong verb`, async () => {
      asAdmin();

      const wrongMethod = method === 'GET' ? 'POST' : 'GET';
      const { req, res } = createMockReqRes({ method: wrongMethod, query });

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.setHeader).toHaveBeenCalledWith('Allow', allow);
      expect(res.json).toHaveBeenCalledWith({
        error: { message: `Method ${wrongMethod} Not Allowed` },
      });
    });
  }
);

// ---------------------------------------------------------------------------
// Guard before VALIDATION, not just before the method switch
// ---------------------------------------------------------------------------

describe('guard ordering — a malformed request from an anonymous caller is 401', () => {
  it('answers 401, not 400, for an anonymous PUT with a malformed planId', async () => {
    // The planId check throws `ApiError(400)`. If it ran before the guard, an
    // anonymous prober could distinguish "malformed id" from "not authorised",
    // and the endpoint would confirm it parses ids at all.
    asAnonymous();

    const { req, res } = createMockReqRes({
      method: 'PUT',
      query: { planId: 'not-a-uuid' },
      body: validPlanBody,
    });

    await planHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).not.toHaveBeenCalledWith({
      error: { message: 'invalid-plan-id' },
    });
  });

  it('answers 401, not 422, for an anonymous sync with a malformed body', async () => {
    asAnonymous();

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { packageId: 'not-a-uuid' },
    });

    await syncHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(erpSyncModulesMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// planId validation (path segment → forwarded upstream AND persisted as targetId)
// ---------------------------------------------------------------------------

describe('PUT /api/admin/rules/plans/[planId] — planId is validated', () => {
  it.each([
    ['a non-UUID string', 'not-a-uuid'],
    ['an empty string', ''],
    ['a truncated UUID', '11111111-1111-4111-8111'],
    ['a non-hex character in the UUID', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'],
    [
      'a UUID carrying a trailing space',
      '11111111-1111-4111-8111-111111111111 ',
    ],
    [
      'a hyphen-less 32-character hex string',
      '11111111111111111111111111111111',
    ],
    ['a missing planId', undefined],
    ['a repeated planId, which arrives as an array', [PACKAGE_ID, PACKAGE_ID]],
    ['a numeric planId', 42],
    ['an object planId', { evil: true }],
  ])(
    'answers 400 invalid-plan-id for %s and reaches neither the ERP nor the audit store',
    async (_label, planId) => {
      asAdmin();

      const { req, res } = createMockReqRes({
        method: 'PUT',
        query: { planId },
        body: validPlanBody,
      });

      await planHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: { message: 'invalid-plan-id' },
      });
      // The value is both an ERP path segment and an audit `targetId`, so a
      // rejection that still called either would defeat the check.
      expect(erpUpdateModulesMock).not.toHaveBeenCalled();
      expect(auditCreateMock).not.toHaveBeenCalled();
      expect(auditUpdateMock).not.toHaveBeenCalled();
    }
  );

  it('checks planId BEFORE the body, so a request malformed in both ways is 400 not 422', async () => {
    asAdmin();

    const { req, res } = createMockReqRes({
      method: 'PUT',
      query: { planId: 'not-a-uuid' },
      body: { systemModuleIds: 'not-an-array' },
    });

    await planHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'invalid-plan-id' },
    });
  });

  it('accepts any UUID-SHAPED planId, not only RFC-4122 versioned ones', async () => {
    // Measured against the shipping zod (3.25.64), not assumed: `z.string()
    // .uuid()` checks the canonical 8-4-4-4-12 hex shape and does NOT enforce
    // the version or variant nibbles, so `…-9111-…` (version 9) and
    // `…-1111-…` (version 1) both pass. The standard these routes apply is
    // therefore "UUID-shaped", which is all the ERP needs since it parses the
    // value as a `Guid`. Pinned so a future zod upgrade that tightens this
    // surfaces here as a deliberate decision rather than as a mystery 400.
    asAdmin();

    const { req, res } = createMockReqRes({
      method: 'PUT',
      query: { planId: '11111111-1111-9111-8111-111111111111' },
      body: validPlanBody,
    });

    await planHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpUpdateModulesMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// plans/[planId] body contract
// ---------------------------------------------------------------------------

describe('PUT /api/admin/rules/plans/[planId] — body contract', () => {
  it.each([
    ['a string instead of an array', { systemModuleIds: 'nope' }],
    ['an array holding a non-UUID', { systemModuleIds: ['not-a-uuid'] }],
    [
      'an array mixing a UUID with a non-UUID',
      { systemModuleIds: [MODULE_A, 'nope'] },
    ],
    ['a missing systemModuleIds', {}],
    ['an explicit null', { systemModuleIds: null }],
    ['an object instead of an array', { systemModuleIds: { 0: MODULE_A } }],
  ])(
    'answers 422 for %s and never reaches the ERP or the audit store',
    async (_label, body) => {
      asAdmin();

      const { req, res } = createMockReqRes({
        method: 'PUT',
        query: { planId: PACKAGE_ID },
        body,
      });

      await planHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      // Rejected before the audit row is opened, so no `STARTED` entry is left
      // behind for a request that never touched the ERP.
      expect(erpUpdateModulesMock).not.toHaveBeenCalled();
      expect(auditCreateMock).not.toHaveBeenCalled();
      expect(auditUpdateMock).not.toHaveBeenCalled();
    }
  );

  it('answers 422 for a non-boolean syncExistingSubscriptions', async () => {
    asAdmin();

    const { req, res } = createMockReqRes({
      method: 'PUT',
      query: { planId: PACKAGE_ID },
      body: { systemModuleIds: [MODULE_A], syncExistingSubscriptions: 'yes' },
    });

    await planHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(erpUpdateModulesMock).not.toHaveBeenCalled();
  });

  it('accepts an EMPTY systemModuleIds array — "deselect all + save" is a supported flow', async () => {
    // Pinned deliberately: an empty array is how an operator revokes every
    // module from a plan. A `min(1)` added for tidiness would silently break
    // that flow, and nothing else in the suite would notice.
    asAdmin();

    const { req, res } = createMockReqRes({
      method: 'PUT',
      query: { planId: PACKAGE_ID },
      body: { systemModuleIds: [], syncExistingSubscriptions: true },
    });

    await planHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpUpdateModulesMock).toHaveBeenCalledWith(
      'test-platform-api-key',
      PACKAGE_ID,
      [],
      true
    );
  });

  it('uses the planId as the audit targetId and forwards the parsed ids', async () => {
    asAdmin();

    const { req, res } = createMockReqRes({
      method: 'PUT',
      query: { planId: PACKAGE_ID },
      body: {
        systemModuleIds: [MODULE_A, MODULE_B],
        syncExistingSubscriptions: false,
      },
    });

    await planHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpUpdateModulesMock).toHaveBeenCalledWith(
      'test-platform-api-key',
      PACKAGE_ID,
      [MODULE_A, MODULE_B],
      false
    );
    expect(auditCreateMock.mock.calls[0][0].data).toMatchObject({
      action: 'package.modules_update',
      targetType: 'package',
      targetId: PACKAGE_ID,
      status: 'STARTED',
    });
  });

  it('defaults syncExistingSubscriptions to true when the field is omitted', async () => {
    // The platform-side default is `true` while the ERP DTO's own default is
    // `false`, so this is a deliberate choice that must not drift.
    asAdmin();

    const { req, res } = createMockReqRes({
      method: 'PUT',
      query: { planId: PACKAGE_ID },
      body: { systemModuleIds: [MODULE_A] },
    });

    await planHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpUpdateModulesMock).toHaveBeenCalledWith(
      'test-platform-api-key',
      PACKAGE_ID,
      [MODULE_A],
      true
    );
  });
});

// ---------------------------------------------------------------------------
// sync — packageId is optional, and means "every package" when absent
// ---------------------------------------------------------------------------

describe('POST /api/admin/rules/sync — packageId contract', () => {
  // Every rejected shape must yield the SAME stable code. Setting only the
  // `.uuid()` refinement message left WRONG-TYPED values (`42`, `{}`, `[…]`,
  // `null`, `true`) falling through to zod's own prose — `Expected string,
  // received number` — which is not code-shaped, so `adminErrorCopy` could not
  // map it and the operator saw the generic "action failed" banner instead of a
  // precise sentence. The wrong-typed cases below are the regression guard.
  it.each([
    ['a non-UUID string', 'not-a-uuid'],
    ['a truncated UUID', '11111111-1111-4111-8111'],
    ['a non-hex UUID-shaped string', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'],
    [
      'a hyphen-less 32-character hex string',
      '11111111111111111111111111111111',
    ],
    ['a number', 42],
    ['an object', { id: 'not-a-uuid' }],
    ['an array', ['not-a-uuid']],
    ['null', null],
    ['a boolean', true],
  ])(
    'answers 422 with the stable code for %s and never reaches the ERP or the audit store',
    async (_label, packageId) => {
      asAdmin();

      const { req, res } = createMockReqRes({
        method: 'POST',
        body: { packageId },
      });

      await syncHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.body).toEqual({
        error: { message: 'Validation Error: invalid-package-id' },
      });
      expect(erpSyncModulesMock).not.toHaveBeenCalled();
      expect(auditCreateMock).not.toHaveBeenCalled();
      expect(auditUpdateMock).not.toHaveBeenCalled();
    }
  );

  it('forwards a valid packageId and uses it as the audit targetId', async () => {
    asAdmin();

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { packageId: PACKAGE_ID },
    });

    await syncHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(erpSyncModulesMock).toHaveBeenCalledWith(
      'test-platform-api-key',
      PACKAGE_ID
    );
    expect(auditCreateMock.mock.calls[0][0].data).toMatchObject({
      targetId: PACKAGE_ID,
      targetType: 'package',
    });
  });

  it('treats an ABSENT packageId as sync-all and records the ALL_PACKAGES sentinel', async () => {
    // The ERP DTO types packageId as `Guid?`, where absent means "every
    // package". Pinned because a `.min(1)` or a required field would turn the
    // broadest and most commonly used form into a validation error.
    asAdmin();

    const { req, res } = createMockReqRes({ method: 'POST', body: {} });

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

  it('does not forward the ERP response message to the client', async () => {
    // `result.message` is free-form, English-only upstream copy. The envelope
    // keeps its shape but must not carry it.
    asAdmin();
    erpSyncModulesMock.mockResolvedValue({
      message: UPSTREAM_SECRET,
    });

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { packageId: PACKAGE_ID },
    });

    await syncHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      result: { synced: true },
    });
    expect(JSON.stringify(res.body)).not.toContain(UPSTREAM_SECRET);
  });
});

// ---------------------------------------------------------------------------
// Audit threading — ONE row per operation, resolved on the row it started
// ---------------------------------------------------------------------------

describe('rules routes — each mutation opens one audit row and resolves that same row', () => {
  it('UPDATEs the STARTED row on a successful plan-module save instead of inserting a second', async () => {
    // The original defect: `recordAdminAudit` discarded the id returned by
    // `createAdminAuditStart` and called the terminal helper with
    // `logId: null`, which silently INSERTs. Every save therefore produced a
    // row frozen at STARTED forever plus a detached terminal row, and the
    // audit table showed each action as both "in progress" and "completed".
    asAdmin();

    const { req, res } = createMockReqRes({
      method: 'PUT',
      query: { planId: PACKAGE_ID },
      body: validPlanBody,
    });

    await planHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock.mock.calls[0][0].where).toEqual({ id: LOG_ID });
    expect(auditUpdateMock.mock.calls[0][0].data).toMatchObject({
      status: 'SUCCEEDED',
    });
  });

  it('UPDATEs the STARTED row on a successful sync', async () => {
    asAdmin();

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { packageId: PACKAGE_ID },
    });

    await syncHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock.mock.calls[0][0].where).toEqual({ id: LOG_ID });
    expect(auditUpdateMock.mock.calls[0][0].data).toMatchObject({
      status: 'SUCCEEDED',
    });
  });

  it('resolves the STARTED row as FAILED with a bounded code when the ERP rejects a plan save', async () => {
    asAdmin();
    erpUpdateModulesMock.mockRejectedValue(
      new ErpApiError(UPSTREAM_SECRET, 500)
    );

    const { req, res } = createMockReqRes({
      method: 'PUT',
      query: { planId: PACKAGE_ID },
      body: validPlanBody,
    });

    await planHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'erp-upstream-failure' },
    });

    // Still one row, on the same id, resolved FAILED — not a stranded STARTED.
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock.mock.calls[0][0].where).toEqual({ id: LOG_ID });
    expect(auditUpdateMock.mock.calls[0][0].data).toMatchObject({
      status: 'FAILED',
      errorCode: 'erp-upstream-failure',
    });

    // A short, stable code — never the upstream body.
    expect(auditUpdateMock.mock.calls[0][0].data.errorCode).not.toContain(
      UPSTREAM_SECRET
    );
    expect(JSON.stringify(res.body)).not.toContain(UPSTREAM_SECRET);
  });

  it('resolves the STARTED row as FAILED when the ERP rejects a sync', async () => {
    asAdmin();
    erpSyncModulesMock.mockRejectedValue(new ErpApiError(UPSTREAM_SECRET, 409));

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { packageId: PACKAGE_ID },
    });

    await syncHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'erp-conflict' },
    });
    expect(auditUpdateMock).toHaveBeenCalledTimes(1);
    expect(auditUpdateMock.mock.calls[0][0].data).toMatchObject({
      status: 'FAILED',
      errorCode: 'erp-conflict',
    });
    expect(JSON.stringify(res.body)).not.toContain(UPSTREAM_SECRET);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/rules — deliberately soft-fails to a degraded matrix
// ---------------------------------------------------------------------------

describe('GET /api/admin/rules — success and degraded payloads', () => {
  it('returns the packages and system modules on success', async () => {
    asAdmin();
    const { req: r, res } = createMockReqRes({ method: 'GET' });

    await rulesIndexHandler(r, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: {
        ok: true,
        packages: [{ id: PACKAGE_ID, name: 'Growth' }],
        systemModules: [{ code: 'MOD_A' }],
      },
    });
  });

  it('soft-fails to a degraded 200 payload when the ERP read fails', async () => {
    // Deliberate: the admin page renders a degraded matrix rather than an error
    // page, so the status stays 200 and `ok: false` carries the signal. Only a
    // bounded code is reported.
    asAdmin();
    erpGetPackagesMock.mockRejectedValue(new ErpApiError(UPSTREAM_SECRET, 500));

    const { req: r, res } = createMockReqRes({ method: 'GET' });

    await rulesIndexHandler(r, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: {
        ok: false,
        packages: [],
        systemModules: [],
        error: 'erp-upstream-failure',
      },
    });
    expect(JSON.stringify(res.body)).not.toContain(UPSTREAM_SECRET);
  });

  it('reports erp-not-configured without calling the ERP when the M2M key is unset', async () => {
    asAdmin();
    envErp.platformApiKey = '';

    const { req: r, res } = createMockReqRes({ method: 'GET' });

    await rulesIndexHandler(r, res);

    expect(erpGetPackagesMock).not.toHaveBeenCalled();
    expect(erpGetModulesMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: {
        ok: false,
        packages: [],
        systemModules: [],
        error: 'erp-not-configured',
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Unset M2M key on the mutation routes
// ---------------------------------------------------------------------------

describe('rules mutations — an unset M2M key is a deliberate 503, not a silent no-op', () => {
  it('answers 503 erp-not-configured for a sync and writes no audit row', async () => {
    asAdmin();
    envErp.platformApiKey = '';

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { packageId: PACKAGE_ID },
    });

    await syncHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'erp-not-configured' },
    });
    expect(erpSyncModulesMock).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('answers 503 erp-not-configured for a plan save and writes no audit row', async () => {
    asAdmin();
    envErp.platformApiKey = '';

    const { req, res } = createMockReqRes({
      method: 'PUT',
      query: { planId: PACKAGE_ID },
      body: validPlanBody,
    });

    await planHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(erpUpdateModulesMock).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('still validates the planId first, so a bad id is 400 rather than 503', async () => {
    // Ordering pin: an operator with a misconfigured key must not be told their
    // request was fine when the id was malformed.
    asAdmin();
    envErp.platformApiKey = '';

    const { req, res } = createMockReqRes({
      method: 'PUT',
      query: { planId: 'not-a-uuid' },
      body: validPlanBody,
    });

    await planHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'invalid-plan-id' },
    });
  });
});
