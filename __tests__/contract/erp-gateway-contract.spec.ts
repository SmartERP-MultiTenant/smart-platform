import fs from 'fs';
import path from 'path';

import methodsHandler from 'pages/api/public/erp/methods';
import paymentsHandler from 'pages/api/public/erp/payments';
import verifyHandler from 'pages/api/public/erp/verify';
import {
  erpPaymentMethodSchema,
  erpVerifyResponseSchema,
  readErpList,
} from '@/lib/zod/erp';
import gateways from '../../tests/fixtures/erp-gateways.json';

/**
 * Per-gateway payment contract suite (PG-55).
 *
 * ## What this adds over the specs that already exist
 *
 * `__tests__/lib/erp.spec.ts` covers `lib/erp.ts` against mocks; `__tests__/api/
 * public-erp-contract.spec.ts` covers the four public routes against one
 * generic ERP body. Neither covers the thing PG-55 asks for: **every gateway the
 * catalogue can advertise**, and the guarantee that the two places the payment
 * contract lives — the jest suite and the Playwright stub — cannot drift.
 *
 * Three properties are asserted here that were not asserted anywhere before:
 *
 * 1. **Per-gateway coverage.** moyasar (card/mada/apple_pay), tabby, tamara,
 *    hyperpay (stc_pay) and paymob each have a fixture, and the catalogue
 *    derivation is asserted gateway by gateway rather than for one sample row.
 * 2. **The fixtures are self-describing and pinned.** `methods._expected` in
 *    `tests/fixtures/erp-gateways.json` records what the real schema + filter
 *    must produce from that catalogue, and this suite asserts the real code
 *    still produces exactly that. A schema change that quietly widens what the
 *    funnel offers lands here, on the PR, not in production.
 * 3. **Stub parity.** The Playwright stub serves these exact payloads, so what
 *    is asserted against a mocked `fetch` here is the same data the e2e suite
 *    drives through the whole chain. That is what stops the "contract tests" and
 *    the "e2e tests" from describing two different ERPs.
 *
 * ## What it does NOT prove — read before quoting a green run
 *
 * The fixtures are **hand-written** from the documented contract and each
 * gateway's public host conventions. They are not captured from a live ERP, and
 * the ERP WebAPI is not reachable from this repo. So this suite proves the KIT
 * honours the agreed shape; it cannot prove the ERP still sends it. The live
 * leg (a real Moyasar/Tabby/Tamara round trip) is blocked on the ERP half
 * (PG-10/PG-11/PG-12) and is NOT covered by anything in this file.
 */

jest.mock('@/lib/rateLimit', () => ({
  clientKey: jest.fn(() => 'contract-test-client'),
  limiters: {
    catalog: { allow: jest.fn(() => true) },
    verify: { allow: jest.fn(() => true) },
    payments: { allow: jest.fn(() => true) },
  },
}));

/** `available` is `unknown` here on purpose: the fixture contains deliberately
 * invalid entries, so the type must not pretend otherwise. */
interface RawMethodEntry {
  key?: unknown;
  label?: unknown;
  provider?: unknown;
  available?: unknown;
  iconUrl?: unknown;
  _why?: string;
}

interface RawPaymentResult {
  paymentUrl?: unknown;
  externalId?: unknown;
  provider?: unknown;
  status?: unknown;
  internalId?: unknown;
}

const catalogue = gateways.methods.catalogue as unknown as RawMethodEntry[];
const expected = gateways.methods._expected;
const byMethod = gateways.createPayment.byMethod as unknown as Record<
  string,
  RawPaymentResult
>;
const gatewayFamilies = gateways.gatewayHostFamilies.families as string[];
const verifyPrefixes = gateways.verify.byReferencePrefix as unknown as Record<
  string,
  { status: number; body: unknown }
>;

const upstreamSecret = 'Microsoft.Data.SqlClient.SqlException: Login failed';

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

/** Mocks only the network boundary; the schema, the filter and the routes are real. */
const respondWith = (body: unknown, status = 200) => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

  global.fetch = fetchMock;

  return fetchMock;
};

const originalFetch = global.fetch;

const serialized = (res: any) => JSON.stringify(res.body);

