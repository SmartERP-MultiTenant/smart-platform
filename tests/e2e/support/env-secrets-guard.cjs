'use strict';

/**
 * Fail-fast guard: the e2e server must never boot with real credentials.
 *
 * Leak vectors, checked in this order:
 *
 *  1. Environment-carried secrets (CI-injected, or shell-exported in CI where
 *     the .env.e2e loader is skipped) — direct truthy check below.
 *  2. Dev dotenv files — the spawned `next start` server auto-loads the
 *     production dotenv set (`.env.production.local`, `.env.local`,
 *     `.env.production`, `.env`) for any key still undefined in its process.
 *     This guard replays that exact load through `@next/env` (the same code
 *     path and parser the server runs, with the same no-override rule) and
 *     refuses to continue if a forbidden key would reach the server non-empty.
 *
 * A third check runs in both phases: EXPECTED_E2E_VALUES asserts the ERP
 * variables equal the hermetic fixture (dummy M2M key, stub URL) rather than
 * merely being truthy — a real key or host fails the run loudly instead of
 * silently pointing the suite at a real ERP.
 *
 *     The replay is SIDE-EFFECT-FREE: @next/env mutates process.env while it
 *     loads (file values, the __NEXT_PROCESSED_ENV marker, and any
 *     process-control variables like NODE_ENV/NODE_OPTIONS defined in dotenv
 *     files), and the webServer + workers inherit the runner's env. So every
 *     key the replay adds is deleted again — on pass and on failure — and the
 *     spawned server sees the exact pre-guard environment. The .env.e2e
 *     shadow values were loaded BEFORE the guard, so they are part of that
 *     pre-guard state and survive.
 *
 * The `.env.e2e` loader in playwright.config.ts runs BEFORE this guard and
 * shadows dangerous keys with empty values. An empty string is defined-but-
 * falsy: it passes the truthy checks here, and because dotenv loading never
 * overrides existing keys, the spawned server keeps the empty shadow instead
 * of falling back to the dev files.
 *
 * CommonJS on purpose: playwright.config.ts requires it, and plain `node`
 * subprocesses test it against crafted temp directories.
 */

const fs = require('fs');
const path = require('path');

// Keys that must never be non-empty when the e2e server boots. Keep in sync
// with the shadow blocks in .env.e2e (the real values live in dev .env).
const FORBIDDEN_KEYS = [
  'SMTP_PASSWORD',
  'RECAPTCHA_SECRET_KEY',
  'RESEND_API_KEY',
  // ERP service credential. The dev .env carries a real superadmin password
  // (the team-ERP billing endpoints consume it), so it needs the same empty
  // shadow as the email block. ERP_PLATFORM_API_KEY is deliberately NOT here
  // — see EXPECTED_E2E_VALUES for why.
  'ERP_ADMIN_PASSWORD',
];

// Variables that MUST be present and MUST equal the hermetic e2e fixture.
//
// These cannot use the falsiness test above: a falsy ERP_PLATFORM_API_KEY makes
// the admin subscription routes short-circuit with `erp-not-configured`, so no
// mutation — and therefore no audit row — can ever be produced and the P5.4
// headline criterion becomes unprovable end-to-end. The correct value is thus
// a clearly-fake dummy rather than an empty string, so the check is equality.
//
// The hazard this closes: playwright.config.ts SKIPS the `.env.e2e` loader when
// `CI` is set (CI injects env directly). A developer running with `CI=1`
// locally would therefore resolve these from the dev `.env` instead — a real
// M2M key and the real ERP host reaching the e2e server, with the hermetic
// stub bypassed and nothing failing closed before this check existed.
const EXPECTED_E2E_VALUES = {
  // Dummy shadow of the dev `.env` M2M key. `erp-stub.cjs` accepts any
  // non-empty string; .github/workflows/main.yml repeats it for CI.
  ERP_PLATFORM_API_KEY: 'e2e-platform-api-key',
  // Must be the stub Playwright starts as a second webServer entry, never a
  // real ERP deployment.
  ERP_API_URL: 'http://127.0.0.1:4100/api',
};

// @next/env production-mode set — what `next start` (the webServer) loads,
// in priority order (the first file that defines a key wins; later files and
// process.env values are never overridden by file values).
const PROD_ENV_FILES = [
  '.env.production.local',
  '.env.local',
  '.env.production',
  '.env',
];

function environmentErrorMessage(key) {
  return (
    `Refusing to run e2e: ${key} is set in the environment. Shadow it with ` +
    'an empty value in .env.e2e — real credentials must never reach the ' +
    'e2e server.'
  );
}

function dotenvErrorMessage(key) {
  return (
    `Refusing to run e2e: ${key} is non-empty in a dotenv file the e2e ` +
    `server would load (${PROD_ENV_FILES.join(', ')}) and would leak into ` +
    'the e2e server. Shadow it with an empty value in .env.e2e — see the ' +
    'email block there for the Mailpit recipe.'
  );
}

