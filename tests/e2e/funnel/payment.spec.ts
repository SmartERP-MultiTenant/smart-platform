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

  test('shows optimistic Payment Order Received with Enter System CTA after the poll window (stubbed verify)', async ({
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

    // attempts=1 shortens the poll window (localhost-only knob in the page)
    // so the optimistic terminal state is reached without ~30s of polling.
    await page.goto('/payment/success?order=e2e-ok-ref&attempts=1&interval=50');

    await expect(
      page.getByText(/Payment Order Received|تم استلام طلب الدفع/i).first()
    ).toBeVisible();
    const enterSystem = page.getByRole('link', {
      name: /Enter System|الدخول إلى النظام/i,
    });
    await expect(enterSystem).toBeVisible();
    await expect(enterSystem).toHaveAttribute('href', /\/auth\/login/);
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
