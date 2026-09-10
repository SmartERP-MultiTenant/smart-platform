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

// Generate CSP
const generateCSP = (): string => {
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
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
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
      '*.moyasar.com',
      '*.tabby.ai',
      '*.tamara.co',
      '*.paymob.com',
      '*.oppwa.com',
      '*.hyperpay.com',
    ],
    'frame-ancestors': ["'none'"],
  };

  return Object.entries(policies)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .concat(['upgrade-insecure-requests'])
    .join('; ');
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
    return NextResponse.next();
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

  const requestHeaders = new Headers(req.headers);
  const csp = generateCSP();

  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (env.securityHeadersEnabled) {
    // Set security headers
    response.headers.set('Content-Security-Policy', csp);
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  // All good, let the request through
  return response;
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
