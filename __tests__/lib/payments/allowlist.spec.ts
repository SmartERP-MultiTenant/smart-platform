import fs from 'fs';
import path from 'path';

import {
  buildCallbackUrl,
  buildCallbackUrlAt,
  isAllowedCallbackUrl,
  isAllowedCallbackUrlAt,
  isAllowedGatewayHostname,
  isAllowedGatewayUrl,
  originsFrom,
  PAYMENT_GATEWAY_HOSTS,
  platformOrigins,
} from '@/lib/payments/allowlist';

/**
 * P4.24 — server-side host allow-lists.
 *
 * This is security code on the redirect path, so the spec is written as an
 * attack list rather than a happy path: every case below is either a real bypass
 * attempt or a value that has historically confused naive URL matching
 * (`endsWith`, `includes`, `indexOf`).
 *
 * The configuration-dependent helpers are exercised through their explicit-
 * argument twins (`originsFrom`, `isAllowedCallbackUrlAt`, `buildCallbackUrlAt`)
 * so every APP_URL edge case is reachable without reloading the module graph.
 */

const readRepoFile = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

const APP_ORIGIN = process.env.APP_URL as string;

describe('Lib - payments/allowlist (P4.24)', () => {
  describe('gateway host rules', () => {
    it.each([
      ['moyasar.com', true],
      ['api.moyasar.com', true],
      ['cdn.moyasar.com', true],
      ['MOYASAR.COM', true],
      ['paymob.com', true],
      ['accept.paymob.com', true],
      ['tabby.ai', true],
      ['api.tabby.ai', true],
      ['tamara.co', true],
      ['oppwa.com', true],
      ['hyperpay.com', true],
      // Trailing-dot FQDN form. Resolves to the same host, so it must not be a
      // way to slip past an equality check.
      ['moyasar.com.', true],
    ])('allows %s', (hostname, expected) => {
      expect(isAllowedGatewayHostname(hostname)).toBe(expected);
    });

    it.each([
      // The classic suffix attack: a host that merely CONTAINS the domain.
      ['evil-moyasar.com', false],
      ['moyasar.com.evil.tld', false],
      ['notmoyasar.com', false],
      ['moyasar.com.attacker.io', false],
      ['x.moyasar.com.evil.tld', false],
      // Leading-dot form of the suffix itself is not a hostname.
      ['.moyasar.com', false],
      // Unrelated hosts.
      ['evil.tld', false],
      ['localhost', false],
      ['127.0.0.1', false],
      ['', false],
      // A gateway family we deliberately do not support.
      ['paypal.com', false],
    ])('rejects %s', (hostname, expected) => {
      expect(isAllowedGatewayHostname(hostname)).toBe(expected);
    });
  });

  describe('gateway URL rules', () => {
    it.each([
      'https://moyasar.com/pay/abc',
      'https://api.moyasar.com/v1/payments/xyz',
      'https://api.tabby.ai/checkout/session',
      'https://checkout.tamara.co/order',
      'https://accept.paymob.com/standalone',
      'https://eu.oppwa.com/v1/paymentWidgets',
      'https://hyperpay.com/pay',
      // Explicitly default port.
      'https://moyasar.com:443/pay',
      // Query strings and fragments are not part of the host decision.
      'https://moyasar.com/pay?amount=1#frag',
    ])('allows %s', (value) => {
      expect(isAllowedGatewayUrl(value)).toBe(true);
    });

    it.each([
      // Protocol downgrade — the payment page would travel in clear text.
      ['http://moyasar.com/pay', 'insecure scheme'],
      // Non-https schemes that `new URL` parses happily.
      ['javascript:alert(1)', 'javascript scheme'],
      ['data:text/html,<script>alert(1)</script>', 'data scheme'],
      ['ftp://moyasar.com/x', 'ftp scheme'],
      // Look-alike hosts.
      ['https://evil-moyasar.com/pay', 'suffix look-alike'],
      ['https://moyasar.com.evil.tld/pay', 'prefix look-alike'],
      // Non-default port: a service the gateway does not run on 443.
      ['https://moyasar.com:8443/pay', 'non-default port'],
      // Unparseable / wrong type.
      ['not a url', 'unparseable'],
      ['', 'empty'],
      ['//moyasar.com/pay', 'protocol-relative'],
    ])('rejects %s (%s)', (value) => {
      expect(isAllowedGatewayUrl(value)).toBe(false);
    });

    it('rejects a URL carrying userinfo', () => {
      // Both directions of the userinfo trick. `URL.hostname` already resolves
      // the REAL host, so the first would also fail the domain check — the
      // rejection is asserted anyway because the rule is "no credentialed
      // redirect target", not "the parsed host happened to be wrong".
      expect(isAllowedGatewayUrl('https://moyasar.com@evil.tld/pay')).toBe(
        false
      );
      expect(isAllowedGatewayUrl('https://evil.tld@moyasar.com/pay')).toBe(
        false
      );
      expect(isAllowedGatewayUrl('https://user:pass@moyasar.com/pay')).toBe(
        false
      );
    });

    it.each([null, undefined, 42, {}, [], true])(
      'rejects the non-string value %p',
      (value) => {
        expect(isAllowedGatewayUrl(value)).toBe(false);
      }
    );
  });

  describe('the gateway list agrees with the two surfaces that already had one', () => {
    // The point of this block: three places encode the same six domains, and a
    // change to one used to be silently inconsistent with the others. Reading
    // the other two files here makes that a failing test instead.
    const clientSource = readRepoFile('components/erp/PaymentActivation.tsx');
    const middlewareSource = readRepoFile('middleware.ts');

    it('matches the component list verbatim', () => {
      const block = clientSource.match(
        /PAYMENT_GATEWAY_HOSTS\s*=\s*\[([^\]]*)\]/
      );

      expect(block).not.toBeNull();

      const clientHosts = (block as RegExpMatchArray)[1]
        .split(',')
        .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
        .sort();

      expect(clientHosts).toEqual([...PAYMENT_GATEWAY_HOSTS].sort());
    });

    it.each([...PAYMENT_GATEWAY_HOSTS])(
      'is present in the CSP gateway families as *.%s',
      (host) => {
        expect(middlewareSource).toContain(`*.${host}`);
      }
    );
  });

  describe('originsFrom (APP_URL parsing)', () => {
    it('derives the origin and discards any path', () => {
      expect(originsFrom('https://app.smartapro.com/some/path')).toEqual([
        'https://app.smartapro.com',
      ]);
    });

    it('keeps a non-default port, because that is part of the origin', () => {
      expect(originsFrom('http://localhost:4002')).toEqual([
        'http://localhost:4002',
      ]);
    });

    it('accepts http for local development', () => {
      expect(originsFrom('http://localhost:4002')).toEqual([
        'http://localhost:4002',
      ]);
    });

    it.each([
      [undefined, 'unset'],
      ['', 'empty string'],
      // `lib/env.ts` stringifies a missing var, so an unset APP_URL reaches us
      // as the STRING 'undefined' — which `new URL` parses as a relative path
      // and would otherwise become a bogus allow-list entry.
      ['undefined', 'the literal string "undefined"'],
      [null, 'null'],
      [42, 'a number'],
      ['not a url', 'unparseable'],
      ['javascript:alert(1)', 'a non-http(s) scheme'],
      ['ftp://app.smartapro.com', 'ftp'],
    ])(
      'returns NOTHING for %p (%s), so callers fail closed',
      (value, label) => {
        expect({ label, origins: originsFrom(value) }).toEqual({
          label,
          origins: [],
        });
      }
    );
  });

  describe('platformOrigins', () => {
    it('uses the ambient APP_URL', () => {
      expect(platformOrigins()).toEqual([APP_ORIGIN]);
    });
  });

  describe('callback URL validation', () => {
    it('accepts a callback on an allowed origin', () => {
      expect(
        isAllowedCallbackUrlAt(
          ['https://app.smartapro.com'],
          'https://app.smartapro.com/payment/success?order=x'
        )
      ).toBe(true);
    });

    it.each([
      ['https://evil.tld/payment/success', 'foreign origin'],
      ['https://app.smartapro.com.evil.tld/payment/success', 'look-alike'],
      ['javascript:alert(1)', 'javascript scheme'],
      ['/payment/success', 'relative URL — no origin to allow-list'],
      ['', 'empty'],
    ])('rejects %s (%s)', (value) => {
      expect(isAllowedCallbackUrlAt(['https://app.smartapro.com'], value)).toBe(
        false
      );
    });

    it('rejects EVERYTHING when no origin is configured', () => {
      expect(
        isAllowedCallbackUrlAt([], 'https://app.smartapro.com/payment/success')
      ).toBe(false);
    });

    it.each([null, undefined, 42, {}])('rejects the non-string %p', (value) => {
      expect(isAllowedCallbackUrlAt(['https://app.smartapro.com'], value)).toBe(
        false
      );
    });

    it('accepts a callback on the ambient origin', () => {
      expect(
        isAllowedCallbackUrl(`${APP_ORIGIN}/payment/success?order=x`)
      ).toBe(true);
    });

    it('rejects a foreign origin on the ambient config', () => {
      expect(isAllowedCallbackUrl('https://evil.tld/payment/success')).toBe(
        false
      );
    });
  });

  describe('callback URL construction', () => {
    it('always uses the SERVER reference, never the caller-supplied one', () => {
      const built = buildCallbackUrlAt(
        APP_ORIGIN,
        `${APP_ORIGIN}/payment/success?order=attacker-chosen-reference`,
        'ord_server_minted'
      );

      expect(built).toBe(
        `${APP_ORIGIN}/payment/success?order=ord_server_minted`
      );
    });

    it('preserves the locale prefix so the customer returns to their language', () => {
      const built = buildCallbackUrlAt(
        APP_ORIGIN,
        `${APP_ORIGIN}/en/payment/success?order=whatever`,
        'ord_server_minted'
      );

      expect(built).toBe(
        `${APP_ORIGIN}/en/payment/success?order=ord_server_minted`
      );
    });

    it('defaults to the bare success path when no callback was supplied', () => {
      expect(buildCallbackUrlAt(APP_ORIGIN, undefined, 'ord_x')).toBe(
        `${APP_ORIGIN}/payment/success?order=ord_x`
      );
    });

    it.each([
      ['/payment/failed', 'a different page'],
      ['/payment/success/../evil', 'a traversing path'],
      ['/x/payment/success', 'a prefixed path'],
      ['/payment/success/extra', 'a suffixed path'],
      ['/payment/successful', 'a near-miss path'],
    ])('falls back to the default path for %s (%s)', (pathname) => {
      const built = buildCallbackUrlAt(
        APP_ORIGIN,
        `${APP_ORIGIN}${pathname}?order=whatever`,
        'ord_x'
      );

      expect(built).toBe(`${APP_ORIGIN}/payment/success?order=ord_x`);
    });

    it('never carries the foreign host of a rejected callback', () => {
      // The caller rejects this before construction, but the function is
      // asserted to be safe on its own: it takes the PATH from the caller and
      // the origin from configuration, so even a bypass of the caller's check
      // cannot produce a redirect to a third-party host.
      const built = buildCallbackUrlAt(
        APP_ORIGIN,
        'https://evil.tld/en/payment/success?order=x',
        'ord_x'
      );

      expect(built).toBe(`${APP_ORIGIN}/en/payment/success?order=ord_x`);
      expect(built).not.toContain('evil.tld');
    });

    it('URL-encodes a reference rather than allowing query injection', () => {
      const built = buildCallbackUrlAt(
        APP_ORIGIN,
        undefined,
        'ord_a&admin=true'
      );

      expect(built).toBe(
        `${APP_ORIGIN}/payment/success?order=ord_a%26admin%3Dtrue`
      );
    });

    it.each([null, undefined, ''])(
      'returns null for the unusable origin %p, so the route fails closed',
      (origin) => {
        expect(buildCallbackUrlAt(origin, undefined, 'ord_x')).toBeNull();
      }
    );

    it('binds to the ambient origin for the unsuffixed export', () => {
      expect(buildCallbackUrl(undefined, 'ord_x')).toBe(
        `${APP_ORIGIN}/payment/success?order=ord_x`
      );
    });
  });
});
