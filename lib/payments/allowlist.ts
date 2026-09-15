import env from '@/lib/env';

/**
 * Server-side host allow-lists for the public payment path (P4.24).
 *
 * ## Why this module exists
 *
 * The funnel's payment step touches two URLs, and until now BOTH were trusted
 * from the wrong side of the boundary:
 *
 *  1. **`callbackUrl`** — the browser sends it and the BFF forwarded it to the
 *     ERP verbatim. The ERP interpolates it into the gateway request, so a
 *     crafted value redirects a paying customer to an arbitrary host *after*
 *     they hand over card details, on a page that looks like ours.
 *  2. **`paymentUrl`** — the ERP returns it and the BFF handed it straight to the
 *     browser as a redirect target. The ONLY check lived in the component
 *     (`PaymentActivation.tsx` `isAllowedPaymentUrl`), i.e. in code the customer
 *     runs on their own machine, which is not a trust boundary. Any other
 *     consumer of the route, and any future refactor, was unprotected.
 *
 * Both are now validated server-side, before the value crosses the boundary in
 * either direction. The client-side check stays as defence in depth.
 *
 * ## One source of truth per list, and why they are not the same list
 *
 * - The **gateway** list is shared with two existing surfaces and must stay
 *   consistent with BOTH: the client's `PAYMENT_GATEWAY_HOSTS`
 *   (`components/erp/PaymentActivation.tsx`) and the CSP gateway families in
 *   `middleware.ts` (`img-src`/`script-src`/`style-src`/`connect-src`/
 *   `frame-src`/`form-action`). All three agree today — same six registrable
 *   domains — and `__tests__/lib/payments/allowlist.spec.ts` asserts that
 *   agreement by reading the other two files, so a future edit to one without
 *   the others fails a test instead of silently diverging.
 * - The **callback** list is a different question: it is *our own* origin, not a
 *   gateway. It is derived from configuration (`APP_URL`) rather than hardcoded,
 *   so dev, e2e and production each validate against their own deployment.
 *
 * ## Why the config-dependent helpers have an explicit-argument twin
 *
 * `lib/env.ts` reads `process.env` once at module load, so a test cannot change
 * a deployed origin by mutating `process.env` afterwards — and reloading the
 * module graph to fake it is both slower and a worse test. The `*At` exports
 * take the configuration as a parameter and hold all the logic; the unsuffixed
 * exports bind them to `lib/env.ts`. That keeps the configuration boundary
 * visible instead of hidden behind a module-level read.
 */

/**
 * Registrable domains permitted as the redirect target after a payment.
 *
 * Matching is `host === suffix || host.endsWith('.' + suffix)`, i.e. the domain
 * itself or any subdomain of it. That formulation is what rejects the
 * look-alikes: `evil-moyasar.com` does NOT end with `.moyasar.com`, and
 * `moyasar.com.evil.tld` does not either.
 */
export const PAYMENT_GATEWAY_HOSTS: readonly string[] = Object.freeze([
  'moyasar.com',
  'paymob.com',
  'tabby.ai',
  'tamara.co',
  'oppwa.com',
  'hyperpay.com',
]);

/** Parses one configured URL down to its origin, or `null` when unusable. */
const normalizeOrigin = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value) return null;

  // `lib/env.ts` stringifies an unset var, so a missing APP_URL arrives as the
  // LITERAL string 'undefined' — which `new URL` parses as a relative path and
  // would otherwise become a bogus allow-list entry.
  if (value === 'undefined') return null;

  try {
    const url = new URL(value);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    return url.origin;
  } catch {
    return null;
  }
};

/**
 * The origins a payment callback is allowed to return to, from a raw APP_URL.
 *
 * Returns an EMPTY array for anything unusable. Callers must treat that as "no
 * callback is permitted" and fail closed; an empty list is never "allow all".
 */
export const originsFrom = (appUrl: unknown): string[] => {
  const origin = normalizeOrigin(appUrl);

  return origin ? [origin] : [];
};

/**
 * The origins a payment callback is allowed to return to.
 *
 * `APP_URL` only. `ERP_CLIENT_URL` is deliberately NOT included even though it
 * is also "our" origin: the callback must land on the platform's own
 * `/payment/success` page, and the ERP SPA is a different application that has
 * no such route. Widening this list would only spread the trust boundary.
 */
export const platformOrigins = (): string[] => originsFrom(env.appUrl);

/**
 * `true` when `hostname` is one of the permitted gateway domains.
 *
 * Exported separately from the URL check so the domain rule can be tested
 * exhaustively on its own (every look-alike case, without needing a scheme).
 */
export function isAllowedGatewayHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');

  // A leading dot is not a hostname. Without this guard the suffix test below
  // would accept the bare suffix form (`.moyasar.com` ends with
  // `.moyasar.com`), i.e. a value that is not a resolvable host at all.
  if (host.startsWith('.')) return false;

  return PAYMENT_GATEWAY_HOSTS.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

