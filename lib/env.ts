import type { SessionStrategy } from 'next-auth';

/**
 * Parse a bounded, non-negative integer env var with an explicit fallback.
 *
 * Deliberately NOT truthiness-based. The 2026-09-14 security audit flagged
 * `SECURITY_HEADERS_ENABLED` as a fail-open hazard precisely because
 * `process.env.X ?? false` keeps the *string* `"false"` — which is truthy — so
 * the flag cannot be turned off from the environment. This helper avoids that
 * class of bug by parsing first and rejecting anything that is not an integer:
 * `"false"`, `"abc"`, `"1.5"` and `"-1"` all fall back instead of coercing.
 *
 * An *empty* value (`RATE_LIMIT_TRUSTED_HOPS=`) is treated as unset, because a
 * blank line in a dotenv file means "not configured", not "zero".
 */
const readBoundedInt = (
  raw: string | undefined,
  fallback: number,
  max: number
): number => {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const parsed = Number(raw.trim());

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    return fallback;
  }

  return parsed;
};

const env = {
  databaseUrl: `${process.env.DATABASE_URL}`,
  appUrl: `${process.env.APP_URL}`,
  redirectIfAuthenticated: '/dashboard',
  securityHeadersEnabled: process.env.SECURITY_HEADERS_ENABLED ?? false,

  // SmartERP integration (see docs/SMART-PLATFORM-SAAS-INTEGRATION-PLAN.md)
  erp: {
    apiUrl: `${process.env.ERP_API_URL}`,
    clientUrl: `${process.env.ERP_CLIENT_URL}`,
    clientLoginPath: process.env.ERP_CLIENT_LOGIN_PATH || '/auth/login',
    baseDomain: process.env.ERP_BASE_DOMAIN || 'smartapro.com',
    adminUsername: process.env.ERP_ADMIN_USERNAME || '',
    adminPassword: process.env.ERP_ADMIN_PASSWORD || '',
    platformApiKey: process.env.ERP_PLATFORM_API_KEY || '',
    tokenEncryptionKey: process.env.ERP_TOKEN_ENCRYPTION_KEY || '',
  },

  // SMTP configuration for NextAuth
  smtp: {
    // Master switch for outgoing email (transactional + NextAuth email
    // provider). Kept separate from `host` so tests and sandboxes can disable
    // delivery explicitly instead of relying on an empty host as a side effect.
    enabled: process.env.EMAIL_ENABLED === 'true',
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM,
  },

  // NextAuth configuration
  nextAuth: {
    secret: process.env.NEXTAUTH_SECRET,
    sessionStrategy: (process.env.NEXTAUTH_SESSION_STRATEGY ||
      'jwt') as SessionStrategy,
  },

  // Svix
  svix: {
    url: `${process.env.SVIX_URL}`,
    apiKey: `${process.env.SVIX_API_KEY}`,
  },

  //Social login: Github
  github: {
    clientId: `${process.env.GITHUB_CLIENT_ID}`,
    clientSecret: `${process.env.GITHUB_CLIENT_SECRET}`,
  },

  //Social login: Google
  google: {
    clientId: `${process.env.GOOGLE_CLIENT_ID}`,
    clientSecret: `${process.env.GOOGLE_CLIENT_SECRET}`,
  },

  // Retraced configuration
  retraced: {
    url: process.env.RETRACED_URL
      ? `${process.env.RETRACED_URL}/auditlog`
      : undefined,
    apiKey: process.env.RETRACED_API_KEY,
    projectId: process.env.RETRACED_PROJECT_ID,
  },

  groupPrefix: process.env.GROUP_PREFIX,

  // SAML Jackson configuration
  jackson: {
    url: process.env.JACKSON_URL,
    externalUrl: process.env.JACKSON_EXTERNAL_URL || process.env.JACKSON_URL,
    apiKey: process.env.JACKSON_API_KEY,
    productId: process.env.JACKSON_PRODUCT_ID || 'smart-platform',
    selfHosted: process.env.JACKSON_URL !== undefined,
    sso: {
      callback: `${process.env.APP_URL}`,
      issuer: 'https://saml.boxyhq.com',
      path: '/api/oauth/saml',
      oidcPath: '/api/oauth/oidc',
      idpLoginPath: '/auth/idp-login',
    },
    dsync: {
      webhook_url: `${process.env.APP_URL}/api/webhooks/dsync`,
      webhook_secret: process.env.JACKSON_WEBHOOK_SECRET,
    },
  },

  // Users will need to confirm their email before accessing the app feature
  confirmEmail: process.env.CONFIRM_EMAIL === 'true',

  // Mixpanel configuration
  mixpanel: {
    token: process.env.NEXT_PUBLIC_MIXPANEL_TOKEN,
  },

  disableNonBusinessEmailSignup:
    process.env.DISABLE_NON_BUSINESS_EMAIL_SIGNUP === 'true',

  authProviders: process.env.AUTH_PROVIDERS || 'github,credentials',

  otel: {
    prefix: process.env.OTEL_PREFIX || 'smart-platform.saas',
  },

  hideLandingPage: process.env.HIDE_LANDING_PAGE === 'true',

  darkModeEnabled: process.env.NEXT_PUBLIC_DARK_MODE !== 'false',

  teamFeatures: {
    sso: process.env.FEATURE_TEAM_SSO !== 'false',
    dsync: process.env.FEATURE_TEAM_DSYNC !== 'false',
    webhook: process.env.FEATURE_TEAM_WEBHOOK !== 'false',
    apiKey: process.env.FEATURE_TEAM_API_KEY !== 'false',
    auditLog: process.env.FEATURE_TEAM_AUDIT_LOG !== 'false',
    payments:
      process.env.FEATURE_TEAM_PAYMENTS === 'false'
        ? false
        : Boolean(
            process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
          ),
    deleteTeam: process.env.FEATURE_TEAM_DELETION !== 'false',
  },

  recaptcha: {
    siteKey: process.env.RECAPTCHA_SITE_KEY || null,
    secretKey: process.env.RECAPTCHA_SECRET_KEY || null,
  },

  // Public-funnel rate limiting (P4.22).
  //
  // `trustedProxyHops` is how many reverse-proxy hops in front of this app are
  // trusted to have appended to `X-Forwarded-For`. The client address is always
  // read from the RIGHT of that header, so a caller-supplied prefix can never
  // become the rate-limit bucket key (see lib/rateLimit.ts).
  //
  // Default 1 = a single trusted proxy. Production sits behind Cloudflare plus
  // the host nginx (`*.smartapro.com` → published port 5032), so the correct
  // production value is almost certainly 2 — that is an ops decision recorded
  // in docs/env-matrix.md §3.4 and in .agents/context/architecture/security.md.
  // `0` disables XFF entirely and buckets on the direct-peer address.
  rateLimit: {
    trustedProxyHops: readBoundedInt(
      process.env.RATE_LIMIT_TRUSTED_HOPS,
      1,
      10
    ),
  },

  maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS) || 5,

  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },

  cronSecret: process.env.CRON_SECRET || null,
  // Owner-approved support/WhatsApp link. Empty when unconfigured — consumers
  // must omit the contact CTA rather than render a dead link.
  supportUrl: process.env.NEXT_PUBLIC_SUPPORT_URL || '',
};

export default env;
