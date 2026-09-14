import ordersHandler from 'pages/api/public/erp/orders';
import { verifyOrderIntent } from '@/lib/payments/orderIntent';

/**
 * `POST /api/public/erp/orders` (PG-06).
 *
 * The route that makes the server the only source of an order's price and
 * reference. Only `fetch` and the rate limiter are mocked, so a request travels
 * the whole chain: ERP catalogue body -> contract -> resolution -> signed intent
 * -> response.
 */

jest.mock('@/lib/rateLimit', () => ({
  clientKey: jest.fn(() => 'orders-test-client'),
  limiters: {
    catalog: { allow: jest.fn(() => true) },
    verify: { allow: jest.fn(() => true) },
    payments: { allow: jest.fn(() => true) },
  },
}));

const { limiters } = jest.requireMock('@/lib/rateLimit') as {
  limiters: { payments: { allow: jest.Mock } };
};

const PACKAGE_ID = '1f1b3311-2477-49f1-8c5c-3abb1c3ecd4c';
const OTHER_PACKAGE_ID = '2f1b3311-2477-49f1-8c5c-3abb1c3ecd4d';

const CATALOGUE = [
  {
    id: PACKAGE_ID,
    name: 'Starter',
    description: 'للمنشآت الصغيرة',
    priceMonthly: 199,
    priceYearly: 1990,
    trialDays: 14,
    isActive: true,
  },
  {
    id: OTHER_PACKAGE_ID,
    name: 'Growth',
    priceMonthly: 499,
    trialDays: 14,
    isActive: true,
  },
];

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

