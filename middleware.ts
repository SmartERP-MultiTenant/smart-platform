import micromatch from 'micromatch';
import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import env from './lib/env';

// Constants for security headers
const SECURITY_HEADERS = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=()',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site',
} as const;

// Per-request CSP nonce (P2.13 tightening pass).
//
// Middleware runs on the Edge runtime, so this uses Web Crypto (the Node
// `crypto` module is unavailable). The value travels to the renderer through
// the `x-nonce` request header and the CSP request header; `pages/_document.tsx`
// reads it and forwards it to `Head`/`NextScript`.
const NONCE_HEADER = 'x-nonce';

const generateNonce = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

// `upgrade-insecure-requests` is only emitted on https origins.
//
// The directive rewrites http sub-resource requests to https. On a plain-http
// origin that rewrite is destructive: the browser retargets same-origin
// requests — including form POSTs such as the team-create form — to https
// against a server that only speaks http, so every call fails with
// `net::ERR_SSL_PROTOCOL_ERROR` / `TypeError: Failed to fetch`. Local dev, e2e
// and CI serve http; production sits behind Cloudflare/nginx and reports https
// through `x-forwarded-proto`.
const isHttpsRequest = (req: NextRequest): boolean =>
  req.nextUrl.protocol === 'https:' ||
  (req.headers.get('x-forwarded-proto') ?? '').split(',')[0].trim() === 'https';

// `form-action` must allow the ERP client origin.
//
// The token handoff (`lib/erp/handoff.ts` `submitErpPostHandoff()`) is a
// cross-origin hidden-POST form pointing at the ERP client login URL, and a
// form-submission navigation is governed by `form-action` — not by
// `connect-src`/`frame-src`. Without these sources the browser silently blocks
// the handoff and the customer never reaches the ERP client.
//
// Sources are derived from configuration instead of hardcoded, so dev/e2e
// (`ERP_CLIENT_URL=http://localhost:4200`) and production (tenant subdomains
// under `ERP_BASE_DOMAIN`) both work. Absent values are skipped — `env.erp`
// stringifies a missing var as the literal "undefined", which would otherwise
// emit a bogus source.
const erpFormActionSources = (): string[] => {
  const sources = new Set<string>();

  const clientUrl = env.erp.clientUrl;
  if (clientUrl && clientUrl !== 'undefined') {
    try {
      sources.add(new URL(clientUrl).origin);
    } catch {
      // Relative or malformed value — skip rather than emit a broken source.
    }
  }

  const baseDomain = env.erp.baseDomain;
  if (baseDomain && baseDomain !== 'undefined') {
    // Apex + tenant subdomains (`https://<tenant>.<ERP_BASE_DOMAIN>`).
    sources.add(`https://${baseDomain}`);
    sources.add(`https://*.${baseDomain}`);
  }

  return Array.from(sources);
};

// Generate CSP.
//
// `script-src` carries no `'unsafe-inline'`/`'unsafe-eval'` any more: verified
// against the production build, the pages router emits no inline executable
// script — the only src-less <script> is `__NEXT_DATA__` with
// type="application/json" (not subject to script-src) plus the JSON-LD block in
// `components/shared/SEO.tsx` (type="application/ld+json"). The nonce is still
// attached so anything Next inlines (dev overlay, future versions) is
// authorized. `style-src` keeps `'unsafe-inline'` because JSX `style={{ … }}`
// props are used across the UI; the CSP3 `style-src-attr` split is a separate
// follow-up (P2.13 decision D2).
const generateCSP = (
  nonce?: string,
  upgradeInsecureRequests = false
): string => {
  const scriptSrc = ["'self'"];

  if (nonce) {
    scriptSrc.push(`'nonce-${nonce}'`);
  }

  const policies = {
    'default-src': ["'self'"],
    'img-src': [
      "'self'",
      'boxyhq.com',
      '*.boxyhq.com',
      '*.dicebear.com',
      'data:',
      '*.moyasar.com',
      '*.tabby.ai',
      '*.tamara.co',
      '*.paymob.com',
      '*.oppwa.com',
      '*.hyperpay.com',
    ],
    'script-src': [
      ...scriptSrc,
      '*.gstatic.com',
      '*.google.com',
      '*.moyasar.com',
      '*.tabby.ai',
      '*.tamara.co',
      '*.paymob.com',
      '*.oppwa.com',
      '*.hyperpay.com',
    ],
    'style-src': [
      "'self'",
      "'unsafe-inline'",
      '*.moyasar.com',
      '*.tabby.ai',
      '*.tamara.co',
      '*.paymob.com',
      '*.oppwa.com',
      '*.hyperpay.com',
    ],
    'connect-src': [
      "'self'",
      '*.google.com',
      '*.gstatic.com',
      'boxyhq.com',
      '*.ingest.sentry.io',
      '*.mixpanel.com',
      '*.moyasar.com',
      '*.tabby.ai',
      '*.tamara.co',
      '*.paymob.com',
      '*.oppwa.com',
      '*.hyperpay.com',
    ],
    'frame-src': [
      "'self'",
      '*.google.com',
      '*.gstatic.com',
      '*.moyasar.com',
      '*.tabby.ai',
      '*.tamara.co',
      '*.paymob.com',
      '*.oppwa.com',
      '*.hyperpay.com',
    ],
    'font-src': ["'self'", '*.moyasar.com'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': [
      "'self'",
      ...erpFormActionSources(),
      '*.moyasar.com',
      '*.tabby.ai',
      '*.tamara.co',
      '*.paymob.com',
      '*.oppwa.com',
      '*.hyperpay.com',
    ],
    'frame-ancestors': ["'none'"],
  };

  const directives = Object.entries(policies).map(
    ([key, values]) => `${key} ${values.join(' ')}`
  );

  // https-only — see isHttpsRequest().
  if (upgradeInsecureRequests) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
};

