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

/** Matches the dashboard BFF route with or without a query string. */
const DASHBOARD_ROUTE = /\/api\/admin\/dashboard(\?|$)/;

const tenantRow = (id: string, name: string) => ({
  id,
  name,
  slug: id,
  domain: null,
  erpTenantId: `erp-${id}`,
  erpSubdomain: id,
  erpLinkedAt: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  memberCount: 3,
  subscription: {
    status: 'active',
    rawStatus: 'Active',
    isTrial: false,
    planName: 'الباقة الاحترافية',
    endDate: '2026-12-01T00:00:00.000Z',
    daysRemaining: 30,
  },
  erpReachable: true,
  error: null,
});

/** Hermetic `/api/admin/dashboard` page payload. */
const dashboardPage = (
  items: ReturnType<typeof tenantRow>[],
  options: { page?: number; total?: number; totalPages?: number } = {}
) => ({
  data: {
    generatedAt: '2026-09-13T00:00:00.000Z',
    summary: {
      totalTeams: options.total ?? 60,
      linkedTeams: options.total ?? 60,
      activeSubscriptions: options.total ?? 60,
      trialSubscriptions: 0,
      expiredSubscriptions: 0,
    },
    health: { ok: true, reachable: true, latencyMs: 12 },
    tenants: {
      items,
      page: options.page ?? 1,
      pageSize: 25,
      total: options.total ?? 60,
      totalPages: options.totalPages ?? 3,
    },
    recentRegistrations: [],
  },
});

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
    //
    // NOTE: the pattern must tolerate the query string — the hook now requests
    // `/api/admin/dashboard?page=1&pageSize=25`, and a glob without the query
    // silently stops matching, so the REAL route answered instead.
    await page.route(DASHBOARD_ROUTE, (route) =>
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
            // Paginated shape: `tenants` is a page object, not an array.
            tenants: {
              items: [
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
              page: 1,
              pageSize: 25,
              total: 1,
              totalPages: 1,
            },
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

  test('the tenant list is paginated server-side: page 2 is requested and rendered', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.credentialLogin(adminUser.email, adminUser.password);

    await page.waitForURL(
      (url) => !/^\/?(en\/)?auth\/login/.test(url.pathname)
    );

    await page.route(DASHBOARD_ROUTE, async (route) => {
      const requestedUrl = new URL(route.request().url());

      const requestedPage = Number(requestedUrl.searchParams.get('page') ?? 1);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          dashboardPage(
            requestedPage === 1
              ? [tenantRow('tenant-1', 'شركة الصفحة الأولى')]
              : [tenantRow('tenant-26', 'شركة الصفحة الثانية')],
            { page: requestedPage }
          )
        ),
      });
    });

    // Armed BEFORE the navigation on purpose. `/api/admin/dashboard` is fetched
    // by client JS after hydration, so reading a request log synchronously once
    // `page.goto()` resolves races that hydration — it happens to win on a fast
    // local machine and reliably loses on a slower CI runner (the old
    // synchronous `requestedSearch[0]` read blew up with "received value must not
    // be null nor undefined"). Waiting on the RESPONSE is the synchronisation
    // that cannot lose the race.
    const firstPageResponse = page.waitForResponse((response) =>
      DASHBOARD_ROUTE.test(new URL(response.url()).pathname)
    );

    await page.goto(ADMIN_PATH);

    const firstRequest = new URL((await firstPageResponse).url());

    // The very first request already carries the pagination contract instead of
    // asking for every tenant.
    expect(firstRequest.searchParams.get('page')).toBe('1');
    expect(firstRequest.searchParams.get('pageSize')).toBe('25');

    await expect(page.getByText('شركة الصفحة الأولى')).toBeVisible();
    await expect(page.getByTestId('admin-tenants-page-indicator')).toHaveText(
      'الصفحة 1 من 3'
    );
    await expect(page.getByTestId('admin-tenants-prev')).toBeDisabled();

    const pageTwoResponse = page.waitForResponse(
      (response) =>
        DASHBOARD_ROUTE.test(new URL(response.url()).pathname) &&
        new URL(response.url()).searchParams.get('page') === '2'
    );

    await page.getByTestId('admin-tenants-next').click();

    // The page-2 request is a real server round-trip (not local slicing), and
    // the first page's rows are replaced by the second page's.
    //
    // Waiting for the RESPONSE — never for the request alone — is what proves
    // the server answered before the render assertions below run: a
    // `waitForRequest` only proves the request left the browser, so a response
    // that is slow (or a background revalidation the assertion cannot tell apart
    // from the operator's own page change) would surface as a confusing 10s
    // render timeout on the row instead of on the request.
    const pageTwoPayload = (await (await pageTwoResponse).json()) as {
      data: { tenants: { page: number; items: { name: string }[] } };
    };
    expect(pageTwoPayload.data.tenants.page).toBe(2);
    expect(pageTwoPayload.data.tenants.items.map((item) => item.name)).toEqual([
      'شركة الصفحة الثانية',
    ]);

    await expect(page.getByText('شركة الصفحة الثانية')).toBeVisible();
    await expect(page.getByText('شركة الصفحة الأولى')).toHaveCount(0);
    await expect(page.getByTestId('admin-tenants-page-indicator')).toHaveText(
      'الصفحة 2 من 3'
    );
    await expect(page.getByTestId('admin-tenants-prev')).toBeEnabled();

    // Regression guard for the actual CI flake: the search debounce effect used
    // to arm an UNCONDITIONAL `setPage(1)` timer on mount (it re-applied the
    // initial empty term), so a next-page click made within its 400ms window was
    // silently reverted — page 2 rendered for a moment and then jumped back to
    // page 1, which is why CI saw "getByText('شركة الصفحة الثانية') not found"
    // for 10s while the same spec passed locally. Holding the assertion past
    // that window proves the page change now survives it.
    await page.waitForTimeout(700);
    await expect(page.getByTestId('admin-tenants-page-indicator')).toHaveText(
      'الصفحة 2 من 3'
    );
    await expect(page.getByText('شركة الصفحة الثانية')).toBeVisible();
  });

  test('search is debounced and applied by the server, not locally', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.credentialLogin(adminUser.email, adminUser.password);

    await page.waitForURL(
      (url) => !/^\/?(en\/)?auth\/login/.test(url.pathname)
    );

    const searchTerms: string[] = [];

    await page.route(DASHBOARD_ROUTE, async (route) => {
      const requestedUrl = new URL(route.request().url());
      const search = requestedUrl.searchParams.get('search') ?? '';
      searchTerms.push(search);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          search
            ? dashboardPage([tenantRow('tenant-27', 'شركة النخبة')], {
                total: 1,
                totalPages: 1,
              })
            : dashboardPage([tenantRow('tenant-1', 'شركة الأفق')])
        ),
      });
    });

    await page.goto(ADMIN_PATH);
    await expect(page.getByText('شركة الأفق')).toBeVisible();

    const searchResponse = page.waitForResponse(
      (response) =>
        DASHBOARD_ROUTE.test(new URL(response.url()).pathname) &&
        new URL(response.url()).searchParams.get('search') === 'elnokhba'
    );

    // Typed character by character: a `useEffect` without the 400ms debounce
    // would issue one request per keystroke.
    await page
      .getByTestId('admin-tenants-search')
      .pressSequentially('elnokhba', { delay: 100 });

    // The ANSWERED search request, not merely a sent one: the debounce snapshot
    // below is only meaningful once the server has replied, and the render
    // assertions must not race the settle.
    await searchResponse;

    // The term reaches the SERVER (the mock above only returns its row when the
    // query carries it), so filtering is not limited to the current page.
    await expect(page.getByText('شركة النخبة')).toBeVisible();
    await expect(page.getByText('شركة الأفق')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'قائمة الشركات والمستأجرين (1)' })
    ).toBeVisible();

    // Debounced: 8 keystrokes must not produce 8 requests. Snapshotting the
    // request log only AFTER the last search response was answered keeps this
    // honest without racing: an undebounced implementation has already issued
    // all eight requests by then (the awaited one is the last keystroke's), so
    // the count cannot be under-read into a false pass.
    expect(searchTerms.filter(Boolean).length).toBeLessThan(4);
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

  test('an unknown team id renders a not-found state, not a generic outage alert', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.credentialLogin(adminUser.email, adminUser.password);

    await page.waitForURL(
      (url) => !/^\/?(en\/)?auth\/login/.test(url.pathname)
    );

    // No route interception here on purpose: a team id that does not exist is
    // a real 404 from `/api/admin/tenants/[teamId]`. The assertion below is
    // exactly what the old UI failed — it showed the generic Arabic error
    // alert, making a bad link indistinguishable from an outage.
    const apiResponse = await page.request.get(
      '/api/admin/tenants/team-that-does-not-exist'
    );
    expect(apiResponse.status()).toBe(404);

    const response = await page.goto('/admin/tenants/team-that-does-not-exist');
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole('heading', { level: 1, name: 'المنشأة غير موجودة' })
    ).toBeVisible();
    await expect(page.getByText(/لا توجد منشأة بهذا المُعرِّف/)).toBeVisible();
    // The not-found card itself links back to the dashboard. Asserted by href
    // (never localised) rather than by label, because the `t()`-driven label
    // renders in English under the /en baseURL.
    const notFoundCard = page
      .locator('div')
      .filter({
        has: page.getByRole('heading', { name: 'المنشأة غير موجودة' }),
      })
      .last();
    await expect(notFoundCard.locator('a[href$="/admin"]')).toHaveCount(1);
    await expect(
      page.getByText('تعذر تحميل بيانات الشركة، يرجى المحاولة لاحقاً.')
    ).toHaveCount(0);
  });
});
