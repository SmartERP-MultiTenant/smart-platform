/**
 * Login-redirect helpers for the anonymous → `/auth/login` flow.
 *
 * Why this module exists: `middleware.ts` used to build that redirect from
 * `req.url`, which Next derives from the server's own address
 * (`localhost:4002`) plus the forwarded protocol. Behind the production
 * reverse proxy that produced
 * `Location: /auth/login?callbackUrl=https%3A%2F%2Flocalhost%3A4002%2Fadmin`,
 * so a signed-in user was bounced to a dead URL. The redirect must be built
 * from the configured **public** origin, and the callback target must stay a
 * **relative** path — the same convention `pages/admin*.tsx` already uses with
 * `context.resolvedUrl`.
 *
 * `resolvePostLoginRedirect` is the counterpart used by the login page: it
 * accepts only same-origin targets (relative paths, or absolute URLs whose
 * origin matches), so a crafted `?callbackUrl=` cannot turn the login form
 * into an open redirect.
 */

// Control characters and backslashes are rejected outright: browsers normalize
// `\` to `/` (so `/\evil.example.com` would escape the origin) and control
// characters can hide a scheme.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\]/;

/**
 * True for a syntactically valid absolute `http(s)` URL. Note that
 * `lib/env.ts` interpolates missing vars into the string `"undefined"`, which
 * is correctly rejected here.
 */
export const isAbsoluteHttpUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Builds the `/auth/login` redirect with `callbackUrl` set to the requested
 * path (relative, single-encoded by `searchParams`).
 *
 * Callers must pass an absolute base (guard with `isAbsoluteHttpUrl`); a
 * non-absolute base throws, which is intentional — silently falling back to a
 * relative redirect is what we are fixing here.
 */
export const buildLoginRedirect = (
  baseUrl: string,
  pathnameAndSearch: string
): URL => {
  const url = new URL('/auth/login', baseUrl);
  url.searchParams.set('callbackUrl', pathnameAndSearch);
  return url;
};

/**
 * Resolves where the login form should send the user after a successful
 * sign-in, accepting only same-origin targets:
 *
 * - a relative path (`/admin/users`, query preserved) is accepted;
 * - an absolute URL is accepted only when its origin equals `origin`, and is
 *   reduced to its path + query;
 * - anything else (protocol-relative, cross-origin, `javascript:`, control
 *   characters, arrays, empty) falls back to `fallback`.
 */
export const resolvePostLoginRedirect = (
  raw: string | string[] | undefined | null,
  fallback: string,
  origin?: string
): string => {
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== 'string') {
    return fallback;
  }

  const candidate = value.trim();

  if (candidate.length === 0 || UNSAFE_CHARS.test(candidate)) {
    return fallback;
  }

  // `//evil.example.com` is a protocol-relative URL, not a same-origin path.
  if (candidate.startsWith('//')) {
    return fallback;
  }

  if (candidate.startsWith('/')) {
    return candidate;
  }

  if (!origin || !isAbsoluteHttpUrl(candidate)) {
    return fallback;
  }

  const url = new URL(candidate);

  if (url.origin !== origin) {
    return fallback;
  }

  return `${url.pathname}${url.search}`;
};
