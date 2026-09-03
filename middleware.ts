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
    ],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      '*.gstatic.com',
      '*.google.com',
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'connect-src': [
      "'self'",
      '*.google.com',
      '*.gstatic.com',
      'boxyhq.com',
      '*.ingest.sentry.io',
      '*.mixpanel.com',
    ],
    'frame-src': ["'self'", '*.google.com', '*.gstatic.com'],
    'font-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
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
  // SMART PLATFORM SaaS public funnel
  '/',
  '/pricing',
  '/register',
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

// Anonymous request: admin APIs get a JSON 401 (never an HTML login page);
// everything else keeps the existing login-redirect convention.
const denyUnauthenticated = (adminApiRoute: boolean, redirectUrl: URL) =>
  adminApiRoute
    ? denyJson(401, 'Unauthorized')
    : NextResponse.redirect(redirectUrl);

// Authenticated but not a platform admin.
const denyNonAdmin = (apiRoute: boolean) =>
  apiRoute ? denyJson(403, 'Forbidden') : denyPage(403, 'Forbidden');

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Bypass routes that don't require authentication
  if (micromatch.isMatch(pathname, unAuthenticatedRoutes)) {
    return NextResponse.next();
  }

  const redirectUrl = new URL('/auth/login', req.url);
  redirectUrl.searchParams.set('callbackUrl', encodeURI(req.url));

  const adminRoute = isAdminRoute(pathname);
  const apiRoute = pathname.startsWith('/api/');

  // JWT strategy
  if (env.nextAuth.sessionStrategy === 'jwt') {
    const token = await getToken({
      req,
    });

    if (!token) {
      return denyUnauthenticated(adminRoute && apiRoute, redirectUrl);
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
      return denyUnauthenticated(adminRoute && apiRoute, redirectUrl);
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth/session).*)'],
};
