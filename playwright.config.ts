import { PlaywrightTestConfig, devices } from '@playwright/test';
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
    baseURL: 'http://localhost:4002',
    trace: 'retain-on-first-failure',
  },
  testDir: './tests/e2e',
};

export default config;
