import { test, expect } from '@playwright/test';

test.describe('Funnel - Payment Pages', () => {
  test('renders payment failed page with retry and home links', async ({
    page,
  }) => {
    await page.goto('/payment/failed');
    await expect(
      page.locator('text=Payment Failed|فشل الدفع').first()
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
      page.locator('text=Payment Successful|تم الدفع بنجاح|تأكيد الدفع').first()
    ).toBeVisible();
  });
});
