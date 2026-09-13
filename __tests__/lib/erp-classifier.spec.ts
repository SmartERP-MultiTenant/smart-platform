import {
  erp,
  ErpApiError,
  classifyErpError,
  ERP_MUTATION_TIMEOUT_MS,
} from '@/lib/erp';

/**
 * `lib/erp.ts` W2 hardening spec.
 *
 * Covers the three fixes to the platform→ERP M2M client:
 *  1. every M2M mutation is bounded by an abort budget,
 *  2. a 2xx with an unparseable body is a hard failure, never a silent success,
 *  3. `classifyErpError` maps any failure onto a safe `{ status, code }` pair.
 *
 * Deliberately self-contained: it imports nothing but `lib/erp`, so it does not
 * overlap with the admin-route/audit specs.
 */

type FetchCall = { url: string; init: RequestInit };

const originalFetch = global.fetch;

let calls: FetchCall[] = [];

/** Installs a fetch double that records every call and defers to `responder`. */
const mockFetch = (
  responder: (url: string, init: RequestInit) => unknown = () => okJson({})
) => {
  global.fetch = jest.fn(async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit });
    return responder(String(url), init as RequestInit) as never;
  }) as unknown as typeof fetch;
};

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const errorJson = (status: number, body: unknown) => ({
  ok: false,
  status,
  json: async () => body,
});

/** The signal actually handed to `fetch` on the last call. */
const lastSignal = (): AbortSignal => calls[calls.length - 1].init.signal!;

/** A fetch double that never settles until its signal aborts. */
const hangingFetch = () => {
  global.fetch = jest.fn((_url: unknown, init: unknown) => {
    calls.push({ url: String(_url), init: init as RequestInit });
    const signal = (init as RequestInit).signal!;
    return new Promise((_resolve, reject) => {
      const abort = () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      };
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort);
    });
  }) as unknown as typeof fetch;
};

