import { expect, test, type Page } from '@playwright/test';

import { prisma } from '@/lib/prisma';

import { adminUser, team, user } from '../support/helper';
import { LoginPage } from '../support/fixtures';

// P5.4 acceptance (ticket 86cbbpypx §4), exercised through a real browser and a
// real database:
//   - `requirePlatformAdmin` guards every new route: member = 403, anonymous = 401;
//   - the audit-log API answers with the documented envelope;
//   - `/admin/audit-logs` renders behind the admin gate;
//   - no route accepts a client-supplied ERP credential;
//   - **every mutation — success AND failure — produces an audit row**, which is
//     the ticket's headline criterion.
//
// Request paths are written as LITERAL allowlisted constants (never composed
// from runtime values) so every URL this spec can reach is visible in one
// place and nothing user-supplied can be interpolated into an outbound call.
//
// ---------------------------------------------------------------------------
// HOW THE MUTATION PATH IS MADE REACHABLE (P5.4 follow-up)
// ---------------------------------------------------------------------------
// The four mutation routes short-circuit with `ApiError(503,
// 'erp-not-configured')` when `env.erp.platformApiKey` is empty. That check
// sits BEFORE team resolution and before the audit row is opened, so while
// `.env.e2e` carried an empty `ERP_PLATFORM_API_KEY` no subscription could be
// created and no audit row could ever be written here — the criterion was
// unprovable end-to-end.
//
// `.env.e2e` now defines a clearly-fake dummy key (and
// `.github/workflows/main.yml` repeats it, because playwright.config.ts skips
// the `.env.e2e` loader when `CI` is set). It is not a credential: it shadows
// the real dev key so that one cannot leak into the e2e server, and the
// hermetic stub accepts any non-empty string. The real M2M key never reaches
// this suite — asserted below, where the audit trail is checked for it.
//
// ---------------------------------------------------------------------------
// SCOPE HONESTY — what this suite still does NOT prove
// ---------------------------------------------------------------------------
//   * `tests/e2e/support/erp-stub.cjs` is a hermetic in-memory stub, not the
//     ERP. It pins the PLATFORM's contract (guard, validation, before/after
//     snapshotting, STARTED→terminal transitions, redaction). It cannot prove
//     anything about real ERP behaviour; the M2M request/response shapes are
//     pinned against the real controller source in the stub's header comment.
//   * The stub's `extend` auto-provisions a subscription when the tenant has
//     none (documented deviation) so the pre-existing, un-edited
//     `tests/e2e/funnel/teams-erp.spec.ts` stays green. `cancel`,
//     `trial-override` and `GET` keep the real controller's semantics.
//   * The stub's `POST` responses return the stored subscription; the real
//     controller returns `PlatformActionResponseDto { Message, NewEndDate }` —
//     an action ack with no subscription fields. The route passes the upstream
//     body through verbatim, so `data.tenantId` asserted below pins the stub's
//     shape and would not hold against a real ERP. Disclosed rather than
//     silently relied upon.
//   * The stub's `GET` returns `status` as a PascalCase STRING. The real
//     by-tenant endpoint serializes the domain entity with no
//     `JsonStringEnumConverter`, so on the wire `status` is the enum's NUMERIC
//     value — which the platform's sanitizer then drops, since it keeps only
//     string statuses. Asserting the string form keeps the before/after checks
//     meaningful; the upstream discrepancy is an open finding, not a claim
//     about the ERP.
//   * No assertions here are conditional, skipped, or relaxed to pass. Every
//     mutation a test claims to perform is performed, and its audit row is
//     read back from the API and the UI.

// Team id used in the URL fixtures. It intentionally does not exist in the
// database: these assertions are about the guard/validation contract, which
// runs before any team lookup, so no fixture row is required.
const TEAM_FIXTURE_ID = 'e2e-admin-team';

