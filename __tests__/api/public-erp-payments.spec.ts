import paymentsHandler from 'pages/api/public/erp/payments';
import { signOrderIntent } from '@/lib/payments/orderIntent';

/**
 * `POST /api/public/erp/payments` — the server-authoritative path (PG-06, P4.24).
 *
 * This is the spec for the headline defect: `amount` and `orderReference` used to
 * travel from the browser to the ERP untouched, so a hand-rolled POST priced a
 * tenant at any number the caller chose. The tests below send hostile values in
 * those fields and assert on what actually reached `fetch`.
 *
 * `fetch` is a mock, so the outbound ERP request body IS observable — which is
 * the only way to prove that a client-supplied amount never leaves the process.
 */

jest.mock('@/lib/rateLimit', () => ({
  clientKey: jest.fn(() => 'payments-test-client'),
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
const APP_ORIGIN = process.env.APP_URL as string;

const CATALOGUE = [
  { id: PACKAGE_ID, name: 'Starter', priceMonthly: 199, isActive: true },
  { id: OTHER_PACKAGE_ID, name: 'Growth', priceMonthly: 499, isActive: true },
];

const PAYMENT_RESULT = {
  paymentUrl: 'https://api.moyasar.com/pay/abc',
  externalId: 'ext-1',
  provider: 'moyasar',
  status: 'initiated',
};

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

/**
 * Serves a sequence of ERP responses, one per outbound call.
 *
 * The last step repeats, so a test that only cares about the payment call does
 * not have to enumerate every preceding catalogue read. This matters because the
 * number of ERP calls is itself part of the contract: `/payments` with a
 * `packageId` reads the catalogue first; with an `intent` it does not.
 */
const erpSequence = (...steps: Array<{ body: unknown; status?: number }>) => {
  let call = 0;

  const fetchMock = jest.fn(async () => {
    const step = steps[Math.min(call, steps.length - 1)];
    call += 1;

    return {
      ok: (step.status ?? 200) >= 200 && (step.status ?? 200) < 300,
      status: step.status ?? 200,
      json: async () => step.body,
    };
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  return fetchMock;
};

/** The JSON body of the LAST outbound ERP call — i.e. the payment creation. */
const lastErpBody = (fetchMock: jest.Mock): Record<string, unknown> => {
  const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
  const [, init] = calls[calls.length - 1];

  return JSON.parse(String(init.body)) as Record<string, unknown>;
};

/** The URL of the LAST outbound ERP call. */
const lastErpUrl = (fetchMock: jest.Mock): string => {
  const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;

  return String(calls[calls.length - 1][0]);
};

const originalFetch = global.fetch;

/**
 * A route module loaded against a chosen `YEARLY_BILLING_ENABLED` (PG-31).
 *
 * The switch lives in `lib/env.ts`, which reads `process.env` at MODULE SCOPE,
 * so it cannot be flipped on the statically imported handler above: the registry
 * is reset and the route is imported again against the environment set for that
 * load — the same approach `__tests__/lib/env-rate-limit-hops.spec.ts` uses. The
 * previous value is restored only AFTER the import resolves, or the module would
 * read the restored one.
 */
const mutableEnv = process.env as Record<string, string | undefined>;

const loadPaymentsHandler = async (flag: string | undefined) => {
  const previous = mutableEnv.YEARLY_BILLING_ENABLED;

  if (flag === undefined) {
    delete mutableEnv.YEARLY_BILLING_ENABLED;
  } else {
    mutableEnv.YEARLY_BILLING_ENABLED = flag;
  }

  jest.resetModules();
  const handler = (await import('pages/api/public/erp/payments')).default;

  if (previous === undefined) {
    delete mutableEnv.YEARLY_BILLING_ENABLED;
  } else {
    mutableEnv.YEARLY_BILLING_ENABLED = previous;
  }

  return handler;
};

/** The catalogue with a yearly price on every package. */
const YEARLY_CATALOGUE = CATALOGUE.map((pkg) => ({
  ...pkg,
  priceYearly: pkg.priceMonthly * 10,
}));

beforeEach(() => {
  jest.clearAllMocks();
  limiters.payments.allow.mockReturnValue(true);
  global.fetch = originalFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('POST /api/public/erp/payments — server-authoritative (PG-06)', () => {
  describe('the price-tampering defect', () => {
    it('IGNORES a client-supplied amount and charges the catalogue price', async () => {
      const fetchMock = erpSequence(
        { body: CATALOGUE },
        { body: PAYMENT_RESULT }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            packageId: PACKAGE_ID,
            // The attack: price a 199 SAR package at one riyal.
            amount: 1,
            currency: 'SAR',
            paymentMethod: 'credit_card',
          },
        }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(lastErpBody(fetchMock).amount).toBe(199);
    });

    it('IGNORES a client-supplied amount on the signed-intent path too', async () => {
      const { intent } = signOrderIntent({
        orderReference: 'ord_intent_supplied',
        amount: 499,
        currency: 'SAR',
        packageId: OTHER_PACKAGE_ID,
        billingCycle: 'monthly',
      });

      const fetchMock = erpSequence({ body: PAYMENT_RESULT });
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            intent,
            amount: 1,
            paymentMethod: 'credit_card',
          },
        }),
        res
      );

      expect(lastErpBody(fetchMock).amount).toBe(499);
    });

    it('IGNORES a client-supplied currency', async () => {
      const fetchMock = erpSequence(
        { body: CATALOGUE },
        { body: PAYMENT_RESULT }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            packageId: PACKAGE_ID,
            currency: 'USD',
            paymentMethod: 'credit_card',
          },
        }),
        res
      );

      expect(lastErpBody(fetchMock).currency).toBe('SAR');
    });

    it('IGNORES a client-supplied order reference and mints its own', async () => {
      const fetchMock = erpSequence(
        { body: CATALOGUE },
        { body: PAYMENT_RESULT }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            packageId: PACKAGE_ID,
            // Guessable and attacker-chosen — the value that used to be sent.
            orderReference: 'pay-1f1b3311-1700000000000',
            amount: 199,
            paymentMethod: 'credit_card',
          },
        }),
        res
      );

      const sent = lastErpBody(fetchMock).orderReference as string;

      expect(sent).not.toBe('pay-1f1b3311-1700000000');
      expect(sent).toMatch(/^ord_[A-Za-z0-9_-]{32}$/);
    });

    it('never forwards an amount the caller invented, whatever the package', async () => {
      const fetchMock = erpSequence(
        { body: CATALOGUE },
        { body: PAYMENT_RESULT }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            packageId: OTHER_PACKAGE_ID,
            amount: 0.01,
            paymentMethod: 'credit_card',
          },
        }),
        res
      );

      expect(lastErpBody(fetchMock).amount).toBe(499);
    });

    it('refuses a request that cannot be priced at all', async () => {
      // No package id and no intent: the old client shape. There is nothing to
      // derive a price from, so this must not become a payable order.
      const fetchMock = erpSequence(
        { body: CATALOGUE },
        { body: PAYMENT_RESULT }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            orderReference: 'pay-12345678',
            amount: 199,
            currency: 'SAR',
            paymentMethod: 'credit_card',
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: { message: 'invalid-request' } });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses an unknown package id instead of pricing it', async () => {
      const fetchMock = erpSequence(
        { body: CATALOGUE },
        { body: PAYMENT_RESULT }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            packageId: '3f1b3311-2477-49f1-8c5c-3abb1c3ecd4e',
            amount: 199,
            paymentMethod: 'credit_card',
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      // Only the catalogue was read; no payment was created.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(lastErpUrl(fetchMock)).toContain('/catalog/packages');
    });

    it('refuses a trial-only package rather than inventing an amount', async () => {
      erpSequence(
        { body: [{ id: PACKAGE_ID, name: 'Free', isActive: true }] },
        { body: PAYMENT_RESULT }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: { packageId: PACKAGE_ID, paymentMethod: 'credit_card' },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: { message: 'invalid-amount' } });
    });
  });

  describe('the signed-intent path', () => {
    it('charges exactly what the intent says, without a catalogue read', async () => {
      const { intent } = signOrderIntent({
        orderReference: 'ord_intent_reference',
        amount: 499,
        currency: 'SAR',
        packageId: OTHER_PACKAGE_ID,
        billingCycle: 'monthly',
      });

      const fetchMock = erpSequence({ body: PAYMENT_RESULT });
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({ body: { intent, paymentMethod: 'credit_card' } }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(lastErpBody(fetchMock).orderReference).toBe(
        'ord_intent_reference'
      );
      expect(lastErpBody(fetchMock).amount).toBe(499);
      // One call only: the intent already carries the terms.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('accepts a packageId that AGREES with the intent', async () => {
      const { intent } = signOrderIntent({
        orderReference: 'ord_agreeing',
        amount: 199,
        currency: 'SAR',
        packageId: PACKAGE_ID,
        billingCycle: 'monthly',
      });

      const fetchMock = erpSequence({ body: PAYMENT_RESULT });
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: { intent, packageId: PACKAGE_ID, paymentMethod: 'credit_card' },
        }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(lastErpBody(fetchMock).amount).toBe(199);
    });

    it('refuses a packageId that DISAGREES with the intent', async () => {
      // The attack this blocks: attach a cheap package's id to an expensive
      // intent, or vice versa, so the reference and the amount describe
      // different orders.
      const { intent } = signOrderIntent({
        orderReference: 'ord_disagreeing',
        amount: 499,
        currency: 'SAR',
        packageId: OTHER_PACKAGE_ID,
        billingCycle: 'monthly',
      });

      const fetchMock = erpSequence({ body: PAYMENT_RESULT });
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            intent,
            packageId: PACKAGE_ID,
            paymentMethod: 'credit_card',
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts a billingCycle that AGREES with the intent', async () => {
      // Loaded with the yearly switch ON (PG-31): with it off, a yearly intent
      // is refused before this cross-check is reached — see the
      // 'yearly billing switch' suite below.
      const handler = await loadPaymentsHandler('true');
      const { intent } = signOrderIntent({
        orderReference: 'ord_cycle_agreeing',
        amount: 1990,
        currency: 'SAR',
        packageId: PACKAGE_ID,
        billingCycle: 'yearly',
      });

      const fetchMock = erpSequence({ body: PAYMENT_RESULT });
      const res = createMockRes();

      await handler(
        createMockReq({
          body: {
            intent,
            billingCycle: 'yearly',
            paymentMethod: 'credit_card',
          },
        }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(lastErpBody(fetchMock).amount).toBe(1990);
    });

    it('carries the signed intent\u2019s billingCycle into the outbound ERP request', async () => {
      // No `billingCycle` in the body at all: the cycle the ERP is told to bill
      // comes from the signed, server-verified terms, exactly like the amount.
      // Loaded with the yearly switch ON (PG-31) — off, the resolved cycle is
      // refused instead (see the 'yearly billing switch' suite below).
      const handler = await loadPaymentsHandler('true');
      const { intent } = signOrderIntent({
        orderReference: 'ord_cycle_from_intent',
        amount: 1990,
        currency: 'SAR',
        packageId: PACKAGE_ID,
        billingCycle: 'yearly',
      });

      const fetchMock = erpSequence({ body: PAYMENT_RESULT });
      const res = createMockRes();

      await handler(
        createMockReq({ body: { intent, paymentMethod: 'credit_card' } }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(lastErpBody(fetchMock).billingCycle).toBe('yearly');
    });

    it('refuses a billingCycle that DISAGREES with the intent', async () => {
      // The package-id confusion, one field over: the intent is a YEARLY
      // commitment, so a request that calls it `monthly` is asking to bill a
      // cycle the server never priced.
      const { intent } = signOrderIntent({
        orderReference: 'ord_cycle_disagreeing',
        amount: 1990,
        currency: 'SAR',
        packageId: PACKAGE_ID,
        billingCycle: 'yearly',
      });

      const fetchMock = erpSequence({ body: PAYMENT_RESULT });
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            intent,
            billingCycle: 'monthly',
            paymentMethod: 'credit_card',
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ['a tampered signature', 'AAAA.BBBB'],
      ['a malformed token', 'not-a-token'],
      ['an empty intent', ''],
    ])('refuses %s', async (label, intent) => {
      const fetchMock = erpSequence({ body: PAYMENT_RESULT });
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({ body: { intent, paymentMethod: 'credit_card' } }),
        res
      );

      expect({ label, status: res.statusCode }).toEqual({ label, status: 400 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses an expired intent', async () => {
      const { intent } = signOrderIntent(
        {
          orderReference: 'ord_expired',
          amount: 199,
          currency: 'SAR',
          packageId: PACKAGE_ID,
          billingCycle: 'monthly',
        },
        // Issued 31 minutes ago.
        Date.now() - 31 * 60 * 1000
      );

      const fetchMock = erpSequence({ body: PAYMENT_RESULT });
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({ body: { intent, paymentMethod: 'credit_card' } }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses an intent whose payload was edited to lower the price', async () => {
      const { intent } = signOrderIntent({
        orderReference: 'ord_edited',
        amount: 499,
        currency: 'SAR',
        packageId: OTHER_PACKAGE_ID,
        billingCycle: 'monthly',
      });

      const [payload, signature] = intent.split('.');
      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8')
      ) as Record<string, unknown>;
      decoded.amount = 1;

      const forged = `${Buffer.from(JSON.stringify(decoded), 'utf8').toString(
        'base64url'
      )}.${signature}`;

      const fetchMock = erpSequence({ body: PAYMENT_RESULT });
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: { intent: forged, paymentMethod: 'credit_card' },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('P4.24 — the callback URL', () => {
    it('rejects an off-allowlist callback instead of silently rewriting it', async () => {
      const fetchMock = erpSequence(
        { body: CATALOGUE },
        { body: PAYMENT_RESULT }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            packageId: PACKAGE_ID,
            paymentMethod: 'credit_card',
            callbackUrl: 'https://evil.tld/payment/success?order=x',
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: { message: 'invalid-request' } });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a look-alike callback host', async () => {
      erpSequence({ body: CATALOGUE }, { body: PAYMENT_RESULT });
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            packageId: PACKAGE_ID,
            paymentMethod: 'credit_card',
            callbackUrl: `${APP_ORIGIN}.evil.tld/payment/success`,
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
    });

    it('builds the callback from OUR origin and the SERVER reference', async () => {
      const fetchMock = erpSequence(
        { body: CATALOGUE },
        { body: PAYMENT_RESULT }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            packageId: PACKAGE_ID,
            paymentMethod: 'credit_card',
            callbackUrl: `${APP_ORIGIN}/payment/success?order=attacker-chosen`,
          },
        }),
        res
      );

      const sent = lastErpBody(fetchMock).callbackUrl as string;
      const sentUrl = new URL(sent);
      const orderReference = lastErpBody(fetchMock).orderReference as string;

      expect(sentUrl.origin).toBe(APP_ORIGIN);
      expect(sentUrl.pathname).toBe('/payment/success');
      expect(sentUrl.searchParams.get('order')).toBe(orderReference);
      expect(sent).not.toContain('attacker-chosen');
    });

    it('preserves the locale prefix across the gateway round trip', async () => {
      const fetchMock = erpSequence(
        { body: CATALOGUE },
        { body: PAYMENT_RESULT }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            packageId: PACKAGE_ID,
            paymentMethod: 'credit_card',
            callbackUrl: `${APP_ORIGIN}/en/payment/success?order=x`,
          },
        }),
        res
      );

      expect(
        new URL(lastErpBody(fetchMock).callbackUrl as string).pathname
      ).toBe('/en/payment/success');
    });

    it('fabricates a callback when the client sends none', async () => {
      const fetchMock = erpSequence(
        { body: CATALOGUE },
        { body: PAYMENT_RESULT }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: { packageId: PACKAGE_ID, paymentMethod: 'credit_card' },
        }),
        res
      );

      const sent = new URL(lastErpBody(fetchMock).callbackUrl as string);
      const orderReference = lastErpBody(fetchMock).orderReference as string;

      expect(sent.origin).toBe(APP_ORIGIN);
      expect(sent.pathname).toBe('/payment/success');
      expect(sent.searchParams.get('order')).toBe(orderReference);
    });
  });

  describe('P4.24 — the outbound paymentUrl', () => {
    it('passes through a whitelisted gateway URL', async () => {
      erpSequence({ body: CATALOGUE }, { body: PAYMENT_RESULT });
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: { packageId: PACKAGE_ID, paymentMethod: 'credit_card' },
        }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.data.paymentUrl).toBe(PAYMENT_RESULT.paymentUrl);
    });

    it.each([
      ['https://evil.tld/pay', 'an arbitrary host'],
      ['https://evil-moyasar.com/pay', 'a suffix look-alike'],
      ['https://moyasar.com.evil.tld/pay', 'a prefix look-alike'],
      ['http://api.moyasar.com/pay', 'a protocol downgrade'],
      ['javascript:alert(1)', 'a javascript URL'],
    ])('refuses to hand the browser %s (%s)', async (paymentUrl, label) => {
      // The component's own check runs in the customer's browser, so it is not a
      // trust boundary. The server must refuse before the value crosses.
      erpSequence(
        { body: CATALOGUE },
        { body: { ...PAYMENT_RESULT, paymentUrl } }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: { packageId: PACKAGE_ID, paymentMethod: 'credit_card' },
        }),
        res
      );

      expect({ label, status: res.statusCode }).toEqual({
        label,
        status: 502,
      });
      expect(res.body).toEqual({
        error: { message: 'erp-malformed-response' },
      });
    });

    it('leaves an ABSENT paymentUrl alone — that is not this ticket', async () => {
      // An ERP that accepts the request but produces no redirect is an existing,
      // separate state the client already handles.
      erpSequence(
        { body: CATALOGUE },
        { body: { status: 'initiated', externalId: 'ext-1' } }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: { packageId: PACKAGE_ID, paymentMethod: 'credit_card' },
        }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.data.paymentUrl).toBeUndefined();
    });
  });

  describe('the outbound ERP request shape (PG-31 adds billingCycle)', () => {
    it('sends exactly these fields, billingCycle included', async () => {
      const fetchMock = erpSequence(
        { body: CATALOGUE },
        { body: PAYMENT_RESULT }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            packageId: PACKAGE_ID,
            paymentMethod: 'credit_card',
            customerName: 'ACME',
            customerEmail: 'payer@example.com',
            customerPhone: '+966500000000',
            description: 'Starter plan',
          },
        }),
        res
      );

      expect(Object.keys(lastErpBody(fetchMock)).sort()).toEqual([
        'amount',
        'billingCycle',
        'callbackUrl',
        'currency',
        'customerEmail',
        'customerName',
        'customerPhone',
        'description',
        'orderReference',
        'paymentMethod',
      ]);
      expect(lastErpUrl(fetchMock)).toContain('/payments');
    });

    it('never forwards the server-only control fields to the ERP', async () => {
      // A valid intent so the request reaches the ERP call at all; the point is
      // what is NOT in the outbound body. A field that reached the ERP here
      // would be a future `erpPaymentSchema` addition silently becoming an ERP
      // input — which is exactly how the old proxy behaved.
      const { intent } = signOrderIntent({
        orderReference: 'ord_shape_check',
        amount: 199,
        currency: 'SAR',
        packageId: PACKAGE_ID,
        billingCycle: 'monthly',
      });

      const fetchMock = erpSequence({ body: PAYMENT_RESULT });
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: {
            packageId: PACKAGE_ID,
            intent,
            paymentMethod: 'credit_card',
          },
        }),
        res
      );

      expect(res.statusCode).toBe(200);

      const sent = lastErpBody(fetchMock);

      expect(sent).not.toHaveProperty('packageId');
      expect(sent).not.toHaveProperty('intent');
      expect(sent).not.toHaveProperty('recaptchaToken');
    });
  });

  describe('transport and error handling', () => {
    it('answers 405 with an Allow header for a non-POST method', async () => {
      const res = createMockRes();

      await paymentsHandler(createMockReq({ method: 'GET' }), res);

      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('POST');
    });

    it('answers 429 before doing any work', async () => {
      limiters.payments.allow.mockReturnValue(false);
      const fetchMock = erpSequence({ body: CATALOGUE });
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: { packageId: PACKAGE_ID, paymentMethod: 'credit_card' },
        }),
        res
      );

      expect(res.statusCode).toBe(429);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('answers 400 for a body that is not a payment request at all', async () => {
      const res = createMockRes();

      await paymentsHandler(createMockReq({ body: {} }), res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error.message).toBe('invalid-request');
      expect(res.body.issues).toBeDefined();
    });

    it('maps an upstream unsupported-method 400 to the specific code', async () => {
      erpSequence(
        { body: CATALOGUE },
        { body: { error: 'Unsupported payment method: crypto' }, status: 400 }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: { packageId: PACKAGE_ID, paymentMethod: 'credit_card' },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        error: { message: 'unsupported-payment-method' },
      });
    });

    it('maps an unreachable ERP to 503 erp-unavailable without leaking text', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => CATALOGUE,
        })
        .mockRejectedValueOnce(new TypeError('fetch failed'));

      global.fetch = fetchMock as unknown as typeof fetch;
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: { packageId: PACKAGE_ID, paymentMethod: 'credit_card' },
        }),
        res
      );

      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({ error: { message: 'erp-unavailable' } });
    });

    it('never leaks upstream failure text into the response', async () => {
      erpSequence(
        { body: CATALOGUE },
        {
          body: {
            error:
              'Microsoft.Data.SqlClient.SqlException: Login failed for user sa at PlatformBillingController.cs:line 42',
          },
          status: 500,
        }
      );
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({
          body: { packageId: PACKAGE_ID, paymentMethod: 'credit_card' },
        }),
        res
      );

      const serialized = JSON.stringify(res.body);

      expect(serialized).not.toContain('SqlException');
      expect(serialized).not.toContain('Login failed');
      expect(serialized).not.toContain('PlatformBillingController');
    });
  });
});