beforeEach(() => {
  calls = [];
  mockFetch();
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('Lib - classifyErpError', () => {
  it('maps a 400 upstream rejection to a client-safe 400', () => {
    expect(classifyErpError(new ErpApiError('Bad Request', 400))).toEqual({
      status: 400,
      code: 'erp-bad-request',
    });
  });

  it('maps an upstream 404 to 404 erp-not-found', () => {
    expect(classifyErpError(new ErpApiError('not found', 404))).toEqual({
      status: 404,
      code: 'erp-not-found',
    });
  });

  it('maps upstream 401 to 502 erp-auth-failed, never a 401 to the admin', () => {
    // A 401 reaching the admin UI reads as "your session expired" and logs the
    // operator out of a healthy session, so an M2M auth failure must be a 502.
    expect(classifyErpError(new ErpApiError('unauthorized', 401))).toEqual({
      status: 502,
      code: 'erp-auth-failed',
    });
  });

  it('maps upstream 403 to 502 erp-auth-failed', () => {
    expect(classifyErpError(new ErpApiError('forbidden', 403))).toEqual({
      status: 502,
      code: 'erp-auth-failed',
    });
  });

  it('maps an upstream 409 to 409 erp-conflict', () => {
    expect(classifyErpError(new ErpApiError('conflict', 409))).toEqual({
      status: 409,
      code: 'erp-conflict',
    });
  });

  it('maps an upstream 422 to 422 erp-rejected', () => {
    expect(classifyErpError(new ErpApiError('rejected', 422))).toEqual({
      status: 422,
      code: 'erp-rejected',
    });
  });

  it('maps a generic upstream 5xx to 502 erp-upstream-failure', () => {
    expect(classifyErpError(new ErpApiError('boom', 500))).toEqual({
      status: 502,
      code: 'erp-upstream-failure',
    });
    expect(classifyErpError(new ErpApiError('down', 503))).toEqual({
      status: 502,
      code: 'erp-upstream-failure',
    });
  });

  it('maps any other unexpected upstream status to 502 erp-upstream-failure', () => {
    for (const status of [200, 301, 418, 429, 504]) {
      expect(classifyErpError(new ErpApiError('odd', status))).toEqual({
        status: 502,
        code: 'erp-upstream-failure',
      });
    }
  });

  it('maps a malformed 2xx body marker to 502 erp-malformed-response', () => {
    expect(
      classifyErpError(
        new ErpApiError('ERP_MALFORMED_RESPONSE', 502, 'ERP_MALFORMED_RESPONSE')
      )
    ).toEqual({ status: 502, code: 'erp-malformed-response' });
  });

  it('maps an aborted request to 503 erp-unavailable', () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    expect(classifyErpError(abortError)).toEqual({
      status: 503,
      code: 'erp-unavailable',
    });
  });

  it('maps our own timeout signal to 503 erp-unavailable', () => {
    const timeoutError = new Error('timed out');
    timeoutError.name = 'TimeoutError';
    expect(classifyErpError(timeoutError)).toEqual({
      status: 503,
      code: 'erp-unavailable',
    });
  });

  it('maps an undici "fetch failed" TypeError to 503 erp-unavailable', () => {
    const err: TypeError & { cause?: unknown } = new TypeError('fetch failed');
    err.cause = new Error('connect ECONNREFUSED 127.0.0.1:5001');
    expect(classifyErpError(err)).toEqual({
      status: 503,
      code: 'erp-unavailable',
    });
  });

  it('maps a bare syscall error code to 503 erp-unavailable', () => {
    for (const code of [
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ETIMEDOUT',
    ]) {
      const err = Object.assign(new Error('socket'), { code });
      expect(classifyErpError(err)).toEqual({
        status: 503,
        code: 'erp-unavailable',
      });
    }
  });

  it('falls back to 502 erp-upstream-failure for anything unrecognised', () => {
    const plainTypeError = new TypeError('some unrelated type error');
    expect(classifyErpError(new Error('weird'))).toEqual({
      status: 502,
      code: 'erp-upstream-failure',
    });
    expect(classifyErpError(plainTypeError)).toEqual({
      status: 502,
      code: 'erp-upstream-failure',
    });
    expect(classifyErpError('a string')).toEqual({
      status: 502,
      code: 'erp-upstream-failure',
    });
    expect(classifyErpError(null)).toEqual({
      status: 502,
      code: 'erp-upstream-failure',
    });
    expect(classifyErpError(undefined)).toEqual({
      status: 502,
      code: 'erp-upstream-failure',
    });
    expect(classifyErpError({})).toEqual({
      status: 502,
      code: 'erp-upstream-failure',
    });
  });

  it('recognises an ErpApiError by name even when instanceof is unreliable', () => {
    // The project compiles with `target: "es5"`, where `class X extends Error`
    // can lose its prototype chain and make `instanceof` false for genuine
    // instances. A duck-typed lookalike must still classify precisely.
    const lookalike = Object.assign(new Error('lookalike'), {
      name: 'ErpApiError',
      status: 404,
      code: undefined,
    });
    expect(classifyErpError(lookalike)).toEqual({
      status: 404,
      code: 'erp-not-found',
    });
  });

  it('never leaks the upstream message into the returned code', () => {
    const secret = 'INTERNAL-SQLSTATE-23505-stacktrace';
    const samples: unknown[] = [
      new ErpApiError(secret, 400),
      new ErpApiError(secret, 401),
      new ErpApiError(secret, 403),
      new ErpApiError(secret, 404),
      new ErpApiError(secret, 409),
      new ErpApiError(secret, 422),
      new ErpApiError(secret, 500),
      new ErpApiError(secret, 418),
      new ErpApiError(secret, 502, 'ERP_MALFORMED_RESPONSE'),
      Object.assign(new Error(secret), { name: 'TimeoutError' }),
      new TypeError(secret),
      new Error(secret),
      secret,
    ];

    for (const err of samples) {
      const classified = classifyErpError(err);
      expect(classified.code).not.toContain(secret);
      expect(classified.code).toMatch(/^erp-[a-z-]+$/);
      expect([400, 404, 409, 422, 502, 503]).toContain(classified.status);
    }
  });
});

describe('Lib - erpFetch malformed success bodies', () => {
  it('rejects a 2xx whose body is not JSON instead of reporting an empty success', async () => {
    // Before the W2 fix this resolved to `{}`, so an upstream HTML error page
    // served with status 200 looked like a successful, empty mutation.
    mockFetch(() => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    }));

    await expect(erp.getPackages()).rejects.toMatchObject({
      name: 'ErpApiError',
      status: 502,
      code: 'ERP_MALFORMED_RESPONSE',
    });
  });

  it('does not include the raw upstream body in the malformed-response error', async () => {
    mockFetch(() => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('<html>upstream stack trace</html>');
      },
    }));

    await expect(erp.getPackages()).rejects.toMatchObject({
      message: 'ERP_MALFORMED_RESPONSE',
    });
  });

  it('still resolves a 2xx with a valid JSON body', async () => {
    mockFetch(() => okJson([{ id: 'pkg-1', name: 'Starter' }]));

    await expect(erp.getPackages()).resolves.toHaveLength(1);
  });

  it('preserves the legacy non-2xx fallback message when the body cannot be parsed', async () => {
    mockFetch(() => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    }));

    await expect(erp.getPackages()).rejects.toMatchObject({
      status: 502,
      message: 'ERP request failed (502)',
    });
  });

  it('classifies the malformed-response failure end to end', async () => {
    mockFetch(() => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    }));

    const err = await erp.getPackages().catch((e: unknown) => e);
    expect(classifyErpError(err)).toEqual({
      status: 502,
      code: 'erp-malformed-response',
    });
  });
});