/**
 * `true` only for an `https:` URL on a permitted gateway host.
 *
 * Every rejection here is deliberate and separately tested:
 *
 *  - **non-https** (`http:`, `javascript:`, `data:`) — `new URL` parses all of
 *    them, so the scheme must be checked explicitly. A downgrade would put the
 *    payment page on the wire in clear text.
 *  - **userinfo** (`https://moyasar.com@evil.tld/`) — the classic
 *    "host-looking" trick. `URL.hostname` already resolves the real host, so the
 *    domain check would catch the example above; the userinfo rejection also
 *    catches the mirror case, where the REAL host is ours but the visible text
 *    points elsewhere. A payment redirect is never a credentialed URL, so
 *    refusing all of them costs nothing.
 *  - **non-default port** — `https://moyasar.com:8443/` is a redirect to a
 *    service the gateway does not run on 443. No supported gateway uses one, so
 *    the only thing permitting them buys is a wider surface.
 */
export function isAllowedGatewayUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  // `username`/`password` are empty strings (not undefined) when absent.
  if (url.username !== '' || url.password !== '') return false;

  if (url.port !== '' && url.port !== '443') return false;

  if (!url.hostname) return false;

  return isAllowedGatewayHostname(url.hostname);
}

/**
 * `true` when `value` is an http(s) URL on one of `origins`.
 *
 * Used to REJECT an off-allowlist `callbackUrl`, never to silently keep it: the
 * caller answers 400 so the attempt is visible in a log and to whoever sent it,
 * instead of quietly paying with a rewritten destination.
 *
 * An empty `origins` list rejects everything, which is the fail-closed reading
 * of "the platform's own origin is not configured".
 */
export function isAllowedCallbackUrlAt(
  origins: readonly string[],
  value: unknown
): boolean {
  if (typeof value !== 'string' || !value) return false;
  if (origins.length === 0) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    origins.includes(url.origin)
  );
}

/** `isAllowedCallbackUrlAt` bound to the configured platform origins. */
export const isAllowedCallbackUrl = (value: unknown): boolean =>
  isAllowedCallbackUrlAt(platformOrigins(), value);

/**
 * The only shape of path a payment callback may use.
 *
 * `/payment/success`, optionally behind the two-letter locale prefix the router
 * emits for every non-default locale (`/en/payment/success`). Anchored, so a
 * suffixed or traversing path (`/payment/success/../evil`, `/payment/successful`,
 * `/x/payment/success`) cannot match.
 */
const CALLBACK_PATH = /^\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?payment\/success$/;

/**
 * Builds the callback URL handed to the ERP and, through it, to the gateway.
 *
 * ## Why the reference is always replaced and the host never is
 *
 * The returned URL is assembled from three parts with three different rules,
 * which is the whole design:
 *
 *  - **origin** — ours, from configuration. The client's host is never copied;
 *    it was already validated by the caller, and taking it from configuration is
 *    strictly stronger.
 *  - **path** — the client's, but only if it matches `CALLBACK_PATH`; otherwise
 *    the default `/payment/success`. This is what preserves the active locale
 *    (including RTL) across the gateway round trip. It is a same-origin path, so
 *    the client choosing it decides nothing but presentation.
 *  - **`order`** — ALWAYS the server-minted reference (PG-06). This is the
 *    deliberate "rewrite": a client-supplied reference is not authoritative, so
 *    honouring it would reintroduce exactly the defect PG-06 closes. It is not a
 *    silent rewrite — a supplied value is ignored by documented contract, not
 *    quietly accepted.
 *
 * Returns `null` when no origin is configured, so the caller fails closed
 * instead of paying without a callback.
 */
export function buildCallbackUrlAt(
  origin: string | null | undefined,
  clientCallbackUrl: unknown,
  orderReference: string
): string | null {
  if (!origin) return null;

  let path = '/payment/success';

  if (typeof clientCallbackUrl === 'string' && clientCallbackUrl) {
    try {
      const supplied = new URL(clientCallbackUrl);
      if (CALLBACK_PATH.test(supplied.pathname)) {
        path = supplied.pathname;
      }
    } catch {
      // Unparseable — the caller has already rejected it via
      // `isAllowedCallbackUrl`; fall back to the default path.
    }
  }

  const callback = new URL(path, origin);
  callback.searchParams.set('order', orderReference);

  return callback.toString();
}

/** `buildCallbackUrlAt` bound to the configured platform origin. */
export const buildCallbackUrl = (
  clientCallbackUrl: unknown,
  orderReference: string
): string | null =>
  buildCallbackUrlAt(
    platformOrigins()[0] ?? null,
    clientCallbackUrl,
    orderReference
  );
