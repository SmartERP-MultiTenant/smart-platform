import { PlaywrightTestConfig, devices } from '@playwright/test';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

// Load the dedicated e2e environment (.env.e2e) into the RUNNER process so
// that the webServer (Next.js) and all test workers inherit it. This must
// happen at config-load time, not in globalSetup: Playwright runs globalSetup
// in a separate process whose env mutations do not propagate. CI pre-sets all
// these variables itself (see .github/workflows/main.yml), so skip here then.
if (!process.env.CI) {
  const envFile = path.join(__dirname, '.env.e2e');
  if (fs.existsSync(envFile)) {
    for (const rawLine of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }
}

// The e2e server must never run with real credentials: Next.js auto-loads the
// dev dotenv files for any var not already set, so a leaked key would silently
// change test behavior (real Resend SMTP creds made signup send actual emails,
// which fail with a 550 on reserved domains like example.com).
//
// - The .env.e2e loader above shadows dangerous keys with EMPTY values. Those
//   are defined-but-falsy, so the direct check passes, and because dotenv
//   loading never overrides existing keys the spawned server keeps the empty
//   shadow instead of falling back to the dev files. Side effect: locally a
//   shell-exported secret is neutralized by this loader before the guard —
//   the dotenv replay in the guard is what covers the file-based leak vector.
// - In CI the loader above is skipped, so the guard's direct check is what
//   catches workflow-injected secrets.
// - The guard then replays the exact dotenv load `next start` performs
//   (@next/env, production file set, no-override) and throws if any forbidden
//   key would reach the server non-empty. It runs in CI too: an empty checkout
//   is a no-op, a stray committed .env fails the run right here.
// The guard is CommonJS on purpose so plain node subprocesses can test it
// against crafted temp directories; createRequire loads it without lint
// suppressions.
const nodeRequire = createRequire(__filename);
const { assertNoSecretLeaks } = nodeRequire(
  './tests/e2e/support/env-secrets-guard.cjs'
) as {
  assertNoSecretLeaks: (options?: { dir?: string }) => void;
};
assertNoSecretLeaks({ dir: __dirname });

const config: PlaywrightTestConfig = {
  workers: 1,
  globalSetup: require.resolve('./tests/e2e/support/globalSetup.ts'),
  // Timeout per test
  timeout: 100 * 1000,
  // Assertion timeout
  expect: {
    timeout: 10 * 1000,
  },
  projects: [
    {
      name: 'setup',
      testMatch: 'support/*.setup.ts',
      teardown: 'cleanup db',
    },
    {
      name: 'cleanup db',
      testMatch: 'support/*.teardown.ts',
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  reporter: 'html',
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:4002',
    // Never reuse a stale server: the e2e env (.env.e2e, loaded in
    // globalSetup) must match the server process.
    reuseExistingServer: false,
  },
  retries: 1,
  use: {
    headless: true,
    ignoreHTTPSErrors: true,
    // Pin the suite to the English locale: defaultLocale is 'ar', and
    // relative fixture paths resolve against this prefix so every page
    // renders EN deterministically regardless of negotiation.
    baseURL: 'http://localhost:4002/en',
    trace: 'retain-on-first-failure',
  },
  testDir: './tests/e2e',
};

export default config;
