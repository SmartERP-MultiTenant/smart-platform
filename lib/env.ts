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

/**
 * Emits a boot-time warning at most once per key, per process.
 *
 * Every caller here reports a *configuration* decision whose wrong setting is
 * silent, so the point is to make it visible in the deploy log without turning
 * a per-request path into a log flood. Silenced under `NODE_ENV=test`: jest
 * isolates modules per suite, so a module-scope warning would otherwise fire
 * once per suite and bury the results.
 */
const warnedKeys = new Set<string>();
const warnOnce = (key: string, message: string): void => {
  if (process.env.NODE_ENV === 'test' || warnedKeys.has(key)) {
    return;
  }

  warnedKeys.add(key);
  console.warn(message);
};

/**
 * Trusted proxy hop count for the public rate limiter (`lib/rateLimit.ts`).
 *
 * The asymmetry is the whole point, and it is not the intuitive way round:
 *
 * - TOO LOW — the bucket key becomes an earlier hop (a proxy's own address), so
 *   clients behind that proxy share a bucket. A throughput incident: the
 *   10/min ceilings on `register`/`payments` become global and the funnel 429s
 *   for everyone.
 * - TOO HIGH — the key is `chain[chain.length - hops]`, so once `hops` exceeds
 *   the number of entries the proxies actually appended, the index falls into
 *   the caller-supplied prefix, which `X-Forwarded-For` lets the caller pad
 *   freely. The key becomes a value the CALLER chose and rotating it mints a
 *   fresh bucket per request: a full bypass of every public limit.
 *
 * So an unset value cannot simply inherit production's number everywhere. `2`
 * is correct for production's documented Cloudflare -> nginx -> app topology
 * and was signed off for it, but a staging box, a preview environment or a bare
 * container behind fewer proxies would inherit `2` and silently lose the
 * control. Outside production the safe default is `0`, which ignores
 * `X-Forwarded-For` entirely and buckets on the direct-peer address: coarser
 * where proxies exist, never caller-chosen.
 *
 * Explicit configuration always wins and is parsed exactly as before, so this
 * changes no deployment that sets the variable.
 */
const resolveTrustedProxyHops = (): number => {
  const raw = process.env.RATE_LIMIT_TRUSTED_HOPS;

  if (raw !== undefined && raw.trim() !== '') {
    // A `NaN` fallback is the sentinel for "rejected": it can never be a valid
    // hop count, so a typo is distinguishable from a real `0`.
    const parsed = readBoundedInt(raw, Number.NaN, 10);

    if (Number.isInteger(parsed)) {
      return parsed;
    }

    // Configured but unusable. The operator clearly intended a value that is
    // NOT the default, so the default cannot be assumed either: the only
    // setting that can never exceed the real proxy count is `0`. Falling back
    // to production's `2` here would be the silent, bypassable direction.
    warnOnce(
      'rate-limit-trusted-hops-invalid',
      `[env] RATE_LIMIT_TRUSTED_HOPS is set to an unusable value and was rejected — using 0, so X-Forwarded-For is ignored and rate-limit buckets use the direct-peer address. Set it to the REAL proxy count (integer 0-10).`
    );

    return 0;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const fallback = isProduction ? 2 : 0;

  warnOnce(
    'rate-limit-trusted-hops-unset',
    isProduction
      ? `[env] RATE_LIMIT_TRUSTED_HOPS is unset — defaulting to ${fallback} (the documented Cloudflare + nginx topology). Set it explicitly; a value ABOVE the real proxy count makes the rate-limit bucket key caller-chosen and bypassable.`
      : `[env] RATE_LIMIT_TRUSTED_HOPS is unset — defaulting to ${fallback} outside production, so X-Forwarded-For is ignored and buckets use the direct-peer address. If this environment runs proxies, set it to the REAL proxy count: too LOW only makes the key coarser, too HIGH makes it caller-chosen.`
  );

  return fallback;
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

  // Fail-closed switch for annual (yearly) billing (PG-31).
  //
  // Off unless the value is EXACTLY `true`, so unset, blank, `"1"`, `"yes"`,
  // `"TRUE"` and every typo all resolve to false — the reading `EMAIL_ENABLED`
  // and `CONFIRM_EMAIL` already use. Deliberately NOT a `FEATURE_*` name: the
  // flags under that prefix are read `!== 'false'`, i.e. unset means ENABLED
  // (docs/env-matrix.md §3.5), which is the one inversion a money switch must
  // never have.
  //
  // Why it exists: production already carries three ACTIVE packages with yearly
  // prices, so the funnel's monthly/yearly toggle renders and an annual order
  // becomes purchasable — while the ERP cannot yet honour a billing cycle.
  // Until it can, both public order routes refuse `billingCycle: 'yearly'` and
  // the toggle is not rendered.
  yearlyBillingEnabled: process.env.YEARLY_BILLING_ENABLED === 'true',

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
  // Default 2 = the owner-confirmed production topology (2026-09-14):
  // Cloudflare → host nginx → app. Cloudflare appends the real client and
  // nginx appends the Cloudflare edge it saw, so the client is the SECOND
  // entry from the right — see docs/env-matrix.md §3.4.
  //
  // The default deliberately matches the real deployment rather than the
  // smallest possible chain, because under-configuring is the destructive
  // failure: with two proxies present and only ONE hop trusted, the bucket key
  // becomes the Cloudflare edge address, so every client behind that edge
  // shares a single bucket — a global 10/min ceiling on `register` and
  // `payments` that takes the funnel down for everyone at once.
  //
  // The OTHER direction is not benign and must never be treated as the safe
  // one: the key is `chain[chain.length - hops]`, so once `hops` exceeds the
  // number of entries the proxies actually appended, that index falls into the
  // caller-supplied prefix — which `X-Forwarded-For` lets the caller pad with
  // as many entries as they like. The key then becomes a value the CALLER
  // chose, and rotating it mints a fresh bucket per request: the original
  // P4.22 bypass, restored. Raising this above the real proxy count removes the
  // control; lowering it only makes the key coarser.
  //
  // So: the value must equal the real proxy count, and if you are unsure,
  // LOWER it — never raise it. A chain shorter than the hop count (fewer
  // proxies than configured) falls back to the direct-peer address, so a
  // genuinely smaller deployment degrades instead of breaking — but that
  // fallback covers an absent chain, never a padded one.
  // `0` disables XFF entirely and buckets on the direct-peer address.
  rateLimit: {
    trustedProxyHops: resolveTrustedProxyHops(),
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