describe('Lib - M2M mutation abort budget', () => {
  const mutations: Array<[string, () => Promise<unknown>]> = [
    [
      'createTenantSubscription',
      () => erp.createTenantSubscription('key', 'tenant', { packageId: 'pkg' }),
    ],
    [
      'extendTenantSubscription',
      () => erp.extendTenantSubscription('key', 'tenant', '2027-01-01'),
    ],
    [
      'cancelTenantSubscription',
      () => erp.cancelTenantSubscription('key', 'tenant'),
    ],
    [
      'trialOverrideTenantSubscription',
      () => erp.trialOverrideTenantSubscription('key', 'tenant', '2027-01-01'),
    ],
    ['changeTenantPlan', () => erp.changeTenantPlan('key', 'tenant', 'pkg')],
    [
      'updatePackageModulesM2M',
      () => erp.updatePackageModulesM2M('key', 'pkg', ['mod-1']),
    ],
    [
      'syncSubscriptionsModulesM2M',
      () => erp.syncSubscriptionsModulesM2M('key'),
    ],
  ];

  it('exposes a finite, bounded mutation budget', () => {
    expect(Number.isFinite(ERP_MUTATION_TIMEOUT_MS)).toBe(true);
    expect(ERP_MUTATION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(ERP_MUTATION_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });

  it.each(mutations)(
    '%s applies AbortSignal.timeout(ERP_MUTATION_TIMEOUT_MS) by default',
    async (_name, call) => {
      const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
      await call();

      expect(timeoutSpy).toHaveBeenCalledWith(ERP_MUTATION_TIMEOUT_MS);
      expect(calls).toHaveLength(1);
      expect(lastSignal()).toBeInstanceOf(AbortSignal);
      expect(lastSignal().aborted).toBe(false);
    }
  );

  it.each(mutations)(
    '%s rejects when the bounded budget elapses',
    async (_name, call) => {
      // Stand in for the 15s budget: swap in a signal we can fire on demand,
      // then prove the request actually aborts with it.
      const budget = new AbortController();
      jest.spyOn(AbortSignal, 'timeout').mockReturnValue(budget.signal);
      hangingFetch();

      const pending = call();
      const settled = expect(pending).rejects.toMatchObject({
        name: 'AbortError',
      });

      budget.abort();

      await settled;
      expect(lastSignal().aborted).toBe(true);
    }
  );

  it('honours a caller-supplied signal and combines it with the budget', async () => {
    const caller = new AbortController();
    await erp.extendTenantSubscription(
      'key',
      'tenant',
      '2027-01-01',
      caller.signal
    );

    const signal = lastSignal();
    expect(signal).toBeInstanceOf(AbortSignal);
    // Combined rather than replaced: aborting the caller must abort the request.
    expect(signal).not.toBe(caller.signal);
    expect(signal.aborted).toBe(false);

    caller.abort();
    expect(signal.aborted).toBe(true);
  });

  it('aborts an in-flight mutation as soon as the caller aborts', async () => {
    const caller = new AbortController();
    hangingFetch();

    const pending = erp.cancelTenantSubscription(
      'key',
      'tenant',
      caller.signal
    );
    const settled = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });

    caller.abort();

    await settled;
  });

  it('does not add a budget to the M2M subscription read', async () => {
    // The read path owns its timeout upstream (adminDashboard). Two-argument
    // callers must not start sending `signal: undefined`.
    mockFetch(() => okJson({ status: 'ACTIVE' }));
    await erp.getTenantBillingSubscription('key', 'tenant');
    expect(calls[0].init).not.toHaveProperty('signal');

    const caller = new AbortController();
    await erp.getTenantBillingSubscription('key', 'tenant', caller.signal);
    expect(lastSignal()).toBe(caller.signal);
  });

  it('does not change the abort behaviour of non-M2M platform POSTs', async () => {
    // The registration/payment funnel keeps its previous behaviour; bounding
    // those flows is a separate decision and out of scope here.
    mockFetch(() => okJson({ success: true }));
    await erp.registerTenant({
      companyName: 'Acme',
      subdomain: 'acme',
      adminEmail: 'admin@acme.test',
      adminUserName: 'admin',
      adminPassword: 'Password123!',
      packageId: 'pkg-1',
      trialDays: 14,
    });
    expect(calls[0].init).not.toHaveProperty('signal');
  });

  it('keeps the M2M request shape unchanged (method, key header, body)', async () => {
    mockFetch(() => okJson({}));

    await erp.createTenantSubscription('key', 'tenant', {
      packageId: 'pkg-1',
      trialDays: 14,
    });
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toMatchObject({ 'X-Platform-ApiKey': 'key' });
    expect(calls[0].init.body).toBe(
      JSON.stringify({ packageId: 'pkg-1', trialDays: 14 })
    );

    await erp.extendTenantSubscription('key', 'tenant', '2027-01-01');
    expect(calls[1].init.body).toBe(
      JSON.stringify({ newEndDate: '2027-01-01' })
    );

    // Cancel has no request body at all — an empty `{}` would be a different
    // ERP contract, so assert the key is genuinely absent.
    await erp.cancelTenantSubscription('key', 'tenant');
    expect(calls[2].init).not.toHaveProperty('body');

    await erp.updatePackageModulesM2M('key', 'pkg-1', ['mod-1'], true);
    expect(calls[3].init.method).toBe('PUT');
    expect(calls[3].init.body).toBe(
      JSON.stringify({
        systemModuleIds: ['mod-1'],
        syncExistingSubscriptions: true,
      })
    );
  });

  it('propagates an upstream failure through a bounded mutation', async () => {
    mockFetch(() => errorJson(404, { error: 'No active subscription.' }));

    const err = await erp
      .extendTenantSubscription('key', 'tenant', '2027-01-01')
      .catch((e: unknown) => e);

    expect(classifyErpError(err)).toEqual({
      status: 404,
      code: 'erp-not-found',
    });
  });

  it('propagates a malformed 2xx through a bounded mutation', async () => {
    mockFetch(() => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    }));

    const err = await erp
      .cancelTenantSubscription('key', 'tenant')
      .catch((e: unknown) => e);

    expect(classifyErpError(err)).toEqual({
      status: 502,
      code: 'erp-malformed-response',
    });
  });
});