/** Literal, allowlisted request paths. Never built from runtime values. */
const PATH = {
  create: '/api/admin/subscriptions/e2e-admin-team',
  extend: '/api/admin/subscriptions/e2e-admin-team/extend',
  cancel: '/api/admin/subscriptions/e2e-admin-team/cancel',
  trialOverride: '/api/admin/subscriptions/e2e-admin-team/trial-override',
  auditLogs: '/api/admin/audit-logs',
  auditLogsPage: '/admin/audit-logs',
  unknownTeamExtend: '/api/admin/subscriptions/definitely-not-a-team/extend',
  // Live-mutation paths: the seeded member team is addressed by its slug, and
  // `afterAll` restores its unlinked baseline.
  liveCreate: '/api/admin/subscriptions/example',
  liveExtend: '/api/admin/subscriptions/example/extend',
  liveCancel: '/api/admin/subscriptions/example/cancel',
  liveTrialOverride: '/api/admin/subscriptions/example/trial-override',
  // One literal audit query per tenant under test — see the note above about
  // never interpolating runtime values into a request.
  auditNoSubscription: '/api/admin/audit-logs?targetId=e2e-sub-nosub&limit=100',
  auditCreate: '/api/admin/audit-logs?targetId=e2e-sub-create&limit=100',
  auditExtend: '/api/admin/audit-logs?targetId=e2e-sub-extend&limit=100',
  auditCancel: '/api/admin/audit-logs?targetId=e2e-sub-cancel&limit=100',
  auditPastExtend: '/api/admin/audit-logs?targetId=e2e-sub-past&limit=100',
  auditCredentials: '/api/admin/audit-logs?targetId=e2e-sub-creds&limit=100',
  // Must stay EMPTY: nothing may ever target a tenant id supplied in a request
  // body. See the credential-ignoring test in the mutation suite.
  auditAttackerTenant:
    '/api/admin/audit-logs?targetId=attacker-supplied-tenant&limit=100',
} as const;

/**
 * ERP tenant ids, one per mutation test.
 *
 * Each test owns its own tenant so a retry (`retries: 1` in
 * playwright.config.ts) re-runs against fresh stub state instead of inheriting
 * the previous attempt's subscription — a shared tenant would make "extend"
 * flaky on retry, because the second run's requested end date would no longer
 * be after the one the first run already stored.
 *
 * Kept <= 18 characters: `AdminAuditLogTable` abbreviates longer target ids,
 * which would make the UI assertion below unable to match on the full value.
 */
const TENANT = {
  noSubscription: 'e2e-sub-nosub',
  create: 'e2e-sub-create',
  extend: 'e2e-sub-extend',
  cancel: 'e2e-sub-cancel',
  pastExtend: 'e2e-sub-past',
  credentials: 'e2e-sub-creds',
} as const;

const START_DATE = '2026-01-01T00:00:00Z';
const FIRST_END_DATE = '2030-01-01T00:00:00Z';
const EXTENDED_END_DATE = '2040-01-01T00:00:00Z';
const TRIAL_END_DATE = '2041-01-01T00:00:00Z';
const PAST_END_DATE = '2020-01-01T00:00:00Z';
// A second, strictly-later end date: the extend route refuses a value that is
// not after the stored end date, so the credential test below cannot reuse
// EXTENDED_END_DATE for its second request on the same tenant.
const SECOND_END_DATE = '2042-06-01T00:00:00Z';

// What the stub stores (it normalises to a full ISO instant), so the audit
// snapshot assertions compare against the value the ERP would really report.
const START_DATE_ISO = '2026-01-01T00:00:00.000Z';
const FIRST_END_DATE_ISO = '2030-01-01T00:00:00.000Z';
const EXTENDED_END_DATE_ISO = '2040-01-01T00:00:00.000Z';

/** The dummy shadowed key from `.env.e2e`. Must never appear in an audit row. */
const E2E_PLATFORM_API_KEY = 'e2e-platform-api-key';

interface AuditRow {
  id: string;
  actorEmail: string;
  actorName: string | null;
  action: string;
  targetType: string;
  targetId: string;
  status: string;
  errorCode: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

/** Signs in through the shared credentials flow and waits for the session. */
const signIn = async (
  page: Page,
  credentials: { email: string; password: string }
) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.credentialLogin(credentials.email, credentials.password);

  await page.waitForURL((url) => !/^\/?(en\/)?auth\/login/.test(url.pathname));
};