// Add routes that don't require authentication
const unAuthenticatedRoutes = [
  '/api/health',
  '/api/auth/**',
  '/api/oauth/**',
  '/api/scim/v2.0/**',
  '/api/invitations/*',
  '/api/webhooks/stripe',
  '/api/webhooks/dsync',
  '/auth/**',
  '/invitations/*',
  '/terms-condition',
  '/design-system',
  '/unlock-account',
  '/login/saml',
  '/.well-known/*',
  // Public marketing-site static assets (served from /public)
  '/logo/*',
  '/landing/*',
  '/logo.*',
  '/home-hero.*',
  '/favicon.*',
  '/site.webmanifest',
  '/apple-touch-icon.*',
  '/android-chrome-*',
  // Crawler-facing files. The matcher below does not exclude .txt/.xml/.png,
  // so without these entries /robots.txt, /sitemap.xml and /og-image.png are
  // redirected to /auth/login — crawlers can never read them and every social
  // share preview (og:image) breaks.
  '/robots.txt',
  '/sitemap.xml',
  '/og-image.*',
  // SMART PLATFORM SaaS public funnel
  '/',
  '/pricing',
  '/register',
  '/terms',
  '/privacy',
  '/payment/success',
  '/payment/failed',
  '/api/public/erp/**',
];

// P5.2: platform-admin routes. These are NEVER added to
// `unAuthenticatedRoutes` — they require authentication AND the platform-admin
// role (defense in depth on top of `requirePlatformAdmin`, which stays the
// authoritative API-level guard).
const platformAdminRoutes = [
  '/admin',
  '/admin/**',
  '/api/admin',
  '/api/admin/**',
];

const isAdminRoute = (pathname: string) =>
  micromatch.isMatch(pathname, platformAdminRoutes);

