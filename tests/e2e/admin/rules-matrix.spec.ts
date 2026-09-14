import { expect, test, type Page } from '@playwright/test';

import { adminUser, user } from '../support/helper';
import { LoginPage } from '../support/fixtures';

// P5.6 acceptance (the two criteria the close-out review found UNVERIFIED, plus
// the missing e2e spec it flagged):
//
// - the matrix renders from the ERP M2M catalogue, not from a placeholder;
// - a per-plan module toggle is SAVED and SURVIVES A RELOAD, i.e. the change
//   reached the ERP and was read back from it rather than being echoed by the
//   client (`toggle persists across a reload`);
// - the bulk "sync to existing subscriptions" path — the propagation half of
//   the ticket — is exercised through its confirmation dialog and its success
//   state, which is only rendered after the ERP answered 200 for
//   `POST /platform/billing/subscriptions/sync-modules`;
// - the two access-control conventions every other admin surface has.
//
// WHY THIS SPEC IS DETERMINISTIC: it is driven end-to-end by the hermetic ERP
// stub (`tests/e2e/support/erp-stub.cjs`, the second Playwright `webServer`
// entry), which serves the rules surface and STORES what it is written. No
// `page.route` interception is used anywhere in this file — intercepting our
// own BFF would short-circuit `lib/zod/erp.ts`, `lib/erp.ts` and the route's
// error mapping, which is precisely the coverage this ticket was missing.
//
// The stub seeds an ASYMMETRIC matrix (Basic = 1 of 3 modules, Pro = 3 of 3) so
// a genuinely-disabled module always exists on a known plan. The mutation test
// still normalises its own starting state (`Select All` before it toggles)
// rather than relying on a pristine seed, so it stays correct when re-run and
// under Playwright retries.
//
// STUB LIMITS, disclosed so no assertion here is mistaken for a guarantee about
// the real ERP: the stub has no tenant registry, so the propagation assertion
// proves the platform CALLED the sync and rendered its success state — it does
// not prove the ERP mutated any tenant's modules. That half needs a real
// WebAPI (see the PR body).
test.describe('P5.6 plan rules & permissions matrix', () => {
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

    // The login page redirects to redirectIfAuthenticated after sign-in; wait
    // until the session is established before navigating. Note the locale
    // prefix: with the suite pinned to /en the login pathname is
    // /en/auth/login, so a plain startsWith('/auth/login') predicate matches
    // the login page itself and returns too early.
    await page.waitForURL(
      (url) => !/^\/?(en\/)?auth\/login/.test(url.pathname)
    );
  };

  const openRulesMatrix = async (page: Page) => {
    await signIn(page, adminUser);

    const response = await page.goto('/admin/rules');

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Plan Rules & Permissions — Platform Admin/);
    await expect(
      page.getByRole('heading', { name: 'Plan Module Permissions Matrix' })
    ).toBeVisible();
  };

  /** Selects one of the seeded plan tabs (its label also carries the badge). */
  const selectPlanTab = async (page: Page, planName: string) => {
    const tab = page.getByRole('button', { name: new RegExp(`^${planName}`) });

    await expect(tab).toBeVisible();
    await tab.click();
  };

  test('anonymous /admin/rules follows the login-redirect convention', async ({
    page,
  }) => {
    const response = await page.goto('/admin/rules');

    await expect(page).toHaveURL(/\/auth\/login\?callbackUrl=/);
    expect(response?.status()).toBe(200);
  });

  test('anonymous /api/admin/rules gets JSON 401 (not an HTML login page)', async ({
    request,
  }) => {
    const response = await request.get('/api/admin/rules');

    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toContain('application/json');
  });

  test('member gets 403 on /admin/rules and /api/admin/rules', async ({
    page,
  }) => {
    await signIn(page, user);

    const pageResponse = await page.goto('/admin/rules');

    expect(pageResponse?.status()).toBe(403);

    const apiResponse = await page.request.get('/api/admin/rules');

    expect(apiResponse.status()).toBe(403);
    expect(apiResponse.headers()['content-type']).toContain('application/json');
  });

  test('the matrix renders the live ERP catalogue', async ({ page }) => {
    await openRulesMatrix(page);

    // Both seeded packages are selectable plans. This is the assertion that
    // fails if the catalogue does not reach the UI: the degraded payload
    // (`createDegradedRulesPayload`) carries EMPTY `packages`, and
    // `AdminRulesMatrix` then renders `admin-rules-no-plans` instead of any
    // plan tab.
    await expect(page.getByRole('button', { name: /^Basic/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pro/ })).toBeVisible();

    // The badge is `enabled / total`. Only the DENOMINATOR is asserted here: it
    // is the module-registry size, which no test in this file mutates, whereas
    // the numerator is exactly what the mutation test below changes.
    await expect(page.getByRole('button', { name: /^Basic/ })).toContainText(
      '/ 3'
    );
    await expect(page.getByRole('button', { name: /^Pro/ })).toContainText(
      '/ 3'
    );

    // The three seeded modules all render as toggles on the selected plan.
    await expect(
      page.getByRole('checkbox', { name: /^Sales & Invoicing -/ })
    ).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: /^Inventory -/ })
    ).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: /^Point of Sale -/ })
    ).toBeVisible();
  });

  test('saving a plan writes through to the ERP and survives a reload', async ({
    page,
  }) => {
    await openRulesMatrix(page);
    await selectPlanTab(page, 'Basic');

    const inventoryToggle = page.getByRole('checkbox', {
      name: /^Inventory -/,
    });

    // Normalise the starting state first, so the test does not depend on the
    // seed or on a previous run/retry having left the plan in some state.
    await page.getByRole('button', { name: 'Select All', exact: true }).click();
    await page
      .getByRole('button', { name: 'Save Plan Modules', exact: true })
      .click();
    await expect(
      page.getByText('Plan modules saved and updated successfully')
    ).toBeVisible();

    // Now the single-module toggle this test exists for: turn Inventory off.
    await expect(inventoryToggle).toBeChecked();
    await inventoryToggle.click();
    await page
      .getByRole('button', { name: 'Save Plan Modules', exact: true })
      .click();
    await expect(
      page.getByText('Plan modules saved and updated successfully')
    ).toBeVisible();

    // RELOAD — the assertion that makes this a persistence test rather than a
    // state test. The matrix re-reads `/api/admin/rules`, which re-reads the
    // ERP stub; an in-memory-only edit that never left the browser would come
    // back checked here.
    await page.reload();
    await selectPlanTab(page, 'Basic');

    await expect(
      page.getByRole('checkbox', { name: /^Inventory -/ })
    ).not.toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: /^Point of Sale -/ })
    ).toBeChecked();

    // UI-independent proof of the same fact: the ERP-facing route now reports
    // a Basic plan without Inventory.
    const apiResponse = await page.request.get('/api/admin/rules');
    const body = await apiResponse.json();
    const basic = (
      body?.data?.packages as Array<{
        name: string;
        systemModules?: Array<{ code: string }>;
      }>
    )?.find((pkg) => pkg.name === 'Basic');
    const enabledCodes = (basic?.systemModules ?? []).map((m) => m.code);

    expect(enabledCodes).toContain('SALES');
    expect(enabledCodes).not.toContain('INVENTORY');
  });

  test('bulk sync to existing subscriptions runs through its confirmation', async ({
    page,
  }) => {
    await openRulesMatrix(page);

    await page
      .getByRole('button', { name: 'Sync All Subscriptions', exact: true })
      .click();

    // The dialog is the guard rail: bulk sync strips modules from live tenants
    // and is not reversible from the platform, so the confirm step is part of
    // the contract, not decoration.
    await expect(
      page.getByText('Synchronize all subscriptions?')
    ).toBeVisible();

    await page
      .getByRole('button', { name: 'Yes, synchronize all', exact: true })
      .click();

    // Rendered only after `POST /api/admin/rules/sync` returned 200, which
    // itself required the ERP stub to answer
    // `POST /platform/billing/subscriptions/sync-modules`.
    await expect(
      page.getByText('Subscription modules synchronized successfully')
    ).toBeVisible();
  });
});
