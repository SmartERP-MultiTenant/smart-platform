import methodsHandler from 'pages/api/public/erp/methods';
import packagesHandler from 'pages/api/public/erp/packages';
import paymentsHandler from 'pages/api/public/erp/payments';
import verifyHandler from 'pages/api/public/erp/verify';
import { paymentErrorCodes } from '@/lib/payments/errorCopy';
import {
  erpMethodsResponse,
  erpPackagesResponse,
  erpVerifyResponse,
  erpVerifyResponseWithoutStatus,
  erpWrongShapedBodies,
} from '../../tests/fixtures/erp-contract';

/**
 * Route-level contract tests (PG-20, PG-30, PG-52, PG-54).
 *
 * ## Why this spec exists next to the others
 *
 * `__tests__/api/public-erp-limited-routes.spec.ts` mocks `@/lib/erp` wholesale,
 * so it proves only that the routes publish what they are handed — it cannot see
 * the validation, filtering or error classification at all, because all three
 * live at the boundary those mocks replace. `__tests__/lib/erp.spec.ts` covers
 * the boundary but never runs a route.
 *
 * This one mocks only `fetch` and the rate limiter, so a single request travels
 * the whole chain — ERP body -> `lib/erp` contract -> route -> response body —
 * which is the layer a contract change actually breaks.
 *
 * ## The two cross-cutting properties asserted throughout
 *
 * 1. **No upstream text ever reaches the body.** Every failure is answered with
 *    a code from `lib/payments/errorCopy.ts`; nothing else.
 * 2. **Every error code has frontend copy.** Asserted structurally, so a new
 *    failure mode has to be added to the taxonomy rather than shipped as a
 *    token a customer would see on screen.
 */

jest.mock('@/lib/rateLimit', () => ({
  clientKey: jest.fn(() => 'contract-test-client'),
  limiters: {
    catalog: { allow: jest.fn(() => true) },
    verify: { allow: jest.fn(() => true) },
    payments: { allow: jest.fn(() => true) },
  },
}));

const UPSTREAM_SECRET =
  'Microsoft.Data.SqlClient.SqlException: Login failed for user sa at PlatformBillingController.cs:line 42';

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, string>,
    setHeader: jest.fn((key: string, value: string) => {
      res.headers[key] = value;
    }),
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((data: unknown) => {
      res.body = data;
      return res;
    }),
  } as any;

  return res;
};

const createMockReq = (options: {
  method?: string;
  query?: Record<string, unknown>;
  body?: unknown;
}) =>
  ({
    method: options.method || 'GET',
    query: options.query || {},
    body: options.body,
    headers: {},
  }) as any;

const respondWith = (body: unknown, status = 200) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
};

const originalFetch = global.fetch;

const serialized = (res: any) => JSON.stringify(res.body);

