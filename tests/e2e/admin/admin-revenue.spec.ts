import { expect, test, type Page } from '@playwright/test';

import { adminUser, user } from '../support/helper';
import { LoginPage } from '../support/fixtures';

// P5.7 acceptance:
// - anonymous /admin/revenue follows the login-redirect convention;
// - anonymous /api/admin/revenue gets a JSON 401, never an HTML login page;
// - a regular member cannot reach the revenue view (403) nor its API (403);
// - a platform admin reaches /admin/revenue and the revenue UI renders;
// - a platform admin gets a well-formed AdminRevenuePayload from the API.
//
// FLAKINESS CONTRACT: the endpoint answers 200 with a DEGRADED payload
// (ok:false plus an Arabic warning) when ERP_PLATFORM_API_KEY is unset or the
// ERP is unreachable — see pages/api/admin/revenue.ts. That is designed
// behaviour, so these tests assert the SHAPE and the TYPE of `ok`, and never a
// specific `ok` value, counts, MRR, or tenant data. They must pass on a cold
// database, and the UI assertions below are drawn only from copy that renders
// in both the live and the degraded state.
test.describe('P5.7 admin revenue view', () => {
  /**
   * Signs in through the shared credentials flow and waits until the session
   * is established. Mirrors the login flow in admin-access.spec.ts.
   */
  const signIn = async (
    page: Page,
    credentials: { email: string; password: string }
  ) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.credentialLogin(credentials.email, credentials.password);

    // The login page redirects to redirectIfAuthenticated after sign-in;
    // wait until the session is established before navigating. Note the
    // locale prefix: with the suite pinned to /en, the login page pathname
    // is /en/auth/login, so a plain startsWith('/auth/login') predicate
    // matches the login page itself and returns too early.
    await page.waitForURL(
      (url) => !/^\/?(en\/)?auth\/login/.test(url.pathname)
    );
  };

  test('anonymous /admin/revenue follows the login-redirect convention', async ({
    page,
  }) => {
    const response = await page.goto('/admin/revenue');

    // Middleware redirects anonymous UI requests to the login page.
    await expect(page).toHaveURL(/\/auth\/login\?callbackUrl=/);
    expect(response?.status()).toBe(200);
  });

  test('anonymous /api/admin/revenue gets JSON 401 (not an HTML login page)', async ({
    request,
  }) => {
    const response = await request.get('/api/admin/revenue');

    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toContain('application/json');
  });

  test('member gets 403 on /admin/revenue and /api/admin/revenue', async ({
    page,
  }) => {
    await signIn(page, user);

    const pageResponse = await page.goto('/admin/revenue');

    expect(pageResponse?.status()).toBe(403);

    // Middleware applies the same defense-in-depth gate to the API surface,
    // so the member never reaches the handler.
    const apiResponse = await page.request.get('/api/admin/revenue');

    expect(apiResponse.status()).toBe(403);
    expect(apiResponse.headers()['content-type']).toContain('application/json');
  });

  test('platform admin can load the revenue view', async ({ page }) => {
    await signIn(page, adminUser);

    const response = await page.goto('/admin/revenue');

    expect(response?.status()).toBe(200);

    // Page <Head> title (locales/en/common.json -> admin-revenue-page-title),
    // proving the page itself rendered rather than a redirect target.
    await expect(page).toHaveTitle(/Revenue & Subscriptions — Platform Admin/);

    // AdminNav: the revenue tab is exposed and points at the revenue route.
    const revenueTab = page.getByRole('link', {
      name: 'Revenue & Subscriptions',
      exact: true,
    });
    await expect(revenueTab).toBeVisible();
    await expect(revenueTab).toHaveAttribute('href', /\/admin\/revenue$/);

    // AdminNav header (admin-platform-title).
    await expect(
      page.getByRole('heading', { name: 'Platform Admin' })
    ).toBeVisible();

    // AdminRevenueTable: the table heading and the four summary stat cards
    // render from the payload envelope alone (counts/mrr exist in both the
    // live and the degraded payload), so no tenant data is asserted.
    await expect(
      page.getByRole('heading', { name: 'Tenant Subscriptions Details' })
    ).toBeVisible();
    await expect(
      page.getByText('Active Subscriptions', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('Trial Subscriptions', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('Expired Subscriptions', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('Monthly Recurring Revenue (MRR)', { exact: true })
    ).toBeVisible();
  });

  test('platform admin gets a well-formed revenue payload from the API', async ({
    page,
  }) => {
    await signIn(page, adminUser);

    // page.request shares the browser context cookies, so this call is
    // authenticated as the platform admin.
    const response = await page.request.get('/api/admin/revenue');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const body = await response.json();
    const data = body.data;

    expect(data).toBeTruthy();
    expect(typeof data).toBe('object');

    // `ok` is a boolean but its VALUE is deliberately not asserted: false is
    // the legitimate degraded state when the ERP key is missing/down.
    expect(typeof data.ok).toBe('boolean');
    expect(typeof data.generatedAt).toBe('string');
    expect(new Date(data.generatedAt).toString()).not.toBe('Invalid Date');
    expect(['erp-aggregate', 'erp-per-tenant']).toContain(data.source);

    expect(data.counts).not.toBeNull();
    expect(typeof data.counts).toBe('object');
    expect(typeof data.counts.active).toBe('number');
    expect(typeof data.counts.trial).toBe('number');
    expect(typeof data.counts.expired).toBe('number');
    expect(typeof data.counts.total).toBe('number');

    expect(typeof data.mrr).toBe('number');
    expect(Array.isArray(data.subscriptions)).toBe(true);
    expect(Array.isArray(data.trialExpirations)).toBe(true);

    // The degraded contract: an `ok:false` payload always carries the
    // operator-facing reason so the UI can render its warning banner.
    if (data.ok === false) {
      expect(typeof data.error).toBe('string');
    }
  });

  // P5.7's headline criterion is that the numbers are CORRECT, and the tests
  // above deliberately cannot show that: they assert only the SHAPE and accept
  // a degraded payload. This test asserts the VALUES, against the fixed seed the
  // hermetic ERP stub now serves at `GET /platform/billing/subscriptions`.
  //
  // Without that stub route the aggregate endpoint 404s, the route falls back to
  // `createDegradedRevenuePayload`, and any "counts" assertion would read 0/0/0
  // and pass for the wrong reason — which is exactly why this assertion could
  // not exist before. `expect(data.ok).toBe(true)` is therefore asserted FIRST
  // and with an explanatory message: if it fails, the stub route or
  // ERP_PLATFORM_API_KEY is gone, and every number below becomes meaningless.
  //
  // The expected rollup is hand-counted in `tests/e2e/support/erp-stub.cjs`
  // (`REVENUE_SUBSCRIPTIONS`) and deliberately NOT imported from it, so a change
  // to the fixture has to be reflected here by a human rather than following
  // the stub's numbers wherever they drift.
  test('counts, MRR and trial expirations reflect the ERP aggregate data', async ({
    page,
  }) => {
    await signIn(page, adminUser);

    const response = await page.request.get('/api/admin/revenue');
    const body = await response.json();
    const data = body.data;

    expect(
      data.ok,
      'expected the LIVE ERP aggregate: the hermetic stub serves GET /platform/billing/subscriptions, so ok:false means the stub route or ERP_PLATFORM_API_KEY is missing and no count below is meaningful'
    ).toBe(true);
    expect(data.source).toBe('erp-aggregate');

    // Two active (100 + 250), one trial, and one ACTIVE record whose endDate is
    // in the past — which `deriveSubscriptionStatus` must re-derive as Expired.
    // Seeding `status: 'Expired'` in the stub would have skipped that
    // derivation, so this also covers the status-derivation path.
    expect(data.counts).toEqual({
      active: 2,
      trial: 1,
      expired: 1,
      total: 4,
    });

    // MRR sums ACTIVE plans only: 100 + 250. The trial (0) and the expired
    // record (0) must not contribute, so a regression that counted trials as
    // recurring revenue would fail here.
    expect(data.mrr).toBe(350);

    expect(data.subscriptions).toHaveLength(4);

    // Only the trial record has a future endDate AND isTrial — the assertion
    // that the trial-expiration list is derived, not merely non-empty.
    expect(data.trialExpirations).toHaveLength(1);
    expect(data.trialExpirations[0].tenantName).toBe('Trial One');
    expect(typeof data.trialExpirations[0].daysRemaining).toBe('number');
  });
});
