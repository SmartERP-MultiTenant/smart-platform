import { expect, test } from '@playwright/test';

import { adminUser, user } from '../support/helper';
import { LoginPage } from '../support/fixtures';

// P5.2 acceptance:
// - a platform admin can log in and reach /admin;
// - a regular member cannot reach /admin (403);
// - anonymous UI requests follow the existing login-redirect convention;
// - anonymous /api/admin/* requests get a JSON 401, never an HTML login page.
test.describe('P5.2 platform-admin access', () => {
  test('anonymous /admin follows the login-redirect convention', async ({
    page,
  }) => {
    const response = await page.goto('/admin');

    // Middleware redirects anonymous UI requests to the login page.
    await expect(page).toHaveURL(/\/auth\/login\?callbackUrl=/);
    expect(response?.status()).toBe(200);
  });

  test('anonymous /api/admin/* gets JSON 401 (not an HTML login page)', async ({
    request,
  }) => {
    const response = await request.get('/api/admin/dashboard');

    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toContain('application/json');
  });

  test('platform admin can log in and reach /admin', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.credentialLogin(adminUser.email, adminUser.password);

    // The login page redirects to redirectIfAuthenticated after sign-in;
    // wait until the session is established before navigating. Note the
    // locale prefix: with the suite pinned to /en, the login page pathname
    // is /en/auth/login, so a plain startsWith('/auth/login') predicate
    // matches the login page itself and returns too early.
    await page.waitForURL(
      (url) => !/^\/?(en\/)?auth\/login/.test(url.pathname)
    );

    const response = await page.goto('/admin');

    expect(response?.status()).toBe(200);
    await expect(page.getByText('لوحة التحكم — قيد التطوير')).toBeVisible();
  });

  test('member gets 403 on /admin and /api/admin/*', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.credentialLogin(user.email, user.password);

    await page.waitForURL(
      (url) => !/^\/?(en\/)?auth\/login/.test(url.pathname)
    );

    const pageResponse = await page.goto('/admin');

    expect(pageResponse?.status()).toBe(403);

    // Middleware defense-in-depth on the API surface (no /api/admin/* route
    // exists yet — middleware denies before Next.js can even 404).
    const apiResponse = await page.request.get('/api/admin/dashboard');

    expect(apiResponse.status()).toBe(403);
    expect(apiResponse.headers()['content-type']).toContain('application/json');
  });
});