beforeEach(() => {
  jest.clearAllMocks();
  // Several suites run in one process; restore the ambient fetch each time so a
  // leaked mock cannot make a later assertion vacuously pass.
  global.fetch = originalFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('Public ERP BFF — response contract (PG-20 / PG-30 / PG-52 / PG-54)', () => {
  describe('GET /api/public/erp/methods', () => {
    it('publishes only the methods the ERP marked available', async () => {
      respondWith(erpMethodsResponse);
      const res = createMockRes();

      await methodsHandler(createMockReq({ method: 'GET' }), res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.map((method: any) => method.key)).toEqual([
        'credit_card',
        'apple_pay',
      ]);
    });

    it('never sends an `available: false` method to the browser', async () => {
      respondWith(erpMethodsResponse);
      const res = createMockRes();

      await methodsHandler(createMockReq({ method: 'GET' }), res);

      expect(
        res.body.data.some((method: any) => method.available === false)
      ).toBe(false);
      expect(serialized(res)).not.toContain('stc_pay');
    });

    it('answers an empty catalogue rather than a broken one when nothing is available', async () => {
      respondWith([
        { key: 'card', label: 'Card', provider: 'moyasar', available: false },
      ]);
      const res = createMockRes();

      await methodsHandler(createMockReq({ method: 'GET' }), res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ data: [] });
    });

    it.each(Object.entries(erpWrongShapedBodies))(
      'answers 502 erp-malformed-response for the wrong-shaped body %s, never 500',
      async (_label, body) => {
        respondWith(body);
        const res = createMockRes();

        await methodsHandler(createMockReq({ method: 'GET' }), res);

        expect(res.statusCode).toBe(502);
        expect(res.body).toEqual({
          error: { message: 'erp-malformed-response' },
        });
      }
    );
  });

  describe('GET /api/public/erp/packages', () => {
    it('publishes the validated catalogue', async () => {
      respondWith(erpPackagesResponse);
      const res = createMockRes();

      await packagesHandler(createMockReq({ method: 'GET' }), res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].name).toBe('Starter');
    });

    it('drops entries with no usable id or name instead of forwarding them', async () => {
      respondWith([{ id: 'ok', name: 'Valid' }, { name: 'No id' }, null, 42]);
      const res = createMockRes();

      await packagesHandler(createMockReq({ method: 'GET' }), res);

      expect(res.body.data).toEqual([{ id: 'ok', name: 'Valid' }]);
    });

    it.each(Object.entries(erpWrongShapedBodies))(
      'answers 502 for the wrong-shaped body %s, which is what used to 500 /pricing',
      async (_label, body) => {
        respondWith(body);
        const res = createMockRes();

        await packagesHandler(createMockReq({ method: 'GET' }), res);

        expect(res.statusCode).toBe(502);
        expect(res.body).toEqual({
          error: { message: 'erp-malformed-response' },
        });
      }
    );
  });

  describe('GET /api/public/erp/verify', () => {
    it.each([
      ['Pending', erpVerifyResponse.pending],
      ['Paid', erpVerifyResponse.paid],
      ['Failed', erpVerifyResponse.failed],
    ])('round-trips the %s status', async (_label, body) => {
      respondWith(body);
      const res = createMockRes();

      await verifyHandler(
        createMockReq({ method: 'GET', query: { reference: 'pay-1' } }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ data: body });
    });

    it('keeps a pre-rollout body with no status at all', async () => {
      respondWith(erpVerifyResponseWithoutStatus);
      const res = createMockRes();

      await verifyHandler(
        createMockReq({ method: 'GET', query: { reference: 'pay-1' } }),
        res
      );

      expect(res.body).toEqual({ data: { success: true } });
    });

    it('passes an unrecognised status through so the poller stays on the honest pending path', async () => {
      respondWith({ success: true, status: 'Authorised' });
      const res = createMockRes();

      await verifyHandler(
        createMockReq({ method: 'GET', query: { reference: 'pay-1' } }),
        res
      );

      // A 200 that the consumer classifies as neither paid nor absent. Turning
      // this into a 5xx would make the poller settle optimistically.
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        data: { success: true, status: 'Authorised' },
      });
    });

    it('answers 502 for a wrong-shaped verify body', async () => {
      respondWith({ success: true, status: { nested: 'Paid' } });
      const res = createMockRes();

      await verifyHandler(
        createMockReq({ method: 'GET', query: { reference: 'pay-1' } }),
        res
      );

      expect(res.statusCode).toBe(502);
      expect(res.body).toEqual({
        error: { message: 'erp-malformed-response' },
      });
    });

    it('keeps the 400 missing-reference code for an unusable reference', async () => {
      const res = createMockRes();

      await verifyHandler(createMockReq({ method: 'GET', query: {} }), res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: { message: 'missing-reference' } });
    });

    it('preserves an upstream 401 so the poller keeps hard-rejecting it', async () => {
      // The regression this guards: `classifyErpError` maps 401/403 to 502, and
      // the poller reads any 5xx as transient — which would move an ERP auth
      // failure onto the optimistic-settle (success) path.
      respondWith({ error: UPSTREAM_SECRET }, 401);
      const res = createMockRes();

      await verifyHandler(
        createMockReq({ method: 'GET', query: { reference: 'pay-1' } }),
        res
      );

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: { message: 'erp-auth-failed' } });
      expect(serialized(res)).not.toContain('SqlException');
    });
  });

  describe('POST /api/public/erp/payments', () => {
    const validBody = {
      orderReference: 'pay-12345678',
      amount: 199,
      currency: 'SAR',
      paymentMethod: 'credit_card',
    };

    it('answers 400 invalid-request (a code, not zod prose) for a bad body', async () => {
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({ method: 'POST', body: { orderReference: 'x' } }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error.message).toBe('invalid-request');
      // The per-field detail stays available to a developer without reaching the
      // customer-facing copy path.
      expect(res.body.issues).toBeDefined();
    });

    it('redirects to the gateway on success', async () => {
      respondWith({
        paymentUrl: 'https://api.moyasar.com/pay/abc',
        status: 'initiated',
      });
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({ method: 'POST', body: validBody }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.data.paymentUrl).toBe('https://api.moyasar.com/pay/abc');
    });

    it('maps an upstream unsupported-method 400 to the specific code', async () => {
      respondWith({ error: 'Unsupported payment method: crypto' }, 400);
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({ method: 'POST', body: validBody }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        error: { message: 'unsupported-payment-method' },
      });
    });

    it('maps an upstream amount 400 to the specific code', async () => {
      respondWith({ error: 'Amount must be greater than zero' }, 400);
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({ method: 'POST', body: validBody }),
        res
      );

      expect(res.body).toEqual({ error: { message: 'invalid-amount' } });
    });

    it('never leaks an upstream internal failure to the browser', async () => {
      respondWith({ error: UPSTREAM_SECRET }, 500);
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({ method: 'POST', body: validBody }),
        res
      );

      expect(serialized(res)).not.toContain('SqlException');
      expect(serialized(res)).not.toContain('Login failed');
      expect(serialized(res)).not.toContain('PlatformBillingController');
      expect(res.body).toEqual({ error: { message: 'erp-upstream-failure' } });
    });

    it('maps an unreachable ERP to 503 erp-unavailable', async () => {
      global.fetch = jest.fn().mockRejectedValue(
        Object.assign(new TypeError('fetch failed'), {
          cause: new Error('connect ECONNREFUSED 127.0.0.1:5001'),
        })
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({ method: 'POST', body: validBody }),
        res
      );

      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({ error: { message: 'erp-unavailable' } });
    });
  });

  describe('every public error code has frontend copy (PG-54)', () => {
    it('answers failures only with codes drawn from the payment taxonomy', async () => {
      const failures: Array<[string, () => void]> = [
        ['wrong-shaped packages', () => respondWith({})],
        ['upstream 500', () => respondWith({ error: UPSTREAM_SECRET }, 500)],
        ['upstream 404', () => respondWith({ error: 'nope' }, 404)],
        ['upstream 409', () => respondWith({ error: 'duplicate' }, 409)],
        ['upstream 422', () => respondWith({ error: 'declined' }, 422)],
        [
          'network failure',
          () => {
            global.fetch = jest
              .fn()
              .mockRejectedValue(new TypeError('fetch failed'));
          },
        ],
      ];

      for (const [label, arrange] of failures) {
        arrange();
        const res = createMockRes();

        await packagesHandler(createMockReq({ method: 'GET' }), res);

        const code = res.body?.error?.message;

        expect({
          label,
          code,
          known: paymentErrorCodes().includes(code),
        }).toEqual({
          label,
          code,
          known: true,
        });
      }
    });
  });
});
