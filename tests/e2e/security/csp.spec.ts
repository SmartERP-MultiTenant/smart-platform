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

  // P4.14 regression guard.
  //
  // The token handoff is a cross-origin hidden POST form to the ERP client
  // login URL (`lib/erp/handoff.ts`). `form-action` governs that navigation, so
  // a policy without the ERP client origin blocks the handoff in every
  // environment where the CSP is enforced.
  test('allows the ERP client origin in form-action (P4.14 POST handoff)', async ({
    page,
  }) => {
    const response = await page.goto('/register');
    const csp = response?.headers()['content-security-policy'] ?? '';

    const formAction = csp
      .split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('form-action'));

    expect(formAction, 'CSP has no form-action directive').toBeTruthy();

    // `baseDomain` has a default (`smartapro.com`), so the tenant wildcard is
    // always expected — this also keeps the assertion non-vacuous.
    const baseDomain = process.env.ERP_BASE_DOMAIN || 'smartapro.com';
    expect(formAction).toContain(`https://${baseDomain}`);
    expect(formAction).toContain(`https://*.${baseDomain}`);

    // The configured client origin (http://localhost:4200 in dev/e2e, the
    // hosted client elsewhere) must be present verbatim — scheme included.
    const clientUrl = process.env.ERP_CLIENT_URL;
    if (clientUrl && clientUrl !== 'undefined') {
      expect(formAction).toContain(new URL(clientUrl).origin);
    }
  });
});
