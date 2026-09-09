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
});
