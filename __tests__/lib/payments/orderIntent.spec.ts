import crypto from 'crypto';

import {
  mintOrderReference,
  ORDER_INTENT_TTL_MS,
  signOrderIntent,
  verifyOrderIntent,
  type OrderTerms,
} from '@/lib/payments/orderIntent';

/**
 * PG-06 — the signed order intent.
 *
 * This is the boundary that decides what a customer is charged, so the spec is
 * written as a forgery list: every test either proves a legitimate token is
 * accepted or proves a specific way of manufacturing one is not.
 */

const TERMS: OrderTerms = {
  orderReference: 'ord_fixed_reference_for_tests',
  amount: 199,
  currency: 'SAR',
  packageId: '1f1b3311-2477-49f1-8c5c-3abb1c3ecd4c',
  billingCycle: 'monthly',
};

const b64urlEncode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

const b64urlDecode = (segment: string): unknown =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown;

const payloadOf = (token: string): string => token.split('.')[0];

/** `process.env.NODE_ENV` is typed read-only by Next; this is the escape hatch. */
const setNodeEnv = (value: string): void => {
  (process.env as Record<string, string>).NODE_ENV = value;
};

describe('Lib - payments/orderIntent (PG-06)', () => {
  describe('mintOrderReference', () => {
    it('is charset-safe for the ERP contract and long enough to be unguessable', () => {
      const reference = mintOrderReference();

      // The ERP's own reference contract: ^[a-zA-Z0-9_-]+$, 8..64 characters.
      expect(reference).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(reference.length).toBeGreaterThanOrEqual(8);
      expect(reference.length).toBeLessThanOrEqual(64);
      expect(reference.startsWith('ord_')).toBe(true);
    });

    it('carries 192 bits of CSPRNG output', () => {
      // 24 random bytes, base64url-encoded, behind the 4-character 'ord_' prefix.
      expect(mintOrderReference()).toHaveLength(4 + 32);
    });

    it('does not repeat, even across a large sample', () => {
      const references = new Set(
        Array.from({ length: 2000 }, () => mintOrderReference())
      );

      expect(references.size).toBe(2000);
    });

    it('is not time-derived — two calls in the same millisecond differ', () => {
      // The reference this replaces was `pay-<package>-${Date.now()}`, which made
      // concurrent payers collide and the next value predictable. Nothing about
      // the new one may depend on the clock.
      const before = Date.now();
      const first = mintOrderReference();
      const second = mintOrderReference();
      const after = Date.now();

      expect(after - before).toBeLessThan(5);
      expect(first).not.toBe(second);
    });
  });

  describe('a legitimate token round-trips', () => {
    it('returns exactly the terms that were signed', () => {
      const { intent } = signOrderIntent(TERMS);

      expect(verifyOrderIntent(intent)).toEqual(TERMS);
    });

    it('reports an expiry one TTL in the future', () => {
      const now = 1_700_000_000_000;
      const { intent, expiresAt } = signOrderIntent(TERMS, now);

      expect(expiresAt).toBe(new Date(now + ORDER_INTENT_TTL_MS).toISOString());
      expect(verifyOrderIntent(intent, now + 1)).toEqual(TERMS);
    });

    it('carries only the four charging fields and an expiry', () => {
      // The token travels to the browser, so the payload is asserted to hold no
      // customer data — a signature protects integrity, not confidentiality.
      // (Assigned to a variable first so the excess-property check does not fire:
      // the point is the extra fields must not survive into the payload.)
      const withExtras = {
        ...TERMS,
        customerEmail: 'payer@example.com',
        description: 'should not be signed',
      };

      const { intent } = signOrderIntent(withExtras);

      const payload = b64urlDecode(payloadOf(intent)) as Record<
        string,
        unknown
      >;

      expect(Object.keys(payload).sort()).toEqual([
        'amount',
        'cur',
        'cyc',
        'exp',
        'pkg',
        'ref',
        'v',
      ]);
      expect(verifyOrderIntent(intent)).toEqual(TERMS);
    });

    it('still honours a v1 payload and prices it for monthly billing', () => {
      // v1 payloads predate `cyc`. Refusing them would strand a checkout that
      // was priced before the field existed, and the only cycle a v1 order can
      // have been priced for is monthly — so that is what must be reported.
      //
      // The signing key is CAPTURED from a real signing call rather than
      // re-derived here: the derivation (a domain-separated hash of the
      // configured secret) belongs to the module, and re-implementing it in a
      // spec would let the two drift apart without failing.
      const createHmac = jest.spyOn(crypto, 'createHmac');
      signOrderIntent(TERMS);
      const signingKey = createHmac.mock.calls[0][1];
      createHmac.mockRestore();

      const payload = b64urlEncode({
        v: 1,
        ref: TERMS.orderReference,
        amount: TERMS.amount,
        cur: TERMS.currency,
        pkg: TERMS.packageId,
        exp: Date.now() + ORDER_INTENT_TTL_MS,
      });

      const signature = crypto
        .createHmac('sha256', signingKey)
        .update(payload)
        .digest('base64url');

      const terms = verifyOrderIntent(`${payload}.${signature}`);

      expect(terms?.billingCycle).toBe('monthly');
      expect(terms).toEqual(TERMS);
    });
  });

  describe('forged and malformed tokens are refused', () => {
    it.each([
      [undefined, 'undefined'],
      [null, 'null'],
      ['', 'empty string'],
      [42, 'a number'],
      [{}, 'an object'],
      [[], 'an array'],
      ['no-separator-at-all', 'no dot'],
      ['a.b.c', 'three segments'],
      ['.', 'two empty segments'],
      ['payload.', 'empty signature'],
      ['.signature', 'empty payload'],
      ['!!!.!!!', 'non-base64 segments'],
      ['eyJhIjoxfQ', 'a payload with no signature'],
    ])('refuses %p (%s)', (token, label) => {
      expect({ label, result: verifyOrderIntent(token) }).toEqual({
        label,
        result: null,
      });
    });

    it('refuses a payload that was edited after signing', () => {
      const { intent } = signOrderIntent(TERMS);
      const signature = intent.split('.')[1];

      const forged = `${b64urlEncode({
        v: 2,
        ref: TERMS.orderReference,
        // The whole point: a caller cannot lower the price.
        amount: 1,
        cur: TERMS.currency,
        pkg: TERMS.packageId,
        cyc: TERMS.billingCycle,
        exp: Date.now() + ORDER_INTENT_TTL_MS,
      })}.${signature}`;

      expect(verifyOrderIntent(forged)).toBeNull();
    });

    it('refuses a signature that was edited after signing', () => {
      const { intent } = signOrderIntent(TERMS);
      const [payload, signature] = intent.split('.');

      const flipped =
        signature[0] === 'A'
          ? `B${signature.slice(1)}`
          : `A${signature.slice(1)}`;

      expect(verifyOrderIntent(`${payload}.${flipped}`)).toBeNull();
    });

    it('refuses a signature of the wrong length', () => {
      const { intent } = signOrderIntent(TERMS);
      const [payload, signature] = intent.split('.');

      // `crypto.timingSafeEqual` throws on a length mismatch; the guard that
      // returns null instead is what stops hostile input being a 500.
      expect(
        verifyOrderIntent(`${payload}.${signature.slice(0, -2)}`)
      ).toBeNull();
      expect(verifyOrderIntent(`${payload}.${signature}AAAA`)).toBeNull();
    });

    it.each([
      [
        {
          v: 3,
          ref: 'ord_x',
          amount: 1,
          cur: 'SAR',
          pkg: 'p',
          cyc: 'monthly',
          exp: 9e15,
        },
        'a future payload version',
      ],
      [
        {
          ref: 'ord_x',
          amount: 1,
          cur: 'SAR',
          pkg: 'p',
          cyc: 'monthly',
          exp: 9e15,
        },
        'a missing version',
      ],
      [
        { v: 2, amount: 1, cur: 'SAR', pkg: 'p', cyc: 'monthly', exp: 9e15 },
        'a missing reference',
      ],
      [
        { v: 2, ref: 'ord_x', cur: 'SAR', pkg: 'p', cyc: 'monthly', exp: 9e15 },
        'a missing amount',
      ],
      [
        {
          v: 2,
          ref: 'ord_x',
          amount: '199',
          cur: 'SAR',
          pkg: 'p',
          cyc: 'monthly',
          exp: 9e15,
        },
        'a stringified amount',
      ],
      [
        {
          v: 2,
          ref: 'ord_x',
          amount: 0,
          cur: 'SAR',
          pkg: 'p',
          cyc: 'monthly',
          exp: 9e15,
        },
        'a zero amount',
      ],
      [
        {
          v: 2,
          ref: 'ord_x',
          amount: -5,
          cur: 'SAR',
          pkg: 'p',
          cyc: 'monthly',
          exp: 9e15,
        },
        'a negative amount',
      ],
      [
        {
          v: 2,
          ref: 'ord_x',
          amount: Infinity,
          cur: 'SAR',
          pkg: 'p',
          cyc: 'monthly',
          exp: 9e15,
        },
        'a non-finite amount',
      ],
      [
        {
          v: 2,
          ref: 'short',
          amount: 1,
          cur: 'SAR',
          pkg: 'p',
          cyc: 'monthly',
          exp: 9e15,
        },
        'a too-short reference',
      ],
      [
        {
          v: 2,
          ref: 'ord_x',
          amount: 1,
          cur: 'S',
          pkg: 'p',
          cyc: 'monthly',
          exp: 9e15,
        },
        'a too-short currency',
      ],
      [
        {
          v: 2,
          ref: 'ord_x',
          amount: 1,
          cur: 'SAR',
          pkg: '',
          cyc: 'monthly',
          exp: 9e15,
        },
        'an empty package id',
      ],
      [
        {
          v: 2,
          ref: 'ord_x',
          amount: 1,
          cur: 'SAR',
          pkg: 'p',
          cyc: 'biweekly',
          exp: 9e15,
        },
        'an invalid billing cycle',
      ],
      [
        {
          v: 2,
          ref: 'ord_x',
          amount: 1,
          cur: 'SAR',
          pkg: 'p',
          cyc: 'monthly',
          exp: 'soon',
        },
        'a non-numeric expiry',
      ],
      [
        {
          v: 2,
          ref: 'ord_x',
          amount: 1,
          cur: 'SAR',
          pkg: 'p',
          cyc: 'monthly',
          exp: 1.5,
        },
        'a fractional expiry',
      ],
    ])('refuses a correctly-SIGNED payload of %p (%s)', (payload, label) => {
      // Signed with the real key, so this isolates payload validation from
      // signature validation: the shape rules must hold even for a token we
      // issued ourselves.
      const { intent } = signOrderIntent(TERMS);
      const signature = intent.split('.')[1];

      expect({
        label,
        result: verifyOrderIntent(`${b64urlEncode(payload)}.${signature}`),
      }).toEqual({ label, result: null });
    });

    it('refuses a signed payload that is not valid JSON', () => {
      const { intent } = signOrderIntent(TERMS);
      const signature = intent.split('.')[1];
      const notJson = Buffer.from('{not json', 'utf8').toString('base64url');

      expect(verifyOrderIntent(`${notJson}.${signature}`)).toBeNull();
    });
  });

  describe('expiry', () => {
    it('accepts a token right up to, but not including, its expiry instant', () => {
      const now = 1_700_000_000_000;
      const exp = now + ORDER_INTENT_TTL_MS;
      const { intent } = signOrderIntent(TERMS, now);

      expect(verifyOrderIntent(intent, exp - 1)).toEqual(TERMS);
      // The expiry instant itself is expired: `exp` is the first millisecond at
      // which the token is no longer payable, not the last one at which it is.
      expect(verifyOrderIntent(intent, exp)).toBeNull();
    });

    it('refuses a token one millisecond past its expiry', () => {
      const now = 1_700_000_000_000;
      const { intent } = signOrderIntent(TERMS, now);

      expect(
        verifyOrderIntent(intent, now + ORDER_INTENT_TTL_MS + 1)
      ).toBeNull();
    });

    it('refuses a long-expired token', () => {
      const { intent } = signOrderIntent(TERMS, 0);

      expect(verifyOrderIntent(intent, 1_700_000_000_000)).toBeNull();
    });

    it('bounds the TTL to something a checkout can use but a leak cannot', () => {
      expect(ORDER_INTENT_TTL_MS).toBe(30 * 60 * 1000);
    });
  });

  describe('the signing key', () => {
    const ORIGINAL_KEY = process.env.ERP_TOKEN_ENCRYPTION_KEY;
    const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

    const loadWith = async (key: string, nodeEnv: string) => {
      jest.resetModules();
      setNodeEnv(nodeEnv);
      process.env.ERP_TOKEN_ENCRYPTION_KEY = key;
      jest.doMock('@/lib/env', () => ({
        __esModule: true,
        default: { erp: { tokenEncryptionKey: key } },
      }));

      return import('@/lib/payments/orderIntent');
    };

    afterEach(() => {
      jest.resetModules();
      jest.dontMock('@/lib/env');
      process.env.ERP_TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
      setNodeEnv(ORIGINAL_NODE_ENV);
    });

    it('rejects a token signed with a different key', async () => {
      const withKeyA = await loadWith('key-aaa', 'test');
      const { intent } = withKeyA.signOrderIntent(TERMS);

      const withKeyB = await loadWith('key-bbb', 'test');

      expect(withKeyB.verifyOrderIntent(intent)).toBeNull();
    });

    it('accepts a token signed with the same key', async () => {
      const first = await loadWith('key-aaa', 'test');
      const { intent } = first.signOrderIntent(TERMS);

      const second = await loadWith('key-aaa', 'test');

      expect(second.verifyOrderIntent(intent)).toEqual(TERMS);
    });

    it('refuses to sign in production when the key is missing', async () => {
      // The published dev fallback must never be what protects a live order.
      const orderIntent = await loadWith('', 'production');

      expect(() => orderIntent.signOrderIntent(TERMS)).toThrow(
        /ERP_TOKEN_ENCRYPTION_KEY is required in production/
      );
      expect(() => orderIntent.verifyOrderIntent('x.y')).toThrow(
        /ERP_TOKEN_ENCRYPTION_KEY is required in production/
      );
    });

    it('falls back to the dev key outside production', async () => {
      const orderIntent = await loadWith('', 'test');

      const { intent } = orderIntent.signOrderIntent(TERMS);

      expect(orderIntent.verifyOrderIntent(intent)).toEqual(TERMS);
    });

    it('does not use the raw key material as the signing key', async () => {
      // Domain separation: the value hashed into the HMAC is the configured
      // secret COMBINED with a purpose prefix, so a weakness in the at-rest
      // encryption key cannot be pivoted into forging order intents.
      const raw = 'a-perfectly-readable-secret';
      const orderIntent = await loadWith(raw, 'test');
      const { intent } = orderIntent.signOrderIntent(TERMS);

      const naive = crypto
        .createHmac('sha256', raw)
        .update(payloadOf(intent))
        .digest('base64url');

      expect(intent.split('.')[1]).not.toBe(naive);
      expect(orderIntent.verifyOrderIntent(intent)).toEqual(TERMS);
    });
  });
});
