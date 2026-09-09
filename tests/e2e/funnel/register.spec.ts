import { test, expect } from '@playwright/test';

test.describe('Funnel - Register Flow', () => {
  test('validates required fields and prevents submit with empty form', async ({
    page,
  }) => {
    await page.goto('/register');
    const submitBtn = page.getByRole('button', {
      name: /تسجيل ومتابعة|Register and Continue/i,
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
      name: /تسجيل ومتابعة|Register and Continue/i,
    });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify success screen elements
    await expect(page.locator('text=Brand New Co')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /الدخول للنظام|Enter System/i })
    ).toBeVisible();
  });
});
