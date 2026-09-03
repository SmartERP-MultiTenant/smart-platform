import { test, expect } from '@playwright/test';

// The suite's baseURL is pinned to /en (English-deterministic runs), so the
// Arabic-default and negotiation assertions below use absolute URLs against
// the app origin and dedicated browser contexts to control locale/cookies.
const APP_URL = 'http://localhost:4002';

const AR_PRICING_HEADING = 'باقات SMART PLATFORM';
const EN_PRICING_HEADING = 'SMART PLATFORM Packages';
const AR_REGISTER_HEADING = 'سجّل شركتك في SMART PLATFORM';

test.describe('locale negotiation and Arabic defaults', () => {
  test('Arabic default renders RTL on unprefixed pages', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'ar-SA' });
    const page = await context.newPage();

    await page.goto(`${APP_URL}/pricing`);
    await expect(
      page.getByRole('heading', { name: AR_PRICING_HEADING })
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await page.goto(`${APP_URL}/register`);
    await expect(
      page.getByRole('heading', { name: AR_REGISTER_HEADING })
    ).toBeVisible();

    await context.close();
  });

  test('English browsers are redirected to /en', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();

    await page.goto(`${APP_URL}/pricing`);
    await expect(page).toHaveURL(/\/en\/pricing/);
    await expect(
      page.getByRole('heading', { name: EN_PRICING_HEADING })
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await context.close();
  });

  test('NEXT_LOCALE cookie beats Accept-Language', async ({ browser }) => {
    // Explicit Arabic choice wins over an English browser: no redirect.
    const arChoice = await browser.newContext({ locale: 'en-US' });
    await arChoice.addCookies([
      { name: 'NEXT_LOCALE', value: 'ar', url: APP_URL },
    ]);
    const arPage = await arChoice.newPage();

    await arPage.goto(`${APP_URL}/pricing`);
    expect(arPage.url()).not.toContain('/en');
    await expect(
      arPage.getByRole('heading', { name: AR_PRICING_HEADING })
    ).toBeVisible();
    await arChoice.close();

    // Explicit English choice wins over an Arabic browser: /en redirect.
    const enChoice = await browser.newContext({ locale: 'ar-SA' });
    await enChoice.addCookies([
      { name: 'NEXT_LOCALE', value: 'en', url: APP_URL },
    ]);
    const enPage = await enChoice.newPage();

    await enPage.goto(`${APP_URL}/pricing`);
    await expect(enPage).toHaveURL(/\/en\/pricing/);
    await expect(
      enPage.getByRole('heading', { name: EN_PRICING_HEADING })
    ).toBeVisible();
    await enChoice.close();
  });

  test('No raw i18n keys leak on pricing pages', async ({ browser }) => {
    const enContext = await browser.newContext({ locale: 'en-US' });
    const enPage = await enContext.newPage();
    await enPage.goto(`${APP_URL}/en/pricing`);
    await expect(enPage.getByText(/^erp-pricing-/)).toHaveCount(0);
    await enContext.close();

    const arContext = await browser.newContext({ locale: 'ar-SA' });
    const arPage = await arContext.newPage();
    await arPage.goto(`${APP_URL}/pricing`);
    await expect(arPage.getByText(/^erp-pricing-/)).toHaveCount(0);
    await arContext.close();
  });
});
