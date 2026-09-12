import { test, expect } from '@playwright/test';

test.describe('Funnel - Payment Pages', () => {
  test('renders payment failed page with retry and home links', async ({
    page,
  }) => {
    await page.goto('/payment/failed');
    await expect(
      page.getByText(/Payment Failed|فشل الدفع/i).first()
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /الرئيسية|Home/i }).first()
    ).toBeVisible();
  });

  test('renders payment success page with fallback when order reference is missing', async ({
    page,
  }) => {
    await page.goto('/payment/success');
    await expect(
      page
        .getByText(
          /Unable to Verify Payment|تعذر التحقق من الدفع|Payment Received|تم استلام طلب الدفع/i
        )
        .first()
    ).toBeVisible();
  });

  test('redirects to the failed page when ERP verify reports success:false', async ({
    page,
  }) => {
    await page.route('**/api/public/erp/verify*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: false } }),
      });
    });

    await page.goto('/payment/success?order=e2e-failed-ref');

    await page.waitForURL(/\/payment\/failed/);
    await expect(
      page.getByText(/Payment Failed|فشل الدفع/i).first()
    ).toBeVisible();
  });

  test('hands the ERP token off via POST after the poll window (no token in any URL)', async ({
    page,
  }) => {
    // Simulate the erpLogin payload RegisterFunnel stores after a successful
    // registration so the success CTA (ERP client login) is rendered.
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        'erpLogin',
        JSON.stringify({
          token: 'e2e-token',
          expiresIn: new Date(Date.now() + 3600_000).toISOString(),
          subdomain: 'acme',
          redirectTo: '',
        })
      );
    });

    await page.route('**/api/public/erp/verify*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: true } }),
      });
    });

    // Stub the cross-origin ERP login target so the form submit resolves
    // locally, and record every request to prove no URL ever carried the token.
    const requestedUrls: string[] = [];
    page.on('request', (request) => requestedUrls.push(request.url()));

    await page.route('http://localhost:4200/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>erp-login-stub</body></html>',
      });
    });

    const handoffRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && request.url().includes('/auth/login')
    );

    // attempts=1 shortens the poll window (localhost-only knob in the page)
    // so the optimistic terminal state is reached without ~30s of polling.
    await page.goto('/payment/success?order=e2e-ok-ref&attempts=1&interval=50');

    await expect(
      page.getByText(/Payment Order Received|تم استلام طلب الدفع/i).first()
    ).toBeVisible();

    // The CTA is a button now — the token-bearing GET link is gone.
    const enterSystem = page.getByRole('button', {
      name: /Enter System|الدخول إلى النظام/i,
    });
    await expect(enterSystem).toBeVisible();

    await enterSystem.click();

    const handoff = await handoffRequest;
    expect(handoff.url()).not.toContain('token=');
    expect(handoff.postData() || '').toContain('token=e2e-token');

    // Nothing in the whole session ever requested a token-bearing URL.
    expect(requestedUrls.filter((url) => url.includes('token='))).toEqual([]);
  });

  test('shows Unable to Verify Payment state when ERP verify keeps failing', async ({
    page,
  }) => {
    await page.route('**/api/public/erp/verify*', (route) => route.abort());

    await page.goto(
      '/payment/success?order=e2e-err-ref&attempts=1&interval=50'
    );

    await expect(
      page.getByText(/Unable to Verify Payment|تعذر التحقق من الدفع/i).first()
    ).toBeVisible();
  });
});
