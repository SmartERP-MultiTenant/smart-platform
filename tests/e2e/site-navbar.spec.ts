import { expect, test } from '@playwright/test';

// Navbar behaviour lives here rather than in `locale.spec.ts`: that file owns
// locale negotiation and only asserts navbar chrome incidentally (the payment
// test asserts the drawer closes on Escape). This file owns the drawer's own
// contract.
//
// All of it runs at the `en` baseURL the config pins (`http://localhost:4002/en`),
// so the hamburger's accessible name is the English `site:site.nav.open-menu`.
const EN_SITE_MENU_TOGGLE = 'Open menu';

// The Navbar collapses to the hamburger below 1281px: the drawer wrapper and the
// trigger are both `min-[1281px]:hidden`, and the desktop utility column is
// `hidden … min-[1281px]:flex`. These two widths straddle that breakpoint.
const MOBILE_WIDTH = 1280;
const DESKTOP_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;

const bodyOverflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.body.style.overflow);

test.describe('Navbar drawer body-scroll lock', () => {
  test('releases the body-scroll lock when the desktop layout takes over', async ({
    page,
  }) => {
    await page.setViewportSize({
      width: MOBILE_WIDTH,
      height: VIEWPORT_HEIGHT,
    });
    await page.goto('/pricing');

    // 1. Drawer opens at 1280 and is genuinely visible.
    await page.getByRole('button', { name: EN_SITE_MENU_TOGGLE }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    // 2. The open drawer locks page scrolling.
    await expect.poll(() => bodyOverflow(page)).toBe('hidden');

    // 3. Widen past the collapse point with the drawer still open. Nothing
    //    closes it in the UI — the trigger that opened it is gone.
    await page.setViewportSize({
      width: DESKTOP_WIDTH,
      height: VIEWPORT_HEIGHT,
    });

    // 4. The drawer is hidden by the layout itself.
    await expect(drawer).toBeHidden();

    // 5. …and the lock it took must be released with it. Polled: the release is
    //    a React effect, so reading once would race it.
    await expect.poll(() => bodyOverflow(page)).toBe('');

    // 6. Prove the page scrolls again, causally — the inline style string alone
    //    would pass even if something else kept the page frozen.
    await page.evaluate(() => window.scrollTo(0, 0));
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.move(DESKTOP_WIDTH / 2, VIEWPORT_HEIGHT / 2);
    await page.mouse.wheel(0, 600);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(before);
  });
});
