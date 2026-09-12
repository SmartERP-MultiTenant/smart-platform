import { expect, test } from '@playwright/test';

import { adminUser } from '../support/helper';
import { LoginPage } from '../support/fixtures';

// Deep-link return flow (regression guard for a production defect).
//
// When an anonymous user requests a protected page, the middleware redirects to
// /auth/login with a `callbackUrl`. That value used to be built from `req.url`,
// which Next derives from the server's internal address, so production sent
// `callbackUrl=https://localhost:4002/admin` and the signed-in user landed on a
// dead URL. The contract now: the callback is a RELATIVE path (it resolves
// against whatever origin the user is on) and the login form returns the user
// to the page they originally asked for.
//
// NOTE on assertions: the suite's own origin is http://localhost:4002, so
// "does not contain localhost" cannot distinguish the two behaviours here — the
// invariant that can is that callbackUrl is a path, not an absolute URL.
test.describe('Deep-link login redirect', () => {
  test('anonymous deep link carries a relative callbackUrl', async ({
    page,
  }) => {
    const response = await page.goto('/admin/users');

    // The browser follows the middleware redirect to the login page.
    expect(response?.status()).toBe(200);
    expect(page.url()).toContain('/auth/login?callbackUrl=');

    const callbackUrl = new URL(page.url()).searchParams.get('callbackUrl');

    // A path, not an absolute URL — this is what broke in production. The
    // locale prefix is normalized away by Next before middleware runs (see the
    // locale-negotiation comment in middleware.ts), so the path is unprefixed.
    expect(callbackUrl).toBe('/admin/users');
    expect(callbackUrl?.startsWith('http')).toBe(false);
    expect(callbackUrl?.startsWith('//')).toBe(false);
  });

  test('signing in from a deep link lands on the requested page', async ({
    page,
  }) => {
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/auth\/login\?callbackUrl=/);

    const loginPage = new LoginPage(page);
    await loginPage.credentialLogin(adminUser.email, adminUser.password);

    // Before the fix this always ended on /dashboard (the form ignored the
    // callback and redirected to the default landing page).
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(
      page.getByRole('heading', { name: 'Platform Users' })
    ).toBeVisible();
  });
});