function expectedValueErrorMessage(key, expected, actual) {
  if (actual === undefined) {
    return (
      `Refusing to run e2e: ${key} is not set, expected "${expected}". ` +
      'Define it in .env.e2e — and keep .github/workflows/main.yml in sync, ' +
      'because playwright.config.ts skips the .env.e2e loader when CI is set ' +
      'and CI must then supply the fixture value itself.'
    );
  }

  return (
    `Refusing to run e2e: ${key} is "${actual}", expected "${expected}". A ` +
    'real ERP credential or host has reached the e2e server. Shadow it in ' +
    '.env.e2e — and remember that when CI is set the .env.e2e loader is ' +
    'skipped, so the workflow env has to carry the fixture value.'
  );
}

// Asserts every EXPECTED_E2E_VALUES entry carries the fixture value. Called
// twice (before and after the dotenv replay) for the same reason FORBIDDEN_KEYS
// is: the first pass catches what this process already carries, the second
// catches what the versioned dev dotenv files would add.
function assertExpectedE2eValues() {
  for (const [key, expected] of Object.entries(EXPECTED_E2E_VALUES)) {
    const actual = process.env[key];
    if (actual !== expected) {
      throw new Error(expectedValueErrorMessage(key, expected, actual));
    }
  }
}

// Log object per @next/env's `Log` type ({ info, error }): a bare function
// would crash `log.info(...)` inside the loader and silently push us onto the
// fallback path. File-loading info chatter is silenced; loader errors are
// surfaced (a file that cannot be read cannot leak through it either — the
// server would skip it the same way).
const LOADER_LOG = {
  info: () => {},
  error: (...args) => console.error('[env-secrets-guard]', ...args),
};

// Replays the server's dotenv load into process.env: same file set, same
// parser, same no-override semantics. Primary path is @next/env itself
// (exact parity with `next start`, including `export KEY=`, `KEY: value`,
// quotes and inline comments). If @next/env is somehow unavailable, fall
// back to Node's native parser (>= 20.12) with the same file set — it parses
// everything except the colon separator, which is close enough for a best-
// effort fallback (fail-closed either way for plain `KEY=value` secrets).
// NOTE: @next/env caches its combined env per process (the `p && !s` early
// return in loadEnvConfig), so this replay is only faithful for the first
// call in a given process — which is exactly how playwright.config.ts uses
// it. Test harnesses must run each scenario in a fresh subprocess.
function loadServerEnvFiles(dir) {
  try {
    const { loadEnvConfig } = require('@next/env');
    loadEnvConfig(dir, false, LOADER_LOG);
    return;
  } catch {
    // fall through to the native fallback
  }

  if (typeof process.loadEnvFile !== 'function') {
    throw new Error(
      'env-secrets-guard: neither @next/env nor process.loadEnvFile is ' +
        'available — refusing to run e2e without credential scanning.'
    );
  }

  for (const name of PROD_ENV_FILES) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) process.loadEnvFile(file);
  }
}

function assertNoSecretLeaks({ dir = process.cwd() } = {}) {
  // (1) What this process already carries. Locally, playwright.config.ts has
  // already loaded the .env.e2e shadows (empty strings → falsy → pass); a
  // shell-exported secret has been neutralized by that same loader. In CI the
  // loader is skipped, so this is what catches workflow-injected secrets.
  for (const key of FORBIDDEN_KEYS) {
    if (process.env[key]) {
      throw new Error(environmentErrorMessage(key));
    }
  }

  assertExpectedE2eValues();

  // (2) Replay the server's dotenv load. Afterwards, a truthy forbidden key
  // is exactly one the webServer would receive non-empty from a dev file.
  //
  // The replay mutates this process's env (file values, __NEXT_PROCESSED_ENV,
  // possibly NODE_ENV/NODE_OPTIONS from dotenv files) and the webServer and
  // workers inherit this process's env — so every key the replay ADDED is
  // deleted again in the finally block, on pass and on failure alike. Keys
  // present before the guard (including the .env.e2e shadows loaded by
  // playwright.config.ts) are left untouched. Keys that existed with a
  // different value need no cleanup: @next/env's no-override rule means file
  // values never overwrite existing keys, so only additions are possible.
  const preExistingKeys = new Set(Object.keys(process.env));
  try {
    loadServerEnvFiles(dir);

    for (const key of FORBIDDEN_KEYS) {
      if (process.env[key]) {
        throw new Error(dotenvErrorMessage(key));
      }
    }

    assertExpectedE2eValues();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!preExistingKeys.has(key)) {
        delete process.env[key];
      }
    }
  }
}

module.exports = {
  assertNoSecretLeaks,
  FORBIDDEN_KEYS,
  EXPECTED_E2E_VALUES,
  PROD_ENV_FILES,
};