// Apply the same security headers to denied responses.
const withSecurityHeaders = (response: NextResponse) => {
  response.headers.set('Content-Security-Policy', generateCSP());

  if (env.securityHeadersEnabled) {
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  return response;
};

// Pass-through response builder that mints a fresh CSP nonce.
//
// `includeSecurityHeaders` mirrors the pre-existing split: authenticated
// responses get the full SECURITY_HEADERS set when `env.securityHeadersEnabled`,
// while public funnel routes receive the CSP only — they previously received no
// CSP at all, and adding COEP `require-corp` to pages that may embed
// third-party payment iframes is a separate decision owned by P4.24.
const nextWithCsp = (req: NextRequest, includeSecurityHeaders: boolean) => {
  const nonce = generateNonce();
  const csp = generateCSP(nonce, isHttpsRequest(req));

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set('Content-Security-Policy', csp);

  if (includeSecurityHeaders && env.securityHeadersEnabled) {
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  return response;
};

const denyJson = (status: 401 | 403, message: string) =>
  withSecurityHeaders(
    new NextResponse(JSON.stringify({ error: message }), {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  );

const denyPage = (status: 403, message: string) =>
  withSecurityHeaders(
    new NextResponse(message, {
      status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  );

// Anonymous request: ALL APIs get a JSON 401 (never an HTML login page);
// non-API pages keep the existing login-redirect convention.
const denyUnauthenticated = (apiRoute: boolean, redirectUrl: URL) =>
  apiRoute ? denyJson(401, 'Unauthorized') : NextResponse.redirect(redirectUrl);

// Authenticated but not a platform admin.
const denyNonAdmin = (apiRoute: boolean) =>
  apiRoute ? denyJson(403, 'Forbidden') : denyPage(403, 'Forbidden');

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Locale negotiation (cookie-first). In Next.js 15 the non-default locale
  // prefix is normalized away BEFORE middleware: a request to /en/pricing
  // arrives here as pathname "/pricing" with nextUrl.locale "en", while
  // unprefixed (and /ar-prefixed) paths arrive with locale "ar". Core only
  // negotiates the root path itself, so handle the rest here for page
  // routes: an explicit NEXT_LOCALE=en cookie or an English browser gets
  // the /en-prefixed path; an explicit Arabic cookie (or Arabic browser)
  // stays unprefixed. API routes and static assets never redirect.
  const isApiOrAsset =
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    /\.\w+$/.test(pathname);

  // Defensive: never re-prefix a path that already carries an explicit
  // locale segment, regardless of how the runtime normalizes pathnames
  // (guards against /ar/pricing → /en/ar/pricing double-prefixing).
  const isLocalePrefixed = /^\/(?:ar|en)(?=\/|$)/.test(pathname);

  if (req.nextUrl.locale !== 'en' && !isApiOrAsset && !isLocalePrefixed) {
    const cookieLocale = req.cookies.get('NEXT_LOCALE')?.value;

    let redirectToEn = false;

    if (cookieLocale === 'en') {
      redirectToEn = true;
    } else if (!cookieLocale) {
      // No explicit choice: fall back to the browser's preferred language.
      const firstTag = req.headers.get('accept-language')?.split(',')[0];
      const language = firstTag?.split(';')[0]?.trim().toLowerCase() ?? '';
      redirectToEn = language.startsWith('en');
    }
    // cookieLocale === 'ar' → explicit Arabic choice, keep unprefixed.

    if (redirectToEn) {
      // Redirecting to /en + the (already-stripped) path is loop-safe: core
      // normalizes it back with nextUrl.locale === 'en', which skips this block.
      const localeUrl = req.nextUrl.clone();
      localeUrl.pathname = '/en' + (pathname === '/' ? '' : pathname);
      return NextResponse.redirect(localeUrl);
    }
  }

  // Strip locale prefix (e.g. /en or /ar) if present so localized public routes are never redirected to login
  const pathnameWithoutLocale =
    pathname.replace(/^\/(?:ar|en)(?=\/|$)/, '') || '/';

  // Legacy path redirect: /terms-condition -> /terms
  if (pathnameWithoutLocale === '/terms-condition') {
    const termsUrl = req.nextUrl.clone();
    termsUrl.pathname = (req.nextUrl.locale === 'en' ? '/en' : '') + '/terms';
    return NextResponse.redirect(termsUrl);
  }

  // Bypass routes that don't require authentication
  if (
    micromatch.isMatch(pathname, unAuthenticatedRoutes) ||
    micromatch.isMatch(pathnameWithoutLocale, unAuthenticatedRoutes)
  ) {
    // P2.13: the public funnel (/, /pricing, /register, /payment/*) is exactly
    // what the policy exists to protect, so it now gets the CSP + a fresh nonce
    // instead of no header at all.
    return nextWithCsp(req, false);
  }

  const redirectUrl = new URL('/auth/login', req.url);
  redirectUrl.searchParams.set('callbackUrl', encodeURI(req.url));

  // Admin/API classification uses the locale-stripped path: Next.js i18n
  // prefixes non-default locales (/en/admin), and isAdminRoute('/en/admin')
  // would otherwise bypass the platform-admin gate.
  const adminRoute = isAdminRoute(pathnameWithoutLocale);
  const apiRoute = pathnameWithoutLocale.startsWith('/api/');

  // JWT strategy
  if (env.nextAuth.sessionStrategy === 'jwt') {
    const token = await getToken({
      req,
    });

    if (!token) {
      return denyUnauthenticated(apiRoute, redirectUrl);
    }

    // P5.2: platform-admin gate (advisory token claim; the API-level guard
    // re-checks the database).
    if (adminRoute && token.isPlatformAdmin !== true) {
      return denyNonAdmin(apiRoute);
    }
  }

  // Database strategy
  else if (env.nextAuth.sessionStrategy === 'database') {
    const url = new URL('/api/auth/session', req.url);

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        cookie: req.headers.get('cookie') || '',
      },
    });

    const session = await response.json();

    if (!session.user) {
      return denyUnauthenticated(apiRoute, redirectUrl);
    }

    // P5.2: platform-admin gate (the session callback resolves the flag
    // fresh from the database for database sessions).
    if (adminRoute && session.user?.isPlatformAdmin !== true) {
      return denyNonAdmin(apiRoute);
    }
  }

  // All good, let the request through — CSP carries a fresh nonce.
  return nextWithCsp(req, true);
}

export const config = {
  // '/' is listed explicitly: the generic pattern does not match the bare
  // root path, and core only negotiates the root via cookie/exact-tag
  // Accept-Language — running middleware there keeps locale negotiation
  // uniform (including single-tag 'en-US' headers).
  matcher: [
    '/',
    '/((?!_next/static|_next/image|favicon.ico|api/auth/session).*)',
  ],
};
