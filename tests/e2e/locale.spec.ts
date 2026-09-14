import { test, expect } from '@playwright/test';

// The suite's baseURL is pinned to /en (English-deterministic runs), so the
// Arabic-default and negotiation assertions below use absolute URLs against
// the app origin and dedicated browser contexts to control locale/cookies.
const APP_URL = 'http://localhost:4002';

const AR_PRICING_HEADING = 'باقات SMART PLATFORM';
const EN_PRICING_HEADING = 'SMART PLATFORM Packages';
const AR_REGISTER_HEADING = 'سجّل شركتك في SMART PLATFORM';

// Real locale strings (locales/{ar,en}/*.json) used as e2e selectors.
const AR_PAYMENT_FAILED_TITLE = 'فشل الدفع'; // common:erp-payment-status-failed-title
const AR_LANDING_START_NOW = 'ابدأ الآن'; // marketing:landing-start-now
const AR_LANDING_NAV_HOME = 'الرئيسية'; // marketing:landing-nav-home
const AR_LANDING_MENU_TOGGLE = 'فتح القائمة'; // marketing:landing-nav-toggle-menu
const AR_FOOTER_PRODUCT_COL = 'المنتج'; // marketing:landing-footer-col-product

// The shell's home button is the brand link in `LandingHeader`; its accessible
// name comes from the logo image's `alt`. `FooterSection` repeats the same link,
// so callers must scope with `.first()` (the header comes first in DOM order).
const BRAND_LINK_NAME = 'SMART PLATFORM';

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

  test('Language switcher updates html lang/dir client-side', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'ar-SA' });
    const page = await context.newPage();

    await page.goto(`${APP_URL}/pricing`);
    await expect(
      page.getByRole('heading', { name: AR_PRICING_HEADING })
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    // Pin the transition as client-side: a full reload would wipe this flag.
    await page.evaluate(() => {
      (window as any).__noReload = true;
    });

    // ar -> en via the header pill: the client-side switch must update
    // <html lang/dir> (document re-render does not happen on router.push).
    await page
      .getByRole('button', { name: 'التحويل إلى اللغة الإنجليزية' })
      .click();
    await expect(page).toHaveURL(`${APP_URL}/en/pricing`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await page.evaluate(() => (window as any).__noReload)).toBe(true);

    // en -> ar back.
    await page
      .getByRole('button', { name: 'Switch to Arabic language' })
      .click();
    await expect(page).toHaveURL(`${APP_URL}/pricing`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    expect(await page.evaluate(() => (window as any).__noReload)).toBe(true);

    await context.close();
  });

  test('Locale switch preserves an active hash fragment', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'ar-SA' });
    const page = await context.newPage();

    await page.goto(`${APP_URL}/#features`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('#features')).toBeAttached();
    await expect(page).toHaveURL(/#features$/);

    // ar -> en keeps the fragment: the switcher must not drop the hash.
    await page
      .getByRole('button', { name: 'التحويل إلى اللغة الإنجليزية' })
      .click();
    await expect(page).toHaveURL(/\/en#features/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    // en -> ar back, fragment still intact (no /en prefix left behind).
    // Poll: the client-side locale switch (router.push) strips /en
    // asynchronously, so a sync read of page.url() right after click() races it.
    await page
      .getByRole('button', { name: 'Switch to Arabic language' })
      .click();
    await expect.poll(() => page.url()).not.toContain('/en');
    await expect(page).toHaveURL(/#features$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await context.close();
  });

  // P1.x: the shell's home button must land on the *localized* home page. The
  // default locale (ar) is served unprefixed and English under `/en`, so the
  // logo link must neither drop the `/en` prefix nor force a locale switch.
  test('Shell home button lands on the localized home page', async ({
    browser,
  }) => {
    const arContext = await browser.newContext({ locale: 'ar-SA' });
    const arPage = await arContext.newPage();

    await arPage.goto(`${APP_URL}/pricing`);
    await expect(arPage.locator('html')).toHaveAttribute('dir', 'rtl');

    await arPage.getByRole('link', { name: BRAND_LINK_NAME }).first().click();

    await expect(arPage).toHaveURL(`${APP_URL}/`);
    await expect(arPage.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(arPage.locator('html')).toHaveAttribute('dir', 'rtl');
    // The hero carries the landing's `#home` anchor: proves the real landing
    // rendered rather than an empty shell.
    await expect(arPage.locator('#home')).toBeAttached();

    await arContext.close();

    const enContext = await browser.newContext({ locale: 'en-US' });
    const enPage = await enContext.newPage();

    await enPage.goto(`${APP_URL}/en/pricing`);
    await expect(enPage.locator('html')).toHaveAttribute('dir', 'ltr');

    await enPage.getByRole('link', { name: BRAND_LINK_NAME }).first().click();

    // `en` is not the default locale, so the `/en` prefix must survive.
    await expect(enPage).toHaveURL(`${APP_URL}/en`);
    await expect(enPage.locator('html')).toHaveAttribute('lang', 'en');
    await expect(enPage.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(enPage.locator('#home')).toBeAttached();

    await enContext.close();
  });

  test('Payment status pages render the compact public header', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'ar-SA' });
    const page = await context.newPage();

    await page.goto(`${APP_URL}/payment/failed`);
    await expect(
      page.getByRole('heading', { name: AR_PAYMENT_FAILED_TITLE })
    ).toBeVisible();

    // Compact header: brand + language only.
    await expect(
      page.getByRole('link', { name: BRAND_LINK_NAME }).first()
    ).toBeVisible();

    // No marketing chrome: CTA, nav item, and mobile menu toggle absent.
    await expect(page.getByText(AR_LANDING_START_NOW)).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: AR_LANDING_NAV_HOME, exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: AR_LANDING_MENU_TOGGLE })
    ).toHaveCount(0);

    // The public footer is still present.
    await expect(
      page.getByText(AR_FOOTER_PRODUCT_COL, { exact: true })
    ).toBeVisible();

    await context.close();
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