/** The derivation the real code produces, expressed once. */
const deriveCatalogue = () => {
  const read = readErpList(catalogue, erpPaymentMethodSchema);

  if (!read.ok) throw new Error('fixture catalogue must be a list');

  return {
    parsed: read.items,
    parsedKeys: read.items.map((method) => method.key),
    surfaced: read.items.filter((method) => method.available),
    droppedForAvailability: read.items
      .filter((method) => !method.available)
      .map((method) => method.key),
    droppedForSchemaFailure: catalogue
      .filter((entry) => !erpPaymentMethodSchema.safeParse(entry).success)
      .map((entry) => entry.key),
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = originalFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('ERP gateway fixtures — per-gateway coverage (PG-55)', () => {
  it.each(['moyasar', 'tabby', 'tamara', 'paymob', 'hyperpay'])(
    'the catalogue advertises the %s provider',
    (provider) => {
      // Coverage is asserted over what the ERP ADVERTISES, not over what the
      // funnel publishes: hyperpay must appear here and must NOT appear in the
      // surfaced set below, precisely because its only method is switched off.
      expect(catalogue.map((entry) => entry.provider)).toContain(provider);
    }
  );

  it('publishes exactly the providers with a live method', () => {
    const { surfaced } = deriveCatalogue();

    expect(Array.from(new Set(surfaced.map((m) => m.provider))).sort()).toEqual(
      ['moyasar', 'paymob', 'tabby', 'tamara']
    );
  });

  it('publishes NOTHING for a provider whose only method is switched off', () => {
    const { surfaced } = deriveCatalogue();

    // The hyperpay/stc_pay case. This is PG-05/PG-22 in one assertion: a
    // gateway the ERP has declared unavailable must not survive into the
    // funnel, however prominent it was in the catalogue.
    expect(catalogue.some((entry) => entry.provider === 'hyperpay')).toBe(true);
    expect(surfaced.map((m) => m.provider)).not.toContain('hyperpay');
  });
});

describe('catalogue fixture — the fail-closed derivation is pinned (PG-20)', () => {
  it('surfaces exactly the keys the fixture declares', () => {
    expect(deriveCatalogue().surfaced.map((method) => method.key)).toEqual(
      expected.surfacedKeys
    );
  });

  it('parses exactly the keys the fixture declares', () => {
    expect(deriveCatalogue().parsedKeys).toEqual(expected.parsedKeys);
  });

  it('drops, for availability, exactly the keys the fixture declares', () => {
    expect(deriveCatalogue().droppedForAvailability).toEqual(
      expected.droppedForAvailability
    );
  });

  it('rejects, at the schema, exactly the entries the fixture declares', () => {
    expect(deriveCatalogue().droppedForSchemaFailure).toEqual(
      expected.droppedForSchemaFailure
    );
  });

  it('treats a MISSING `available` as unavailable, never as available', () => {
    const { surfaced, droppedForSchemaFailure } = deriveCatalogue();

    // The headline fail-closed rule: availability is REQUIRED and deliberately
    // not defaulted. An absent flag is not a promise that the gateway works.
    for (const key of expected.droppedForMissingAvailability) {
      expect(droppedForSchemaFailure).toContain(key);
      expect(surfaced.map((method) => method.key)).not.toContain(key);
    }
  });

  it.each([
    ['missing', undefined],
    ['stringly-typed', 'true'],
    ['null', null],
    ['numeric', 1],
  ])('never offers a method whose `available` is %s', (_label, value) => {
    const entry: Record<string, unknown> = {
      key: 'probe_method',
      label: 'Probe',
      provider: 'moyasar',
    };

    if (value !== undefined) entry.available = value;

    expect(erpPaymentMethodSchema.safeParse(entry).success).toBe(false);
  });

  it('surfaces only methods the ERP vouched for', () => {
    for (const method of deriveCatalogue().surfaced) {
      expect(method.available).toBe(true);
    }
  });

  it('keeps a method whose icon is unusable, dropping only the icon', () => {
    const { surfaced } = deriveCatalogue();

    for (const key of expected.methodsKeptWithIconDropped) {
      const method = surfaced.find((entry) => entry.key === key);

      expect(method).toBeDefined();
      // Junk icon -> no icon, NOT no method. The icon is decoration.
      expect(method?.iconUrl).toBeUndefined();
    }
  });

  it('never lets a fixture annotation leak into a published method', () => {
    // `_why` keys document the broken entries. The schema strips unknown keys,
    // so they must not appear in what the funnel receives.
    for (const method of deriveCatalogue().parsed) {
      expect(method).not.toHaveProperty('_why');
    }
  });

  it('publishes no method with an insecure icon URL', () => {
    for (const method of deriveCatalogue().parsed) {
      if (method.iconUrl !== undefined) {
        expect(method.iconUrl).toMatch(/^https:\/\//i);
      }
    }
  });
});

describe('gateway hosts — the fixtures stay inside what the funnel will accept', () => {
  /**
   * Only the URLs the funnel can actually receive are checked: the icons of
   * SURFACED methods and the paymentUrls of successful creates.
   *
   * The deliberately-broken catalogue entries (`http://insecure.example.com/...`)
   * are INPUTS to the contract, not outputs of it — asserting they are https
   * would assert the opposite of what they exist to prove, and they are covered
   * by the drop assertions above instead.
   */
  const publishedUrls: string[] = [
    ...deriveCatalogue().surfaced.map((method) => method.iconUrl),
    ...Object.values(byMethod).map((result) => result.paymentUrl),
  ].filter((url): url is string => typeof url === 'string');

  it('has the expected six gateway families', () => {
    expect(gatewayFamilies).toEqual([
      'moyasar.com',
      'paymob.com',
      'tabby.ai',
      'tamara.co',
      'oppwa.com',
      'hyperpay.com',
    ]);
  });

  it('publishes at least one URL per gateway family it claims to support', () => {
    const familiesUsed = new Set(
      publishedUrls.map((url) =>
        gatewayFamilies.find(
          (family) =>
            new URL(url).hostname.toLowerCase() === family ||
            new URL(url).hostname.toLowerCase().endsWith(`.${family}`)
        )
      )
    );

    expect(Array.from(familiesUsed).sort()).toEqual([
      'moyasar.com',
      'oppwa.com',
      'paymob.com',
      'tabby.ai',
      'tamara.co',
    ]);
  });

  it('uses only https for every URL the funnel can receive', () => {
    // Mixed content and non-https gateway redirects are both refused, so a
    // published fixture URL using http would test a path the browser never
    // takes.
    expect(
      publishedUrls.filter((url) => !url.toLowerCase().startsWith('https://'))
    ).toEqual([]);
  });

  it.each(publishedUrls)(
    'keeps %s inside a CSP/allow-list gateway family',
    (url) => {
      // middleware.ts CSP (img-src/script-src/frame-src/form-action) and
      // components/erp/PaymentActivation.tsx's PAYMENT_GATEWAY_HOSTS carry the
      // same six families. A fixture host outside them would be silently
      // refused by the browser or by the client allow-list, so the assertions
      // built on it would be testing a redirect that never happens.
      const host = new URL(url).hostname.toLowerCase();

      expect(
        gatewayFamilies.some(
          (family) => host === family || host.endsWith(`.${family}`)
        )
      ).toBe(true);
    }
  );

  it('gives every gateway a distinct, non-null payment URL', () => {
    const urls = Object.values(byMethod).map((result) => result.paymentUrl);

    expect(urls.every((url) => typeof url === 'string' && url.length > 0)).toBe(
      true
    );
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('GET /api/payments/methods — per gateway, through the real route', () => {
  it('publishes the pinned catalogue and nothing else', async () => {
    respondWith(catalogue);
    const res = createMockRes();

    await methodsHandler(createMockReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.map((method: any) => method.key)).toEqual(
      expected.surfacedKeys
    );
  });

  it.each(['stc_pay', 'tamara_installments', 'stringly_available'])(
    'never offers %s',
    async (key) => {
      respondWith(catalogue);
      const res = createMockRes();

      await methodsHandler(createMockReq({ method: 'GET' }), res);

      expect(serialized(res)).not.toContain(key);
    }
  );

  it('reads the ERP catalogue from the documented endpoint path', async () => {
    const fetchMock = respondWith(catalogue);

    await methodsHandler(createMockReq({ method: 'GET' }), createMockRes());

    const url = String(fetchMock.mock.calls[0][0]);

    // The path is the contract with the ERP; a typo here is a silent empty
    // funnel, which the client renders as "no payment methods available".
    expect(url).toContain('/payments/methods');
    expect(url).toContain('country=SA');
  });

  it('answers an EMPTY list as a 200 empty catalogue, not as a malformed response', async () => {
    respondWith(gateways.methods.emptyCatalogue.body);
    const res = createMockRes();

    await methodsHandler(createMockReq({ method: 'GET' }), res);

    // The envelope is a valid array, so this is "we know the catalogue and it
    // is empty", not "we cannot read the ERP". Only a NON-ARRAY body is a 502,
    // and conflating the two would blank the funnel's method list into an
    // error state for a perfectly well-formed empty catalogue.
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it('answers 502 for a 200 whose envelope is not a list, never 500 (P4.10b)', async () => {
    // The counterpart to the case above, and the reason `readErpList` treats the
    // envelope as all-or-nothing. `{ data: [] }` parses perfectly and then has
    // no `.map()` — the exact shape that used to reach the page and 500 it.
    // 502 ("we cannot read the ERP") is the honest answer; a 200 here would
    // publish an empty catalogue we never actually read.
    respondWith(gateways.methods.notAList.body);
    const res = createMockRes();

    await methodsHandler(createMockReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: { message: 'erp-malformed-response' } });
  });
});

describe('POST /api/public/erp/payments — per gateway', () => {
  const validBody = (paymentMethod: string) => ({
    orderReference: 'pay-12345678',
    amount: 199,
    currency: 'SAR',
    paymentMethod,
  });

  it.each(Object.keys(byMethod))(
    'passes the %s paymentUrl through unchanged',
    async (methodKey) => {
      respondWith(byMethod[methodKey]);
      const res = createMockRes();

      await paymentsHandler(
        createMockReq({ method: 'POST', body: validBody(methodKey) }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.data.paymentUrl).toBe(byMethod[methodKey].paymentUrl);
    }
  );

  it('passes a null paymentUrl through instead of inventing a redirect', async () => {
    respondWith(gateways.createPayment.noUrl);
    const res = createMockRes();

    await paymentsHandler(
      createMockReq({ method: 'POST', body: validBody('no_redirect') }),
      res
    );

    // `paymentUrl` is optional AND nullable in `ErpPaymentResult`. A gateway
    // that never opened a session is a legal success body with no target, and
    // the funnel must be handed the null rather than an empty string or a
    // fabricated URL it would then try to navigate to.
    expect(res.statusCode).toBe(200);
    expect(res.body.data.paymentUrl).toBeNull();
  });

  it('posts to the documented ERP endpoint path', async () => {
    const fetchMock = respondWith(byMethod.credit_card);

    await paymentsHandler(
      createMockReq({ method: 'POST', body: validBody('credit_card') }),
      createMockRes()
    );

    expect(String(fetchMock.mock.calls[0][0])).toContain('/payments');
  });

  it('maps the ERP unsupported-method rejection to a stable code', async () => {
    respondWith(gateways.createPayment.unsupportedMethodBody, 400);
    const res = createMockRes();

    await paymentsHandler(
      createMockReq({ method: 'POST', body: validBody('crypto') }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: { message: 'unsupported-payment-method' },
    });
  });

  it('maps the ERP amount rejection to a stable code', async () => {
    respondWith(gateways.createPayment.amountErrorBody, 400);
    const res = createMockRes();

    await paymentsHandler(
      createMockReq({ method: 'POST', body: validBody('credit_card') }),
      res
    );

    expect(res.body).toEqual({ error: { message: 'invalid-amount' } });
  });
});

describe('GET /api/public/erp/verify — every fixture outcome, through the real route', () => {
  /**
   * The route answer each stub prefix must produce. Kept next to the fixture so
   * the stub payload and the BFF behaviour are asserted as ONE contract: if the
   * stub starts serving a body the BFF rejects, this fails.
   */
  const expectedRouteOutcome: Record<
    string,
    { status: number; body: unknown }
  > = {
    'e2e-paid-': {
      status: 200,
      body: { data: { success: true, status: 'Paid' } },
    },
    'e2e-pending-': {
      status: 200,
      body: { data: { success: true, status: 'Pending' } },
    },
    'e2e-failed-': {
      status: 200,
      body: { data: { success: false, status: 'Failed' } },
    },
    // Unrecognised but well-typed: passed through verbatim, never coerced and
    // never rejected. Rejecting it would 5xx and the poller reads 5xx as
    // transient, which would turn an unknown state into a success.
    'e2e-unknown-': {
      status: 200,
      body: { data: { success: true, status: 'Succeeded' } },
    },
    // The pre-rollout shape: no `status` at all, which is the ONLY body the
    // optimistic settle is allowed to act on.
    'e2e-nostatus-': { status: 200, body: { data: { success: true } } },
    // `success` is a string: rejected as malformed, so the poller can never
    // read a non-boolean as a boolean.
    'e2e-malformed-': {
      status: 502,
      body: { error: { message: 'erp-malformed-response' } },
    },
    'e2e-unauth-': {
      status: 401,
      body: { error: { message: 'erp-auth-failed' } },
    },
  };

  it('pins every fixture prefix to a documented route outcome', () => {
    // Guards the table itself: a prefix added to the fixture without a matching
    // expectation must not silently skip coverage.
    expect(Object.keys(verifyPrefixes).sort()).toEqual(
      Object.keys(expectedRouteOutcome).sort()
    );
  });

  it.each(Object.keys(expectedRouteOutcome))(
    'answers %s the documented way',
    async (prefix) => {
      const fixture = verifyPrefixes[prefix];

      respondWith(fixture.body, fixture.status);

      const res = createMockRes();

      await verifyHandler(
        createMockReq({
          method: 'GET',
          query: { reference: `${prefix}ref` },
        }),
        res
      );

      expect(res.statusCode).toBe(expectedRouteOutcome[prefix].status);
      expect(res.body).toEqual(expectedRouteOutcome[prefix].body);
    }
  );

  it('round-trips every status the ERP documents', () => {
    for (const status of ['Pending', 'Paid', 'Failed']) {
      expect(
        erpVerifyResponseSchema.safeParse({ success: true, status }).success
      ).toBe(true);
    }
  });

  it('accepts a casing-split status, because the consumer is case-insensitive', () => {
    expect(
      erpVerifyResponseSchema.safeParse({ success: true, status: 'PAID' })
        .success
    ).toBe(true);
  });

  it.each([
    ['stringly-typed success', { success: 'true' }],
    ['object status', { success: true, status: { nested: 'Paid' } }],
    ['null body', null],
    ['array body', []],
    ['string body', 'Paid'],
    ['numeric success', { success: 1 }],
  ])(
    'rejects %s as malformed rather than treating it as a state',
    (_label, body) => {
      expect(erpVerifyResponseSchema.safeParse(body).success).toBe(false);
    }
  );

  it('never leaks upstream text on the auth failure the stub serves', async () => {
    const fixture = verifyPrefixes['e2e-unauth-'];

    // The stub's 401 body carries upstream-looking prose; the BFF must answer
    // with a code and none of that text.
    expect(JSON.stringify(fixture.body)).toContain('Unauthorized');

    respondWith(
      { error: `${upstreamSecret} ${JSON.stringify(fixture.body)}` },
      fixture.status
    );

    const res = createMockRes();

    await verifyHandler(
      createMockReq({ method: 'GET', query: { reference: 'e2e-unauth-ref' } }),
      res
    );

    expect(serialized(res)).not.toContain('SqlException');
    expect(serialized(res)).not.toContain('Unauthorized');
    expect(res.body).toEqual({ error: { message: 'erp-auth-failed' } });
  });
});

describe('stub parity — jest and Playwright must describe one ERP (PG-55)', () => {
  it('serves its payment fixtures from the shared file instead of inlining them', () => {
    // The suite's whole anti-drift property rests on there being exactly one
    // copy of these payloads. If a future edit inlines an ERP body into
    // `erp-stub.cjs`, the stub and these assertions stop describing the same
    // server — silently, and in the direction that makes both look green.
    const stubSource = fs.readFileSync(
      path.join(__dirname, '../../tests/e2e/support/erp-stub.cjs'),
      'utf8'
    );

    expect(stubSource).toContain('fixtures/erp-gateways.json');
    expect(stubSource).toContain("pathname === '/api/payments/methods'");
    expect(stubSource).toContain("pathname === '/api/payments'");
    expect(stubSource).toMatch(/api\\\/payments\\\/verify/);
    expect(stubSource).toContain('byReferencePrefix');
  });

  it('exposes a catalogue payload the BFF contract accepts', () => {
    // The stub hands this exact array to the BFF. If it stopped parsing, the
    // funnel would 502 in e2e and the failure would look like a routing bug.
    expect(readErpList(catalogue, erpPaymentMethodSchema).ok).toBe(true);
  });

  it('exposes verify payloads whose shapes the BFF either accepts or rejects for a reason', () => {
    for (const [prefix, outcome] of Object.entries(verifyPrefixes)) {
      const parsed = erpVerifyResponseSchema.safeParse(outcome.body).success;
      const expectedRejection = prefix === 'e2e-malformed-';

      expect({ prefix, parsed, expectedRejection }).toEqual({
        prefix,
        parsed: !expectedRejection,
        expectedRejection,
      });
    }
  });
});
