import { test, expect } from '@playwright/test';
import { prisma } from '@/lib/prisma';

import { user, team } from '../support/helper';
import { LoginPage } from '../support/fixtures';

// P4.9: authenticated extend/cancel coverage for the team-ERP M2M BFF. ERP
// calls are served by the hermetic stub (support/erp-stub.cjs) that Playwright
// starts as a second webServer — no real or dev ERP is involved.
const E2E_TENANT_ID = 'e2e-tenant-1';
const newEndDateIso = new Date(Date.now() + 30 * 86400000).toISOString();

const loginAsMember = async (loginPage: LoginPage) => {
  await loginPage.goto();
  await loginPage.credentialLogin(user.email, user.password);
  await loginPage.page.waitForURL(
    (url) => !/^\/?(en\/)?auth\/login/.test(url.pathname)
  );
};

test.describe('Funnel - Team ERP Management API', () => {
  test('rejects unauthenticated extend request with JSON 401', async ({
    request,
  }) => {
    const res = await request.post('/api/teams/any-team/erp-extend', {
      data: {
        newEndDate: newEndDateIso,
      },
    });

    // Unauthenticated API requests get a JSON 401 (never an HTML login page).
    expect(res.status()).toBe(401);
    expect(res.headers()['content-type']).toContain('application/json');
  });

  test('rejects unauthenticated cancel request with JSON 401', async ({
    request,
  }) => {
    const res = await request.post('/api/teams/any-team/erp-cancel');

    expect(res.status()).toBe(401);
    expect(res.headers()['content-type']).toContain('application/json');
  });
});

test.describe
  .serial('Funnel - Team ERP extend/cancel (authenticated member)', () => {
  test('member of an unlinked team gets 400 not-linked', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginAsMember(loginPage);

    const res = await page.request.post(`/api/teams/${team.slug}/erp-extend`, {
      data: { newEndDate: newEndDateIso },
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: { message: 'not-linked' } });
  });

  test('member extend succeeds against the stubbed ERP M2M billing API', async ({
    page,
  }) => {
    // Link the seeded member team to a tenant so the extend handler reaches
    // the ERP M2M call (served by the stub).
    await prisma.team.update({
      where: { slug: team.slug },
      data: { erpTenantId: E2E_TENANT_ID, erpLinkedAt: new Date() },
    });

    const loginPage = new LoginPage(page);
    await loginAsMember(loginPage);

    const res = await page.request.post(`/api/teams/${team.slug}/erp-extend`, {
      data: { newEndDate: newEndDateIso },
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
  });

  test('member cancel succeeds against the stubbed ERP M2M billing API', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginAsMember(loginPage);

    const res = await page.request.post(`/api/teams/${team.slug}/erp-cancel`);

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
  });

  test('member extend with a malformed newEndDate is rejected with 400', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginAsMember(loginPage);

    const res = await page.request.post(`/api/teams/${team.slug}/erp-extend`, {
      data: { newEndDate: 'not-a-date' },
    });

    expect(res.status()).toBe(400);
  });

  test.afterAll(async () => {
    // Restore the unlinked baseline (fresh run/rerun safety).
    await prisma.team
      .update({
        where: { slug: team.slug },
        data: { erpTenantId: null },
      })
      .catch(() => {});
  });
});
