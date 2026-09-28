/**
 * Minimal shape needed to resolve an ERP client login target. Both the
 * registration result and the `sessionStorage.erpLogin` payload (payment
 * success path) satisfy it.
 */
export interface ErpRedirectSource {
  redirectTo?: string | null;
  subdomain?: string | null;
}

export interface ErpLoginHandoffOpts {
  isLocalhost: boolean;
  clientUrl: string;
  loginPath: string;
  baseDomain: string;
}

/**
 * Resolves the clean ERP client login target URL (without leaking tokens in query strings).
 *
 * Built through `URL`, never by concatenating `loginPath` onto the base: the
 * base is `redirectTo`, which is only typed as a string (`lib/erp.ts`) and is
 * validated by nothing — no zod on the register response. A base that already
 * carries a query (`https://acme.smartapro.com?tenant=acme`) turned
 * `${base}${loginPath}` into `…?tenant=acme/auth/login`: the login route was
 * swallowed into the last parameter's VALUE, so the produced URL was not a
 * login page at all. Both handoff surfaces (funnel navigate/copy, payment
 * success CTA) derive from this helper, so both were affected.
 *
 * The login route now lands in the PATHNAME, and whatever query/hash the base
 * carried survives as a real query/hash.
 */
export function getErpLoginTargetUrl(
  source: ErpRedirectSource,
  opts: ErpLoginHandoffOpts
): string {
  if (opts.isLocalhost) {
    return `${opts.clientUrl}${opts.loginPath}`;
  }

  const base = (
    source.redirectTo || `https://${source.subdomain}.${opts.baseDomain}`
  ).replace(/^http:\/\//i, 'https://');

  let url: URL;

  try {
    url = new URL(base);
  } catch {
    // A non-absolute `redirectTo` (`/some/path`, a bare host) is not a
    // navigable target: `isAllowedRedirectUrl` rejects it in both callers. It
    // is treated exactly like a missing `redirectTo` — the tenant's own
    // subdomain — so the helper never throws and never returns a non-URL
    // string that a caller could only reject.
    url = new URL(`https://${source.subdomain}.${opts.baseDomain}`);
  }

  // Resolved against the parsed base, so a `loginPath` that itself carries a
  // query (`/auth/login?tenant=acme`) yields its path as the pathname and its
  // params as params. A path inside `redirectTo` (`https://host/some/path`) is
  // REPLACED, never appended to: `…/some/path/auth/login` is a 404, whereas the
  // configured login route is the only path this handoff may target.
  const login = new URL(opts.loginPath, url);

  url.pathname = login.pathname;
  // Appended, not assigned: the base's own query is preserved either way
  // (WHATWG relative resolution does not inherit it), and a loginPath query is
  // added to it rather than silently dropping it.
  login.searchParams.forEach((value, key) =>
    url.searchParams.append(key, value)
  );

  return url.toString();
}

/**
 * Query parameters of the browser-facing handoff URL.
 *
 * Both are prefill/redeem HINTS and both are optional and independent:
 *  - `handoff` is the ERP registration's single-use code (TTL 120s). The SPA
 *    strips it from the URL and redeems it for a session; redeeming it more
 *    than once fails, so it must never be persisted or copied into a link.
 *  - `userName` is a login-form prefill only.
 *
 * Nothing else may ever travel in this query string — in particular no
 * `authToken`/`expiresIn`: a URL is logged by every proxy on the way, kept in
 * browser history, and sent in the `Referer` header.
 */
export interface ErpHandoffQueryParams {
  handoff?: string;
  userName?: string;
}

export interface ErpHandoffUrlOpts
  extends ErpLoginHandoffOpts, ErpHandoffQueryParams {}

/**
 * Builds the browser-facing handoff URL: a plain GET to the ERP client login
 * route, carrying the optional `handoff` code and the optional `userName`
 * prefill hint.
 *
 * Deliberately built ON TOP of `getErpLoginTargetUrl`, so the localhost branch
 * and the `redirectTo`/subdomain base resolution exist once for both functions
 * and cannot drift. `getErpLoginTargetUrl` also remains the no-code fallback:
 * with neither parameter set this returns exactly the plain login URL.
 *
 * This replaced a hidden-POST form handoff (`submitErpPostHandoff`) that POSTed
 * the ERP `authToken` to the ERP client login route. The tenant origin is static
 * nginx, so that POST answered 405 Not Allowed in every environment, and the SPA
 * cannot read a POST body either. A GET with a short-lived, single-use code is
 * something both ends can actually do — and it is why `handoff` is the ONLY
 * credential-shaped value this function accepts: it is redeemable once, for
 * 120s, against the ERP, whereas the access token it replaced was a live bearer
 * credential for the whole session.
 *
 * The query is appended with `URL`/`URLSearchParams`, never with a literal `?`:
 * the target is host-allowlisted but not query-stripped, so a base that already
 * carries a query string would otherwise swallow both handoff params into the
 * last existing value (`/auth/login?tenant=acme?handoff=…`).
 */
export function buildErpHandoffUrl(
  source: ErpRedirectSource,
  opts: ErpHandoffUrlOpts
): string {
  const params = new URLSearchParams();

  if (opts.handoff) {
    params.set('handoff', opts.handoff);
  }

  if (opts.userName) {
    params.set('userName', opts.userName);
  }

  const target = getErpLoginTargetUrl(source, opts);

  if (!params.toString()) {
    return target;
  }

  const url = new URL(target);

  params.forEach((value, key) => url.searchParams.append(key, value));

  return url.toString();
}

/**
 * Host allowlist for the ERP client handoff target. Accepts localhost (dev),
 * the configured ERP client host, and the base domain with any subdomain.
 * Any other host — or a non-absolute URL — is rejected so a tainted
 * `redirectTo`/`subdomain` can never redirect the handoff off-platform.
 */
export function isAllowedRedirectUrl(
  url: string,
  opts: { erpClientUrl: string; erpBaseDomain: string }
): boolean {
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }

  try {
    const u = new URL(url);

    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      return true;
    }

    if (opts.erpClientUrl) {
      const clientHost = new URL(opts.erpClientUrl).hostname;
      if (u.hostname === clientHost) {
        return true;
      }
    }

    return (
      u.hostname === opts.erpBaseDomain ||
      u.hostname.endsWith(`.${opts.erpBaseDomain}`)
    );
  } catch {
    return false;
  }
}
