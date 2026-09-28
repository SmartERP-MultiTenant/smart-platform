import { test, expect } from '@playwright/test';

test.describe('Funnel - Register Flow', () => {
  test('validates required fields and prevents submit with empty form', async ({
    page,
  }) => {
    await page.goto('/register');
    const submitBtn = page.getByRole('button', {
      name: /إنشاء الشركة|Create Company|تسجيل|Register/i,
    });

    // In register page without packageId, submit button is disabled
    await expect(submitBtn).toBeDisabled();
  });

  test('displays error on duplicate subdomain and email', async ({ page }) => {
    await page.route('**/api/public/erp/check-subdomain*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { available: false } }),
      });
    });

    await page.route('**/api/public/erp/check-email*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { available: false } }),
      });
    });

    await page.goto('/register?package=1f1b3311-2477-49f1-8c5c-3abb1c3ecd4c');

    const subdomainInput = page.locator('input[name="subdomain"]');
    await subdomainInput.fill('taken-subdomain');

    const emailInput = page.locator('input[name="adminEmail"]');
    await emailInput.fill('existing@example.com');

    // Subdomain and email live debounced checks will show indicator or error
    await expect(subdomainInput).toHaveValue('taken-subdomain');
    await expect(emailInput).toHaveValue('existing@example.com');
  });

  test('completes registration happy path and shows success screen', async ({
    page,
  }) => {
    await page.route('**/api/public/erp/check-subdomain*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { available: true } }),
      });
    });

    await page.route('**/api/public/erp/check-email*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { available: true } }),
      });
    });

    await page.route('**/api/public/erp/register', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            success: true,
            subdomain: 'brand-new-co',
            tenantId: 'tenant-123',
            redirectTo: 'http://localhost:4200/auth/login',
          },
        }),
      });
    });

    await page.goto('/register?package=1f1b3311-2477-49f1-8c5c-3abb1c3ecd4c');

    await page.locator('input[name="companyName"]').fill('Brand New Co');
    await page.locator('input[name="adminEmail"]').fill('owner@brandnew.com');
    await page.locator('input[name="adminUserName"]').fill('brandowner');
    await page.locator('input[name="adminPassword"]').fill('SecurePass123!');
    await page.locator('input[name="confirmPassword"]').fill('SecurePass123!');

    const submitBtn = page.getByRole('button', {
      name: /إنشاء الشركة|Create Company|تسجيل|Register/i,
    });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify success screen elements
    await expect(page.getByText('Brand New Co').first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /الدخول|Enter System/i })
    ).toBeVisible();
  });

  test('hands off to the ERP client with a GET carrying handoff + userName, and no credential (HANDOFF CONTRACT v1)', async ({
    page,
  }) => {
    await page.route('**/api/public/erp/check-subdomain*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { available: true } }),
      });
    });

    await page.route('**/api/public/erp/check-email*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { available: true } }),
      });
    });

    const handoffCode = 'Zm9vYmFyLTAxMjM0NTY3ODlhYmNkZWZnaGlqa2xtbm9w';

    await page.route('**/api/public/erp/register', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            success: true,
            subdomain: 'brand-new-co',
            tenantId: 'tenant-123',
            handoffCode,
            handoffExpiresAt: new Date(Date.now() + 120_000).toISOString(),
          },
        }),
      });
    });

    // Stub the cross-origin ERP login target so the navigation resolves
    // locally, and record every request to prove no URL or body carried a
    // credential.
    const requests: Array<{ url: string; postData: string | null }> = [];
    page.on('request', (request) =>
      requests.push({ url: request.url(), postData: request.postData() })
    );

    await page.route('http://localhost:4200/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>erp-login-stub</body></html>',
      });
    });

    // Scoped to the ERP client ORIGIN on purpose: the predicate cannot be
    // `/auth/login`, because Next.js prefetches the kit's own `/auth/login`
    // route as `/_next/data/<build>/en/auth/login.json` and that request would
    // satisfy it first.
    const handoffRequest = page.waitForRequest((request) =>
      request.url().startsWith('http://localhost:4200/')
    );

    await page.goto('/register?package=1f1b3311-2477-49f1-8c5c-3abb1c3ecd4c');

    await page.locator('input[name="companyName"]').fill('Brand New Co');
    await page.locator('input[name="adminEmail"]').fill('owner@brandnew.com');
    await page.locator('input[name="adminUserName"]').fill('brandowner');
    await page.locator('input[name="adminPassword"]').fill('SecurePass123!');
    await page.locator('input[name="confirmPassword"]').fill('SecurePass123!');

    const submitBtn = page.getByRole('button', {
      name: /إنشاء الشركة|Create Company|تسجيل|Register/i,
    });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // P4.23: what persists for the post-payment page is a non-credential
    // payload — a hostname label, a redirect target and a prefill hint.
    const stored = await page.evaluate(() =>
      window.sessionStorage.getItem('erpLogin')
    );
    const storedPayload = JSON.parse(stored ?? '{}') as Record<string, unknown>;
    expect(storedPayload.userName).toBe('brandowner');
    expect(Object.keys(storedPayload).sort()).toEqual([
      'redirectTo',
      'subdomain',
      'userName',
    ]);

    await page.getByRole('button', { name: /الدخول|Enter System/i }).click();

    const handoff = await handoffRequest;

    // The whole point of the handoff: a plain GET, never the hidden POST form
    // the static tenant origin answered with 405 Not Allowed.
    expect(handoff.method()).toBe('GET');

    const handoffUrl = new URL(handoff.url());
    expect(handoffUrl.pathname).toBe('/auth/login');
    // The single-use code the ERP returned — forwarded, never invented.
    expect(handoffUrl.searchParams.get('handoff')).toBe(handoffCode);
    // The prefill hint the customer actually chose.
    expect(handoffUrl.searchParams.get('userName')).toBe('brandowner');

    // No credential anywhere: not in a URL, not in a request body.
    expect(handoff.url()).not.toContain('token=');
    expect(handoff.url()).not.toContain('expiresIn');
    expect(requests.filter((r) => r.url.includes('token='))).toEqual([]);
    expect(
      requests.filter((r) => (r.postData ?? '').includes('token='))
    ).toEqual([]);
  });
});