describe('yearly billing switch (PG-31)', () => {
  const yearlyIntent = () =>
    signOrderIntent({
      orderReference: 'ord_yearly_intent',
      amount: 1990,
      currency: 'SAR',
      packageId: PACKAGE_ID,
      billingCycle: 'yearly',
    }).intent;

  it('refuses a yearly order on the packageId path when the flag is off', async () => {
    const handler = await loadPaymentsHandler(undefined);
    const fetchMock = erpSequence(
      { body: YEARLY_CATALOGUE },
      { body: PAYMENT_RESULT }
    );
    const res = createMockRes();

    await handler(
      createMockReq({
        body: {
          packageId: PACKAGE_ID,
          billingCycle: 'yearly',
          paymentMethod: 'credit_card',
        },
      }),
      res
    );

    // The same code every other unchargeable request gets, through the same
    // responder. Refused before any pricing work: nothing reached the ERP, so
    // this cannot become a charge and an unreachable ERP cannot answer 503.
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: { message: 'invalid-request' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['unset', undefined],
    ['blank', ''],
    ['"false"', 'false'],
    ['"1"', '1'],
    ['a typo', 'ture'],
  ])('still refuses yearly with the flag %s', async (_label, flag) => {
    const handler = await loadPaymentsHandler(flag);
    const fetchMock = erpSequence(
      { body: YEARLY_CATALOGUE },
      { body: PAYMENT_RESULT }
    );
    const res = createMockRes();

    await handler(
      createMockReq({
        body: {
          packageId: PACKAGE_ID,
          billingCycle: 'yearly',
          paymentMethod: 'credit_card',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toBe('invalid-request');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a yearly INTENT when the flag is off, even with no cycle in the body', async () => {
    // The intent path is self-describing: `{ intent }` alone is priced from the
    // cycle inside the token, so a yearly intent is payable even when the
    // request never mentions a cycle — including one minted in the 30-minute TTL
    // window before the switch was turned off. Gating the request field alone
    // would leave this route open.
    const handler = await loadPaymentsHandler(undefined);
    const fetchMock = erpSequence({ body: PAYMENT_RESULT });
    const res = createMockRes();

    await handler(
      createMockReq({
        body: { intent: yearlyIntent(), paymentMethod: 'credit_card' },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: { message: 'invalid-request' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still prices a monthly order while the flag is off', async () => {
    const handler = await loadPaymentsHandler(undefined);
    const fetchMock = erpSequence(
      { body: YEARLY_CATALOGUE },
      { body: PAYMENT_RESULT }
    );
    const res = createMockRes();

    await handler(
      createMockReq({
        body: { packageId: PACKAGE_ID, paymentMethod: 'credit_card' },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(lastErpBody(fetchMock).amount).toBe(199);
    expect(lastErpBody(fetchMock).billingCycle).toBe('monthly');
  });

  const YEARLY_REQUESTS: Array<
    [string, (intent: string) => Record<string, unknown>]
  > = [
    [
      'the packageId path',
      () => ({
        packageId: PACKAGE_ID,
        billingCycle: 'yearly',
        paymentMethod: 'credit_card',
      }),
    ],
    [
      'the intent path',
      (intent) => ({
        intent,
        billingCycle: 'yearly',
        paymentMethod: 'credit_card',
      }),
    ],
  ];

  it.each(YEARLY_REQUESTS)(
    'sends yearly on %s as before when the flag is on',
    async (_label, body) => {
      const handler = await loadPaymentsHandler('true');
      const fetchMock = erpSequence(
        { body: YEARLY_CATALOGUE },
        { body: PAYMENT_RESULT }
      );
      const res = createMockRes();

      await handler(createMockReq({ body: body(yearlyIntent()) }), res);

      expect(res.statusCode).toBe(200);
      expect(lastErpBody(fetchMock).billingCycle).toBe('yearly');
      expect(lastErpBody(fetchMock).amount).toBe(1990);
    }
  );
});