/**
 * Points the seeded member team at an ERP tenant (or back at `null`).
 *
 * The admin mutation routes resolve `Team.erpTenantId` server-side and pass
 * only that to the ERP, so this is the seam that decides which stub tenant a
 * test mutates.
 */
const linkTeam = async (erpTenantId: string | null) => {
  await prisma.team.update({
    where: { slug: team.slug },
    data: {
      erpTenantId,
      erpLinkedAt: erpTenantId ? new Date() : null,
    },
  });
};

/** Reads back the audit rows for one tenant, via the real audited API. */
const readAuditRows = async (page: Page, path: string): Promise<AuditRow[]> => {
  const res = await page.request.get(path);
  expect(res.status()).toBe(200);

  const { data } = await res.json();
  expect(Array.isArray(data.items)).toBe(true);

  return data.items as AuditRow[];
};

test.describe('P5.4 admin subscription API — authorization boundary', () => {
  test('anonymous callers get a JSON 401 on the create route', async ({
    request,
  }) => {
    const res = await request.post('/api/admin/subscriptions/e2e-admin-team', {
      data: {},
    });

    expect(res.status()).toBe(401);
    expect(res.headers()['content-type']).toContain('application/json');
  });

  test('anonymous callers get a JSON 401 on the extend route', async ({
    request,
  }) => {
    const res = await request.post(
      '/api/admin/subscriptions/e2e-admin-team/extend',
      { data: {} }
    );

    expect(res.status()).toBe(401);
    expect(res.headers()['content-type']).toContain('application/json');
  });

  test('anonymous callers get a JSON 401 on the cancel route', async ({
    request,
  }) => {
    const res = await request.post(
      '/api/admin/subscriptions/e2e-admin-team/cancel',
      { data: {} }
    );

    expect(res.status()).toBe(401);
    expect(res.headers()['content-type']).toContain('application/json');
  });

  test('anonymous callers get a JSON 401 on the trial-override route', async ({
    request,
  }) => {
    const res = await request.post(
      '/api/admin/subscriptions/e2e-admin-team/trial-override',
      { data: {} }
    );

    expect(res.status()).toBe(401);
    expect(res.headers()['content-type']).toContain('application/json');
  });

  test('anonymous callers get a JSON 401 on the audit-log API', async ({
    request,
  }) => {
    const res = await request.get('/api/admin/audit-logs');

    expect(res.status()).toBe(401);
    expect(res.headers()['content-type']).toContain('application/json');
  });

  test('anonymous /admin/audit-logs follows the login-redirect convention', async ({
    page,
  }) => {
    await page.goto(PATH.auditLogsPage);

    await expect(page).toHaveURL(/\/auth\/login\?callbackUrl=/);
  });

  test('a member gets 403 on the create route', async ({ page }) => {
    await signIn(page, user);

    const res = await page.request.post(PATH.create, { data: {} });

    expect(res.status()).toBe(403);
    expect(res.headers()['content-type']).toContain('application/json');
  });

  test('a member gets 403 on the extend route', async ({ page }) => {
    await signIn(page, user);

    const res = await page.request.post(PATH.extend, { data: {} });

    expect(res.status()).toBe(403);
    expect(res.headers()['content-type']).toContain('application/json');
  });

  test('a member gets 403 on the cancel route', async ({ page }) => {
    await signIn(page, user);

    const res = await page.request.post(PATH.cancel, { data: {} });

    expect(res.status()).toBe(403);
    expect(res.headers()['content-type']).toContain('application/json');
  });

  test('a member gets 403 on the trial-override route', async ({ page }) => {
    await signIn(page, user);

    const res = await page.request.post(PATH.trialOverride, { data: {} });

    expect(res.status()).toBe(403);
    expect(res.headers()['content-type']).toContain('application/json');
  });

  test('a member gets 403 on the audit-log API and the page', async ({
    page,
  }) => {
    await signIn(page, user);

    const apiRes = await page.request.get(PATH.auditLogs);
    expect(apiRes.status()).toBe(403);
    expect(apiRes.headers()['content-type']).toContain('application/json');

    const pageRes = await page.goto(PATH.auditLogsPage);
    expect(pageRes?.status()).toBe(403);
  });
});

