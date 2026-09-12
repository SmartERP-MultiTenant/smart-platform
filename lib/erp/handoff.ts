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

export interface ErpPostHandoffParams {
  targetUrl: string;
  token?: string;
  expiresIn?: string;
}

/**
 * Resolves the clean ERP client login target URL (without leaking tokens in query strings).
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

  return `${base}${opts.loginPath}`;
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

/**
 * Performs a secure POST token handoff to the ERP client by dynamically
 * constructing and submitting a hidden HTML form.
 * Ensures the auth token is delivered in the POST request body and NEVER
 * appears in browser history, URL bars, or HTTP referer headers.
 */
export function submitErpPostHandoff({
  targetUrl,
  token,
  expiresIn,
}: ErpPostHandoffParams): void {
  if (typeof window === 'undefined') {
    return;
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = targetUrl;
  form.style.display = 'none';

  if (token) {
    const tokenInput = document.createElement('input');
    tokenInput.type = 'hidden';
    tokenInput.name = 'token';
    tokenInput.value = token;
    form.appendChild(tokenInput);
  }

  if (expiresIn) {
    const expiresInput = document.createElement('input');
    expiresInput.type = 'hidden';
    expiresInput.name = 'expiresIn';
    expiresInput.value = expiresIn;
    form.appendChild(expiresInput);
  }

  document.body.appendChild(form);
  form.submit();
}
