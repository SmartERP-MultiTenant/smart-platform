import { expect, test } from '@playwright/test';
import { adminUser, user } from '../support/helper';
import { LoginPage } from '../support/fixtures';

/**
 * P5.3 read-only platform-admin dashboard.
 *
 * Locale note: the suite's baseURL is pinned to `/en`, and middleware.ts does
 * cookie-first locale negotiation that redirects any non-`en` request to the
 * `/en`-prefixed path. So there is no URL that renders the admin console in
 * Arabic — assertions therefore split in two:
 *   - `t()`-driven chrome (AdminNav) is asserted in ENGLISH, matching the
 *     existing admin-access/admin-revenue specs.
 *   - the dashboard body is inline Arabic by locked decision (no new locale
 *     keys), so it is asserted with its Arabic literals regardless of locale.
 * Do not "fix" the Arabic dashboard assertions by adding a locale prefix.
 */
const ADMIN_PATH = '/admin';

test.describe('P5.3 platform-admin dashboard', () => {
  test('platform admin sees the dashboard shell, tenants table, health card and recent registrations', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.credentialLogin(adminUser.email, adminUser.password);

    await page.waitForURL(
      (url) => !/^\/?(en\/)?auth\/login/.test(url.pathname)
    );

    const response = await page.goto(ADMIN_PATH);
    expect(response?.status()).toBe(200);

    // Reconciled shell: main's AdminNav still owns the title and the live
    // Revenue/Users entry points (regression guard against the branch's
    // deleted duplicate nav, which advertised them as "coming soon").
    await expect(
      page.getByRole('heading', { level: 1, name: 'Platform Admin' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Revenue & Subscriptions', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Users', exact: true })
    ).toBeVisible();

    // Dashboard sections (inline Arabic).
    await expect(page.getByText('إجمالي الشركات')).toBeVisible();
    await expect(page.getByText('حالة نظام ERP')).toBeVisible();
    await expect(page.getByText('أحدث التسجيلات')).toBeVisible();
    await expect(page.getByText(/قائمة الشركات والمستأجرين/)).toBeVisible();
  });

  test('ERP-down degrades gracefully: page still renders with a red health card and tenants still listed', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.credentialLogin(adminUser.email, adminUser.password);

    await page.waitForURL(
      (url) => !/^\/?(en\/)?auth\/login/.test(url.pathname)
    );

    // Deterministic ERP outage without stopping any real ERP: the dashboard
    // data seam is the BFF route the SWR hook reads. The ticket explicitly
    // allows a mocked/unreachable ERP for this case ("never by stopping a
    // dev ERP").
    await page.route('**/api/admin/dashboard', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            generatedAt: '2026-09-13T00:00:00.000Z',
            summary: {
              totalTeams: 1,
              linkedTeams: 1,
              activeSubscriptions: 0,
              trialSubscriptions: 0,
              expiredSubscriptions: 0,
            },
            health: { ok: false, reachable: false, error: 'unreachable' },
            tenants: [
              {
                id: 'erp-down-tenant',
                name: 'شركة الأفق',
                slug: 'alofoq',
                domain: null,
                erpTenantId: 'erp-tenant-1',
                erpSubdomain: 'alofoq',
                erpLinkedAt: null,
                createdAt: '2026-08-01T10:00:00.000Z',
                memberCount: 3,
                subscription: null,
                erpReachable: false,
                error: 'erp-unavailable',
              },
            ],
            recentRegistrations: [],
          },
        }),
      })
    );

    const response = await page.goto(ADMIN_PATH);

    // The acceptance criterion: never a 500 / white screen for an ERP outage.
    expect(response?.status()).toBe(200);

    // Red, semantic health state (never colour alone — the copy carries it).
    await expect(
      page.getByText(/خادم ERP غير متاح حالياً \(انقطاع الاتصال\)/)
    ).toBeVisible();

    // Tenants are still listed, and a linked-but-unreachable tenant is
    // labelled as such rather than being reported as "not linked".
    await expect(page.getByText('شركة الأفق')).toBeVisible();
    await expect(page.getByText('تعذر جلب الحالة')).toBeVisible();
    await expect(page.getByText('تعذر الاتصال بـ ERP')).toBeVisible();
  });

  test('regular member cannot access /api/admin/dashboard (returns 403)', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.credentialLogin(user.email, user.password);

    await page.waitForURL(
      (url) => !/^\/?(en\/)?auth\/login/.test(url.pathname)
    );

    const apiResponse = await page.request.get('/api/admin/dashboard');
    expect(apiResponse.status()).toBe(403);
    expect(apiResponse.headers()['content-type']).toContain('application/json');
  });

  test('anonymous user is redirected from /admin to login and receives 401 on api', async ({
    page,
    request,
  }) => {
    await page.goto(ADMIN_PATH);
    await expect(page).toHaveURL(/\/auth\/login\?callbackUrl=/);

    const apiResponse = await request.get('/api/admin/dashboard');
    expect(apiResponse.status()).toBe(401);
  });

  test('tenant drill-down page is reachable and shows the tenant identity', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.credentialLogin(adminUser.email, adminUser.password);

    await page.waitForURL(
      (url) => !/^\/?(en\/)?auth\/login/.test(url.pathname)
    );

    await page.route('**/api/admin/tenants/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'drill-tenant',
            name: 'شركة النخبة',
            slug: 'elnokhba',
            domain: null,
            erpTenantId: null,
            erpSubdomain: null,
            erpLinkedAt: null,
            createdAt: '2026-08-02T10:00:00.000Z',
            memberCount: 7,
            subscription: null,
            erpReachable: false,
            error: null,
          },
        }),
      })
    );

    const response = await page.goto('/admin/tenants/drill-tenant');
    expect(response?.status()).toBe(200);

    // Tenant identity is inline Arabic; the unlinked state must be explicit.
    await expect(
      page.getByRole('heading', { level: 1, name: 'شركة النخبة' })
    ).toBeVisible();
    await expect(page.getByText('غير مربوطة')).toBeVisible();
    await expect(page.getByText('7')).toBeVisible();
  });
});
