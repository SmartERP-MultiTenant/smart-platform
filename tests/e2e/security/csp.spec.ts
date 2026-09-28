import { test, expect } from '@playwright/test';

/**
 * P2.13 — CSP tightening pass.
 *
 * The policy moved from `script-src 'self' 'unsafe-inline' 'unsafe-eval' …` to a
 * per-request nonce (`script-src 'self' 'nonce-…' …`) and public funnel routes
 * now receive the CSP at all (they previously returned without any policy).
 * These assertions are deliberately structural: no exact nonce values, no
 * snapshots — the nonce is random per request by design.
 */
test.describe('Security - Content-Security-Policy (P2.13)', () => {
  const publicRoutes = ['/register', '/pricing', '/auth/login'];

  for (const route of publicRoutes) {
    test(`serves a nonce-based CSP without unsafe-* in script-src on ${route}`, async ({
      page,
    }) => {
      const response = await page.goto(route);

      const csp = response?.headers()['content-security-policy'];
      expect(csp, `CSP header missing on ${route}`).toBeTruthy();

      const scriptSrc = csp
        ?.split(';')
        .map((directive) => directive.trim())
        .find((directive) => directive.startsWith('script-src'));

      expect(scriptSrc, `CSP has no script-src on ${route}`).toBeTruthy();
      expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=_-]+'/);
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'unsafe-eval'");

      // The nonce must reach the tags Next renders, otherwise the tightened
      // policy would block the framework's own scripts.
      expect(await page.locator('[nonce]').count()).toBeGreaterThan(0);
    });

    test(`renders ${route} without CSP violations`, async ({ page }) => {
      const violations: string[] = [];

      page.on('console', (message) => {
        const text = message.text();
        if (
          /Content Security Policy|Refused to (load|execute|apply)/i.test(text)
        ) {
          violations.push(text);
        }
      });

      await page.goto(route);
      await page.waitForLoadState('networkidle');

      expect(violations).toEqual([]);
    });
  }

  // HANDOFF CONTRACT v1 regression guard (P4.14, inverted).
  //
  // The old handoff was a cross-origin hidden POST form pointing at the ERP
  // client login URL, so `form-action` had to carry that origin. The mechanism
  // is gone — the tenant origin is static nginx and answered `405 Not Allowed`
  // — and the handoff is now a plain GET navigation (`buildErpHandoffUrl`),
  // which `form-action` does not govern. Those sources are therefore dead and
  // must stay removed; a reintroduced ERP origin here would mean a hidden form
  // came back.
  test('does not allow the ERP origin in form-action (GET handoff, not a form POST)', async ({
    page,
  }) => {
    const response = await page.goto('/register');
    const csp = response?.headers()['content-security-policy'] ?? '';

    const formAction = csp
      .split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('form-action'));

    expect(formAction, 'CSP has no form-action directive').toBeTruthy();
    expect(formAction).toContain("'self'");
    // Non-vacuous: the directive is still populated with the (defensive)
    // gateway families, so the assertions below prove removal rather than an
    // accidentally empty directive.
    expect(formAction).toContain('*.moyasar.com');

    // `baseDomain` has a default (`smartapro.com`), so an ERP tenant source
    // would always have shown up here.
    const baseDomain = process.env.ERP_BASE_DOMAIN || 'smartapro.com';
    expect(formAction).not.toContain(baseDomain);

    const clientUrl = process.env.ERP_CLIENT_URL;
    if (clientUrl && clientUrl !== 'undefined') {
      expect(formAction).not.toContain(new URL(clientUrl).origin);
    }
  });
});
