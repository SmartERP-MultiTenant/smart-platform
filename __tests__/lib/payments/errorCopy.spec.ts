import { ErpApiError, classifyErpError } from '@/lib/erp';
import {
  paymentErrorCodeFromUpstream,
  paymentErrorCodes,
  paymentErrorCopy,
  paymentErrorCopyKey,
} from '@/lib/payments/errorCopy';
import en from '../../../locales/en/common.json';
import ar from '../../../locales/ar/common.json';

const translate = (key: string) => `t:${key}`;
const FALLBACK = 't:erp-payment-general-error';

/**
 * Every code a public payment route can actually put in `error.message`.
 *
 * Kept as a literal list rather than derived from the map under test on
 * purpose: deriving it would make the "is every reachable code mapped?"
 * assertion a tautology. The two sources are covered separately below —
 * the literals the routes raise, and everything `classifyErpError` can return,
 * which is verified by CALLING it rather than by copying its switch.
 */
const LITERAL_ROUTE_CODES = [
  'too-many-requests',
  'missing-reference',
  'invalid-request',
];

const UPSTREAM_ALLOWLIST_CODES = [
  'unsupported-payment-method',
  'invalid-amount',
];

describe('Lib - payments/errorCopy (PG-54)', () => {
  describe('the taxonomy covers everything the BFF can emit', () => {
    it('maps every literal code the routes raise', () => {
      for (const code of LITERAL_ROUTE_CODES) {
        expect(paymentErrorCopyKey(code)).not.toBeNull();
      }
    });

    it('maps every code classifyErpError can produce', () => {
      // Driven through the real classifier, so a new status case added to
      // `classifyErpError` fails here instead of silently rendering the generic
      // fallback in production.
      const representativeFailures: unknown[] = [
        new ErpApiError('bad request', 400),
        new ErpApiError('not found', 404),
        new ErpApiError('unauthorised', 401),
        new ErpApiError('forbidden', 403),
        new ErpApiError('conflict', 409),
        new ErpApiError('rejected', 422),
        new ErpApiError('teapot', 418),
        new ErpApiError('server error', 500),
        new ErpApiError(
          'ERP_MALFORMED_RESPONSE',
          502,
          'ERP_MALFORMED_RESPONSE'
        ),
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
        Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
        Object.assign(new TypeError('fetch failed'), {
          cause: new Error('ECONNREFUSED'),
        }),
        new Error('something else entirely'),
        'a string thrown as an error',
        null,
        undefined,
      ];

      const produced = representativeFailures.map(
        (failure) => classifyErpError(failure).code
      );

      for (const code of produced) {
        expect(paymentErrorCodes()).toContain(code);
      }
    });

    it('maps every code the upstream allow-list can produce', () => {
      for (const code of UPSTREAM_ALLOWLIST_CODES) {
        expect(paymentErrorCodes()).toContain(code);
      }
    });

    it('has no unmapped code among the routes, the classifier and the allow-list', () => {
      // An ARRAY, not a Set: `tsconfig.json` targets es5, where iterating a Set
      // needs `downlevelIteration`. A duplicate entry would be harmless here.
      const reachable = [
        ...LITERAL_ROUTE_CODES,
        ...UPSTREAM_ALLOWLIST_CODES,
        'erp-bad-request',
        'erp-not-found',
        'erp-auth-failed',
        'erp-conflict',
        'erp-rejected',
        'erp-upstream-failure',
        'erp-malformed-response',
        'erp-unavailable',
      ];

      for (const code of reachable) {
        expect(paymentErrorCopyKey(code)).not.toBeNull();
      }
    });
  });

  describe('every mapped key exists in BOTH locales', () => {
    it('resolves to a real key in en and ar for every code', () => {
      // The gate that actually matters: `check-locale.js` proves the key sets are
      // in parity and that each key is referenced somewhere, but it cannot prove
      // that THIS map points at a key that exists. A typo here passes that gate
      // and renders an untranslated token to a paying customer.
      const missing: string[] = [];

      for (const code of paymentErrorCodes()) {
        const key = paymentErrorCopyKey(code);
        if (!key) {
          missing.push(`${code} -> <no key>`);
          continue;
        }

        if (!(key in en)) missing.push(`${code} -> en missing ${key}`);
        if (!(key in ar)) missing.push(`${code} -> ar missing ${key}`);
      }

      expect(missing).toEqual([]);
    });

    it('renders real, non-empty copy in both locales for every code', () => {
      for (const code of paymentErrorCodes()) {
        expect(paymentErrorCopy(code, translate, FALLBACK)).toBe(
          `t:${paymentErrorCopyKey(code)}`
        );
      }

      for (const key of paymentErrorCodes().map(
        (code) => paymentErrorCopyKey(code) as string
      )) {
        expect(typeof (en as Record<string, string>)[key]).toBe('string');
        expect(
          ((en as Record<string, string>)[key] ?? '').length
        ).toBeGreaterThan(0);
        expect(typeof (ar as Record<string, string>)[key]).toBe('string');
        expect(
          ((ar as Record<string, string>)[key] ?? '').length
        ).toBeGreaterThan(0);
      }
    });

    it('exposes exactly one producer-less key, explicitly reserved', () => {
      // The reverse direction. One code ships ahead of its producer
      // (`gateway-timeout`) so the follow-up that adds the distinction has copy
      // waiting. Any OTHER key that no reachable code can render is dead copy
      // implying coverage the customer never gets.
      //
      // `method-not-available` is NOT in that set any more: PG-54's wiring gave
      // it a real producer. `components/erp/PaymentActivation.tsx` raises it
      // when the customer activates a method the catalogue already reported as
      // unavailable — the chip is `aria-disabled` rather than natively
      // disabled, so the refusal has to surface a visible reason. Covered by
      // `__tests__/components/erp/PaymentActivation.spec.tsx`.
      const emittableCodes = [
        ...LITERAL_ROUTE_CODES,
        ...UPSTREAM_ALLOWLIST_CODES,
        'erp-bad-request',
        'erp-not-found',
        'erp-auth-failed',
        'erp-conflict',
        'erp-rejected',
        'erp-upstream-failure',
        'erp-malformed-response',
        'erp-unavailable',
        // Produced client-side by the picker, not by the BFF.
        'method-not-available',
      ];
      const emittableKeys = emittableCodes.map((code) =>
        paymentErrorCopyKey(code)
      );

      const reservedKeys = ['gateway-timeout'].map((code) =>
        paymentErrorCopyKey(code)
      );

      const producerLessKeys = paymentErrorCodes()
        .map((code) => paymentErrorCopyKey(code))
        .filter((key) => !emittableKeys.includes(key))
        .filter((key, index, all) => all.indexOf(key) === index)
        .sort();

      expect(producerLessKeys).toEqual((reservedKeys as string[]).sort());
    });
  });

  describe('paymentErrorCopy — never renders untrusted text', () => {
    it('renders localized copy for a known code', () => {
      expect(paymentErrorCopy('erp-unavailable', translate, FALLBACK)).toBe(
        't:erp-payment-erp-unavailable'
      );
      expect(paymentErrorCopy('too-many-requests', translate, FALLBACK)).toBe(
        't:erp-payment-rate-limited'
      );
    });

    it('returns the fallback for an unknown CODE-SHAPED token instead of the token', () => {
      // The previous component implementation returned the raw string here, so a
      // new backend code would have been printed on screen verbatim.
      expect(paymentErrorCopy('erp-some-new-code', translate, FALLBACK)).toBe(
        FALLBACK
      );
    });

    it('returns the fallback for upstream PROSE instead of the prose', () => {
      const upstream =
        'System.NullReferenceException at PlatformBillingController.cs:line 42';

      const rendered = paymentErrorCopy(upstream, translate, FALLBACK);

      expect(rendered).toBe(FALLBACK);
      expect(rendered).not.toContain('NullReferenceException');
    });

    it('returns the fallback for empty, whitespace-only, null and undefined', () => {
      for (const value of ['', '   ', null, undefined]) {
        expect(paymentErrorCopy(value, translate, FALLBACK)).toBe(FALLBACK);
      }
    });

    it('trims before matching, so a padded code still resolves', () => {
      expect(paymentErrorCopy('  erp-rejected  ', translate, FALLBACK)).toBe(
        't:erp-payment-declined'
      );
    });

    it('never returns its input for any value', () => {
      const inputs = [
        'erp-unavailable',
        'unknown-code',
        'Amount must be greater than zero',
        'x',
      ];

      for (const input of inputs) {
        expect(paymentErrorCopy(input, translate, FALLBACK)).not.toBe(input);
      }
    });
  });

  describe('paymentErrorCodeFromUpstream — the one bounded string match', () => {
    it("maps the ERP's unsupported-method sentence, including its interpolated tail", () => {
      expect(
        paymentErrorCodeFromUpstream('Unsupported payment method: crypto')
      ).toBe('unsupported-payment-method');
      expect(paymentErrorCodeFromUpstream('unsupported payment method')).toBe(
        'unsupported-payment-method'
      );
      expect(paymentErrorCodeFromUpstream('UNSUPPORTED PAYMENT METHOD')).toBe(
        'unsupported-payment-method'
      );
    });

    it("maps the ERP's amount sentence", () => {
      expect(
        paymentErrorCodeFromUpstream('Amount must be greater than zero')
      ).toBe('invalid-amount');
      expect(
        paymentErrorCodeFromUpstream('amount MUST be greater than ZERO.')
      ).toBe('invalid-amount');
    });

    it('returns null for anything not on the allow-list', () => {
      const unmatched = [
        'Subdomain already taken.',
        'Tenant not found.',
        'The payment provider returned 500.',
        '',
        '   ',
      ];

      for (const message of unmatched) {
        expect(paymentErrorCodeFromUpstream(message)).toBeNull();
      }
    });

    it('returns null for non-string input', () => {
      for (const value of [null, undefined, 42, {}, [], true]) {
        expect(paymentErrorCodeFromUpstream(value)).toBeNull();
      }
    });

    it('ALWAYS returns a mapped code, never the text it matched', () => {
      // The property that makes this safe to run in the BFF: whatever it is
      // given, the output is either `null` or a member of the closed vocabulary.
      const inputs = [
        'Unsupported payment method: sk_live_secret',
        'Amount must be greater than zero',
        'orchestrator leak 1234',
      ];

      for (const input of inputs) {
        const code = paymentErrorCodeFromUpstream(input);

        expect(code === null || paymentErrorCodes().includes(code)).toBe(true);
        expect(code).not.toBe(input);
        expect(String(code)).not.toContain('sk_live_secret');
      }
    });
  });
});
