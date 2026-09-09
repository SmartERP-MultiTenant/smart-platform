import { ErpRegistrationResult } from '@/lib/erp';

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
  result: ErpRegistrationResult,
  opts: ErpLoginHandoffOpts
): string {
  if (opts.isLocalhost) {
    return `${opts.clientUrl}${opts.loginPath}`;
  }

  const base = (
    result.redirectTo || `https://${result.subdomain}.${opts.baseDomain}`
  ).replace(/^http:\/\//i, 'https://');

  return `${base}${opts.loginPath}`;
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