const createMockReq = (options: { method?: string; body?: unknown }) =>
  ({
    method: options.method || 'POST',
    query: {},
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

beforeEach(() => {
  jest.clearAllMocks();
  limiters.payments.allow.mockReturnValue(true);
  global.fetch = originalFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('POST /api/public/erp/orders (PG-06)', () => {
  describe('issuing terms', () => {
    it('prices the package from the ERP catalogue', async () => {
      respondWith(CATALOGUE);
      const res = createMockRes();

      await ordersHandler(
        createMockReq({ body: { packageId: PACKAGE_ID } }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.data.amount).toBe(199);
      expect(res.body.data.currency).toBe('SAR');
      expect(res.body.data.packageId).toBe(PACKAGE_ID);
      expect(res.body.data.packageName).toBe('Starter');
    });

    it('returns a reference the caller never supplied', async () => {
      respondWith(CATALOGUE);
      const res = createMockRes();

      await ordersHandler(
        createMockReq({ body: { packageId: PACKAGE_ID } }),
        res
      );

      expect(res.body.data.orderReference).toMatch(/^ord_[A-Za-z0-9_-]{32}$/);
    });

    it('prices each package independently', async () => {
      respondWith(CATALOGUE);
      const res = createMockRes();

      await ordersHandler(
        createMockReq({ body: { packageId: OTHER_PACKAGE_ID } }),
        res
      );

      expect(res.body.data.amount).toBe(499);
      expect(res.body.data.packageName).toBe('Growth');
    });

    it('returns an intent that verifies back to exactly those terms', async () => {
      respondWith(CATALOGUE);
      const res = createMockRes();

      await ordersHandler(
        createMockReq({ body: { packageId: PACKAGE_ID } }),
        res
      );

      const terms = verifyOrderIntent(res.body.data.intent);

      expect(terms).toEqual({
        orderReference: res.body.data.orderReference,
        amount: res.body.data.amount,
        currency: res.body.data.currency,
        packageId: res.body.data.packageId,
      });
    });

    it('reports an expiry in the future', async () => {
      respondWith(CATALOGUE);
      const res = createMockRes();

      await ordersHandler(
        createMockReq({ body: { packageId: PACKAGE_ID } }),
        res
      );

      expect(Date.parse(res.body.data.expiresAt)).toBeGreaterThan(Date.now());
    });

    it('never publishes ERP text or the raw catalogue', async () => {
      respondWith(CATALOGUE);
      const res = createMockRes();

      await ordersHandler(
        createMockReq({ body: { packageId: PACKAGE_ID } }),
        res
      );

      const serialized = JSON.stringify(res.body);

      expect(serialized).not.toContain('priceYearly');
      expect(serialized).not.toContain('description');
      expect(Object.keys(res.body.data).sort()).toEqual([
        'amount',
        'currency',
        'expiresAt',
        'intent',
        'orderReference',
        'packageId',
        'packageName',
      ]);
    });
  });

  describe('refusing to price', () => {
    it('answers 400 for a missing package id', async () => {
      const res = createMockRes();

      await ordersHandler(createMockReq({ body: {} }), res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error.message).toBe('invalid-request');
    });

    it.each([
      ['a non-uuid id', { packageId: 'starter' }],
      ['an empty id', { packageId: '' }],
      ['a numeric id', { packageId: 42 }],
    ])('answers 400 for %s', async (label, body) => {
      const res = createMockRes();

      await ordersHandler(createMockReq({ body }), res);

      expect({ label, status: res.statusCode }).toEqual({
        label,
        status: 400,
      });
    });

    it('answers 400, not zod prose, and keeps the detail in issues', async () => {
      const res = createMockRes();

      await ordersHandler(createMockReq({ body: { packageId: 'nope' } }), res);

      expect(res.body.error.message).toBe('invalid-request');
      // Zod's own messages are English prose that a consumer rendering
      // `error.message` would show in the Arabic funnel.
      expect(res.body.error.message).not.toMatch(/uuid/i);
      expect(res.body.issues).toBeDefined();
    });

    it('answers 400 invalid-amount for a trial-only package', async () => {
      respondWith([
        { id: PACKAGE_ID, name: 'Free', isActive: true },
        { id: OTHER_PACKAGE_ID, name: 'Zero', priceMonthly: 0 },
      ]);
      const res = createMockRes();

      await ordersHandler(
        createMockReq({ body: { packageId: PACKAGE_ID } }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error.message).toBe('invalid-amount');
    });

    it('answers 400 invalid-request for an unknown package id', async () => {
      respondWith(CATALOGUE);
      const res = createMockRes();

      await ordersHandler(
        createMockReq({
          body: { packageId: '3f1b3311-2477-49f1-8c5c-3abb1c3ecd4e' },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error.message).toBe('invalid-request');
    });

    it('answers 503 when the ERP is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
      const res = createMockRes();

      await ordersHandler(
        createMockReq({ body: { packageId: PACKAGE_ID } }),
        res
      );

      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({ error: { message: 'erp-unavailable' } });
    });

    it('answers 502 when the catalogue is the wrong shape', async () => {
      respondWith({ data: [] });
      const res = createMockRes();

      await ordersHandler(
        createMockReq({ body: { packageId: PACKAGE_ID } }),
        res
      );

      expect(res.statusCode).toBe(502);
      expect(res.body).toEqual({
        error: { message: 'erp-malformed-response' },
      });
    });

    it('never leaks upstream failure text', async () => {
      respondWith(
        {
          error:
            'Microsoft.Data.SqlClient.SqlException: Login failed for user sa',
        },
        500
      );
      const res = createMockRes();

      await ordersHandler(
        createMockReq({ body: { packageId: PACKAGE_ID } }),
        res
      );

      expect(JSON.stringify(res.body)).not.toContain('SqlException');
    });
  });

  describe('transport rules', () => {
    it('answers 405 with an Allow header for a non-POST method', async () => {
      const res = createMockRes();

      await ordersHandler(createMockReq({ method: 'GET' }), res);

      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('POST');
    });

    it('answers 429 before touching the ERP', async () => {
      limiters.payments.allow.mockReturnValue(false);
      respondWith(CATALOGUE);
      const res = createMockRes();

      await ordersHandler(
        createMockReq({ body: { packageId: PACKAGE_ID } }),
        res
      );

      expect(res.statusCode).toBe(429);
      expect(res.body).toEqual({ error: { message: 'too-many-requests' } });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