test.describe('P5.4 admin subscription API — platform admin contract', () => {
  test('the create route is POST-only', async ({ page }) => {
    await signIn(page, adminUser);

    const res = await page.request.get(PATH.create);

    expect(res.status()).toBe(405);
    expect(res.headers()['allow']).toBe('POST');
  });

  test('the extend route is POST-only', async ({ page }) => {
    await signIn(page, adminUser);

    const res = await page.request.get(PATH.extend);

    expect(res.status()).toBe(405);
    expect(res.headers()['allow']).toBe('POST');
  });

  test('the cancel route is POST-only', async ({ page }) => {
    await signIn(page, adminUser);

    const res = await page.request.get(PATH.cancel);

    expect(res.status()).toBe(405);
    expect(res.headers()['allow']).toBe('POST');
  });

  test('the trial-override route is POST-only', async ({ page }) => {
    await signIn(page, adminUser);

    const res = await page.request.get(PATH.trialOverride);

    expect(res.status()).toBe(405);
    expect(res.headers()['allow']).toBe('POST');
  });

  test('the audit-log API is GET-only', async ({ page }) => {
    await signIn(page, adminUser);

    const res = await page.request.post(PATH.auditLogs);

    expect(res.status()).toBe(405);
    expect(res.headers()['allow']).toBe('GET');
  });

  test('an impossible calendar date is rejected on extend', async ({
    page,
  }) => {
    await signIn(page, adminUser);

    const res = await page.request.post(PATH.extend, {
      data: { newEndDate: '2026-13-45' },
    });

    expect(res.status()).toBe(422);
  });

  test('a fuzzy natural-language date is rejected on extend', async ({
    page,
  }) => {
    await signIn(page, adminUser);

    const res = await page.request.post(PATH.extend, {
      data: { newEndDate: 'March 5, 2026' },
    });

    expect(res.status()).toBe(422);
  });

  test('a fuzzy natural-language date is rejected on trial-override', async ({
    page,
  }) => {
    await signIn(page, adminUser);

    const res = await page.request.post(PATH.trialOverride, {
      data: { newTrialEndDate: 'next tuesday' },
    });

    expect(res.status()).toBe(422);
  });

  test('an end date before the start date is rejected on create', async ({
    page,
  }) => {
    await signIn(page, adminUser);

    const res = await page.request.post(PATH.create, {
      data: {
        packageId: 'pkg-1',
        startDate: '2027-01-01',
        endDate: '2026-01-01',
      },
    });

    expect(res.status()).toBe(422);
  });

  test('an empty packageId is rejected on create', async ({ page }) => {
    await signIn(page, adminUser);

    const res = await page.request.post(PATH.create, {
      data: { packageId: '' },
    });

    expect(res.status()).toBe(422);
  });
});

test.describe('P5.4 audit-log API — envelope & bounds', () => {
  test('an admin gets the documented paginated envelope', async ({ page }) => {
    await signIn(page, adminUser);

    const res = await page.request.get(PATH.auditLogs);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');

    const { data } = await res.json();

    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);
    expect(typeof data.hasMore).toBe('boolean');
  });

  test('the page size is clamped to the hard ceiling', async ({ page }) => {
    await signIn(page, adminUser);

    const res = await page.request.get(
      '/api/admin/audit-logs?limit=1000000&page=-3'
    );
    expect(res.status()).toBe(200);

    const { data } = await res.json();

    // Unbounded reads must not be reachable from the query string.
    expect(data.limit).toBe(100);
    expect(data.page).toBe(1);
  });

  test('the response never carries credential-shaped fields', async ({
    page,
  }) => {
    await signIn(page, adminUser);

    const res = await page.request.get(PATH.auditLogs);
    const body = await res.text();

    for (const forbidden of [
      'erpAccessToken',
      'platformApiKey',
      'X-Platform-ApiKey',
      'password',
      'sessionToken',
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });
});

test.describe('P5.4 /admin/audit-logs — admin UI', () => {
  test('renders the audit-trail chrome for a platform admin', async ({
    page,
  }) => {
    await signIn(page, adminUser);

    const response = await page.goto(PATH.auditLogsPage);
    expect(response?.status()).toBe(200);

    // Page <Head> title proves the page itself rendered rather than a redirect.
    await expect(page).toHaveTitle(/Audit Logs — Platform Admin/);

    // AdminNav exposes the new tab and points at the new route.
    const auditTab = page.getByRole('link', {
      name: 'Audit Logs',
      exact: true,
    });
    await expect(auditTab).toBeVisible();
    await expect(auditTab).toHaveAttribute('href', /\/admin\/audit-logs$/);

    await expect(
      page.getByRole('heading', { name: 'Platform Admin Audit Trail' })
    ).toBeVisible();

    // The action filter is part of the component's always-rendered chrome, so
    // it is assertable even against an empty store. Its options prove the
    // filter is wired to the same action vocabulary the routes write
    // (`subscription.create` … `package.modules_sync`).
    const actionFilter = page.getByRole('combobox');
    await expect(actionFilter).toBeVisible();
    await expect(
      actionFilter.getByRole('option', { name: 'All Actions', exact: true })
    ).toHaveCount(1);
    await expect(
      actionFilter.getByRole('option', {
        name: 'Create Subscription (subscription.create)',
        exact: true,
      })
    ).toHaveCount(1);
    await expect(
      actionFilter.getByRole('option', {
        name: 'Extend Subscription (subscription.extend)',
        exact: true,
      })
    ).toHaveCount(1);
    await expect(
      actionFilter.getByRole('option', {
        name: 'Sync Subscription Modules (package.modules_sync)',
        exact: true,
      })
    ).toHaveCount(1);
  });

  // ORDERING — nothing above this file may WRITE an `AdminAuditLog` row.
  //
  // This test asserts an EMPTY store. Playwright orders spec files
  // alphabetically by path (`workers: 1`) and tests within a file by
  // declaration order, so the store is empty here only because this file sorts
  // before every other spec that writes an audit row. The current writers are:
  //   * `rules-matrix.spec.ts` — `/api/admin/rules/{plans/[planId],sync}`;
  //   * `users.spec.ts`         — `/api/admin/users/[id]/{,disable,enable,…}`.
  // Both call `recordAdminAudit`, and both are named to sort AFTER
  // `admin-subscriptions`. A new spec that writes audit rows must sort after
  // this file too (`r`-prefixed, not `admin-`-prefixed), or this assertion
  // fails against a non-empty table — which is exactly how it broke once.
  test('an empty audit store shows the empty state, never an error banner', async ({
    page,
  }) => {
    await signIn(page, adminUser);

    await page.goto(PATH.auditLogsPage);

    await expect(
      page.getByText('No audit log entries recorded yet')
    ).toBeVisible();

    // A broken audit store must surface as an error, never as a healthy empty
    // table — the counterpart of the route-level 5xx contract. Nothing below
    // may appear while the store is healthy.
    await expect(page.locator('table')).toHaveCount(0);
  });
});

test.describe.serial('P5.4 admin subscription mutations — audit trail', () => {
  test.afterAll(async () => {
    // Restore the unlinked baseline so reruns and other suites start clean —
    // `tests/e2e/funnel/teams-erp.spec.ts` asserts an UNLINKED `example` team
    // in its first test.
    await linkTeam(null);
  });

  test('a refused ERP mutation still records a FAILED audit row', async ({
    page,
  }) => {
    // No subscription exists for this tenant, so the ERP answers 404 and the
    // platform must record the attempt as FAILED rather than dropping it.
    await linkTeam(TENANT.noSubscription);

    await signIn(page, adminUser);

    const res = await page.request.post(PATH.liveTrialOverride, {
      data: { newTrialEndDate: TRIAL_END_DATE },
    });

    expect(res.status()).toBe(404);
    expect((await res.json()).error.message).toBe('erp-not-found');

    const rows = await readAuditRows(page, PATH.auditNoSubscription);

    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('subscription.trial_override');
    expect(rows[0].status).toBe('FAILED');
    expect(rows[0].errorCode).toBe('erp-not-found');
    expect(rows[0].targetType).toBe('tenant');
    expect(rows[0].targetId).toBe(TENANT.noSubscription);
    expect(rows[0].actorEmail).toBe(adminUser.email);
  });

  test('create records a SUCCEEDED row with the persisted after-state', async ({
    page,
  }) => {
    await linkTeam(TENANT.create);

    await signIn(page, adminUser);

    const res = await page.request.post(PATH.liveCreate, {
      data: {
        packageId: 'e2e-package',
        startDate: START_DATE,
        endDate: FIRST_END_DATE,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.tenantId).toBe(TENANT.create);

    const rows = await readAuditRows(page, PATH.auditCreate);

    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('subscription.create');
    expect(rows[0].status).toBe('SUCCEEDED');
    expect(rows[0].targetId).toBe(TENANT.create);

    // The after-state comes from a real read-back of the ERP, not the request.
    expect(rows[0].after?.endDate).toBe(FIRST_END_DATE_ISO);
    expect(rows[0].after?.startDate).toBe(START_DATE_ISO);
    expect(rows[0].after?.status).toBe('Active');

    // Whitelisted request context, never a raw body dump.
    expect(rows[0].metadata?.packageId).toBe('e2e-package');
    expect(rows[0].metadata?.erpTenantId).toBe(TENANT.create);

    // Redaction: the M2M key that authenticated this very mutation must not be
    // recoverable from the trail.
    const serialised = JSON.stringify(rows[0]);
    expect(serialised).not.toContain(E2E_PLATFORM_API_KEY);
    expect(serialised).not.toContain('X-Platform-ApiKey');
  });

  test('extend records before AND after states that actually differ', async ({
    page,
  }) => {
    await linkTeam(TENANT.extend);

    await signIn(page, adminUser);

    // Seed a subscription so "before" is a real ERP state rather than null.
    const created = await page.request.post(PATH.liveCreate, {
      data: {
        packageId: 'e2e-package',
        startDate: START_DATE,
        endDate: FIRST_END_DATE,
      },
    });
    expect(created.status()).toBe(200);

    const res = await page.request.post(PATH.liveExtend, {
      data: { newEndDate: EXTENDED_END_DATE },
    });

    expect(res.status()).toBe(200);

    const rows = await readAuditRows(page, PATH.auditExtend);
    const extendRow = rows.find((row) => row.action === 'subscription.extend');

    expect(extendRow).toBeTruthy();
    expect(extendRow?.status).toBe('SUCCEEDED');

    // The whole point of the before/after snapshots: they must show the change
    // the operator made, which a stateless stub could never demonstrate.
    expect(extendRow?.before?.endDate).toBe(FIRST_END_DATE_ISO);
    expect(extendRow?.after?.endDate).toBe(EXTENDED_END_DATE_ISO);
    expect(extendRow?.before?.endDate).not.toBe(extendRow?.after?.endDate);
    expect(extendRow?.metadata?.newEndDate).toBe(EXTENDED_END_DATE);

    // The seeded create is audited too — one row per operation, no orphans.
    const createRows = rows.filter(
      (row) => row.action === 'subscription.create'
    );
    expect(createRows).toHaveLength(1);
    expect(createRows[0].status).toBe('SUCCEEDED');
  });

  test('cancel succeeds once, then a repeat attempt is audited FAILED', async ({
    page,
  }) => {
    await linkTeam(TENANT.cancel);

    await signIn(page, adminUser);

    const created = await page.request.post(PATH.liveCreate, {
      data: {
        packageId: 'e2e-package',
        startDate: START_DATE,
        endDate: FIRST_END_DATE,
      },
    });
    expect(created.status()).toBe(200);

    const first = await page.request.post(PATH.liveCancel, {
      data: { reason: 'e2e manual cancellation' },
    });
    expect(first.status()).toBe(200);

    // The ERP now reports no LIVE subscription for this tenant, which is the
    // real controller's `FindActiveSubscriptionAsync` filter, so a second
    // cancel is a genuine upstream 404 rather than a platform guess.
    const second = await page.request.post(PATH.liveCancel, {
      data: { reason: 'e2e manual cancellation' },
    });
    expect(second.status()).toBe(404);
    expect((await second.json()).error.message).toBe('erp-not-found');

    const rows = await readAuditRows(page, PATH.auditCancel);
    const cancelRows = rows.filter(
      (row) => row.action === 'subscription.cancel'
    );

    expect(cancelRows).toHaveLength(2);

    const succeeded = cancelRows.filter((row) => row.status === 'SUCCEEDED');
    const failed = cancelRows.filter((row) => row.status === 'FAILED');

    expect(succeeded).toHaveLength(1);
    expect(succeeded[0].before?.status).toBe('Active');

    expect(failed).toHaveLength(1);
    expect(failed[0].errorCode).toBe('erp-not-found');
  });

  test('a platform-refused mutation is audited FAILED, not silently dropped', async ({
    page,
  }) => {
    await linkTeam(TENANT.pastExtend);

    await signIn(page, adminUser);

    const created = await page.request.post(PATH.liveCreate, {
      data: {
        packageId: 'e2e-package',
        startDate: START_DATE,
        endDate: FIRST_END_DATE,
      },
    });
    expect(created.status()).toBe(200);

    // Extending into the past would expire the subscription. This is refused by
    // the platform, with no ERP call at all — and the refusal must still be
    // traceable to the operator who attempted it.
    const res = await page.request.post(PATH.liveExtend, {
      data: { newEndDate: PAST_END_DATE },
    });

    expect(res.status()).toBe(422);
    expect((await res.json()).error.message).toBe('end-date-not-in-future');

    const rows = await readAuditRows(page, PATH.auditPastExtend);
    const refused = rows.filter((row) => row.action === 'subscription.extend');

    expect(refused).toHaveLength(1);
    expect(refused[0].status).toBe('FAILED');
    expect(refused[0].errorCode).toBe('end-date-not-in-future');
    expect(refused[0].actorEmail).toBe(adminUser.email);
  });

  test('client-supplied ERP credentials are ignored, not honoured', async ({
    page,
  }) => {
    // This test used to post at the UNMATCHED fixture team (`e2e-admin-team`),
    // which 404s in `resolveTeam` before any body field could matter. Both
    // requests therefore returned the same 404 for a reason unrelated to
    // credentials, so the status-equality check was satisfied by construction
    // and the `not.toContain` assertions were trivially true against a
    // `team-not-found` body. It now runs against a RESOLVABLE, ERP-linked team,
    // where a body-supplied `tenantId` could genuinely change which tenant is
    // mutated — which is what makes the assertions discriminate.
    await linkTeam(TENANT.credentials);

    await signIn(page, adminUser);

    const created = await page.request.post(PATH.liveCreate, {
      data: {
        packageId: 'e2e-package',
        startDate: START_DATE,
        endDate: FIRST_END_DATE,
      },
    });
    expect(created.status()).toBe(200);

    // The same request with and without planted credential material must behave
    // identically — that is what proves the fields are never read.
    const baseline = await page.request.post(PATH.liveExtend, {
      data: { newEndDate: EXTENDED_END_DATE },
    });
    expect(baseline.status()).toBe(200);

    const withCredentials = await page.request.post(PATH.liveExtend, {
      data: {
        newEndDate: SECOND_END_DATE,
        apiKey: 'attacker-supplied-key',
        erpAccessToken: 'attacker-supplied-token',
        tenantId: 'attacker-supplied-tenant',
      },
    });

    expect(withCredentials.status()).toBe(baseline.status());

    // Both mutations landed on the SERVER-RESOLVED tenant. Had the body
    // `tenantId` been honoured, the second request would have targeted
    // `attacker-supplied-tenant` and this tenant would hold a single extend row
    // instead of two.
    const rows = await readAuditRows(page, PATH.auditCredentials);
    const extendRows = rows.filter(
      (row) => row.action === 'subscription.extend'
    );

    expect(extendRows).toHaveLength(2);
    expect(extendRows.every((row) => row.targetId === TENANT.credentials)).toBe(
      true
    );

    // Rows come back newest-first, so [0] is the credential-planted request.
    // The legitimately-supplied field WAS honoured while the credential-shaped
    // ones were not — which is what stops the status equality above from being
    // a coincidence of both requests being ignored wholesale.
    expect(extendRows[0].metadata?.newEndDate).toBe(SECOND_END_DATE);

    // ...and nothing anywhere targeted the attacker-supplied tenant, via the
    // real audited API rather than the response body of one request.
    const attackerRows = await readAuditRows(page, PATH.auditAttackerTenant);
    expect(attackerRows).toHaveLength(0);

    const serialised = JSON.stringify(rows);
    expect(serialised).not.toContain('attacker-supplied-key');
    expect(serialised).not.toContain('attacker-supplied-token');
    expect(serialised).not.toContain('attacker-supplied-tenant');
  });

  test('the audit table renders the persisted rows for a platform admin', async ({
    page,
  }) => {
    // Runs last in the serial block on purpose: the rows asserted here are the
    // ones the mutations above just produced, which is what makes the table's
    // `items.length > 0` branch reachable — it could never render before.
    await signIn(page, adminUser);

    await page.goto(PATH.auditLogsPage);

    const table = page.locator('table');
    await expect(table).toHaveCount(1);

    await expect(
      page.getByText('No audit log entries recorded yet')
    ).toHaveCount(0);

    const createRow = table.locator('tbody tr', { hasText: TENANT.create });
    await expect(createRow).toHaveCount(1);
    await expect(createRow.getByText('subscription.create')).toBeVisible();
    await expect(createRow.getByText('SUCCEEDED')).toBeVisible();
    await expect(createRow.getByText(adminUser.email)).toBeVisible();

    // The operand the operator acted on is visible, and the persisted trail
    // carries no credential material into the browser.
    await expect(createRow.getByText(TENANT.create)).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain(E2E_PLATFORM_API_KEY);
  });
});

test.describe('P5.4 admin subscription API — team resolution', () => {
  test('an unknown team is bounded — no Prisma or upstream detail leaks', async ({
    page,
  }) => {
    await signIn(page, adminUser);

    const res = await page.request.post(PATH.unknownTeamExtend, {
      data: { newEndDate: EXTENDED_END_DATE },
    });

    // `resolveTeam` refuses an unmatched id instead of forwarding the raw
    // client string to the ERP, so this is a deliberate 404 — never a 503 (the
    // platform key is configured here) and never an upstream call.
    expect(res.status()).toBe(404);
    expect((await res.json()).error.message).toBe('team-not-found');

    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/prisma/i);
    expect(body).not.toMatch(/at Object\./);
    expect(body).not.toMatch(/node_modules/);
  });

  test('a team without an ERP link is refused with a bounded 400', async ({
    page,
  }) => {
    // `example` is restored to unlinked by the mutation suite's afterAll; make
    // the precondition explicit so this test cannot depend on that ordering.
    await linkTeam(null);

    await signIn(page, adminUser);

    const res = await page.request.post(PATH.liveExtend, {
      data: { newEndDate: EXTENDED_END_DATE },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error.message).toBe('erp-not-linked');
  });
});

// SOURCE-LEVEL INVARIANT, not a runtime behaviour test. `PATH` is a literal
// allowlist and `TEAM_FIXTURE_ID` is what its unmatched-team entries point at,
// so this guards against a future edit desynchronising the two. It can only
// fail when this file itself changes — kept for that reason, and titled to say
// so rather than to imply coverage it does not provide.
test('[source invariant] the allowlisted fixture paths address TEAM_FIXTURE_ID', () => {
  expect(PATH.create.endsWith(TEAM_FIXTURE_ID)).toBe(true);
  expect(PATH.extend.includes(TEAM_FIXTURE_ID)).toBe(true);
  // The unmatched-team path must NOT collide with the fixture id, or the
  // "unknown team" test would silently start exercising the fixture path.
  expect(PATH.unknownTeamExtend.includes(TEAM_FIXTURE_ID)).toBe(false);
});
