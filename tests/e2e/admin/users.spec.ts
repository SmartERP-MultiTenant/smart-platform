import { expect, test, type Page } from '@playwright/test';
import { hash } from 'bcryptjs';

import { prisma } from '@/lib/prisma';
import { adminUser, user } from '../support/helper';
import { LoginPage } from '../support/fixtures';

// P5.5 acceptance (FRONTEND slice):
// - anonymous /admin/users follows the login-redirect convention; /api/admin/users is a JSON 401;
// - a regular member gets 403 on both the page and the API;
// - a platform admin sees the users table (roles + teams), can search, and the
//   payload never carries credential material;
// - disable/enable work end-to-end against the REAL credentials login gate
//   (disabled user rejected with the localized message, restored after enable);
// - self-administration is blocked (no disable/lock buttons, API answers 422).
//
// FLAKINESS CONTRACT: the state mutations live in a serial describe so the
// disable -> login-rejected -> enable -> login-succeeds sequence is ordered,
// while every test stays self-contained about its own session (Playwright
// gives each test a fresh context, so no test depends on another's cookies).
const CANDIDATE = {
  name: 'P55 Candidate',
  email: 'p55-candidate@example.com',
  password: 'p55-candidate-password',
} as const;

const DISABLED_MESSAGE =
  'Your account has been disabled by an administrator. Please contact support.';

/**
 * Signs in through the shared credentials flow and waits until the session is
 * established (mirrors admin-access.spec.ts / admin-revenue.spec.ts).
 */
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
 * Attempts a credentials login WITHOUT asserting success: a rejected login
 * answers the callback with 401, which LoginPage.credentialLogin would treat
 * as a failure. Used for the disabled-account assertions.
 */
const attemptLogin = async (
  page: Page,
  credentials: { email: string; password: string }
) => {
  await page.goto('/auth/login');
  await page.waitForURL('**/auth/login');

  await page.getByPlaceholder('Email').fill(credentials.email);
  await page.getByPlaceholder('Password').fill(credentials.password);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth/callback/credentials') &&
      response.request().method() === 'POST'
  );

  await page.getByRole('button', { name: 'Sign in' }).click();
  await responsePromise;
};

/** Looks a user id up through the platform-admin API. */
const findUserId = async (page: Page, email: string): Promise<string> => {
  const response = await page.request.get(
    `/api/admin/users?search=${encodeURIComponent(email)}`
  );

  expect(response.status()).toBe(200);

  const body = await response.json();
  const match = (body.data.items as Array<{ id: string; email: string }>).find(
    (item) => item.email === email
  );

  expect(
    match,
    `seeded user ${email} must be returned by the API`
  ).toBeTruthy();

  return match!.id;
};

/**
 * Opens the users screen and filters it down to one known email. The list is
 * newest-first and paginated, so tests that interact with a specific row must
 * search for it instead of assuming it sits on the first page.
 */
const openUsersListFilteredBy = async (page: Page, email: string) => {
  await page.goto('/admin/users');
  await page.getByTestId('admin-users-search').fill(email);
  await expect(page.getByTestId(`admin-user-row-${email}`)).toBeVisible();
};

test.beforeAll(async () => {
  // Deterministic target user for the disable/enable + login-gate assertions.
  await prisma.user.upsert({
    where: { email: CANDIDATE.email },
    update: { disabledAt: null, lockedAt: null, invalid_login_attempts: 0 },
    create: {
      name: CANDIDATE.name,
      email: CANDIDATE.email,
      password: await hash(CANDIDATE.password, 12),
      emailVerified: new Date(),
    },
  });
});

test.afterAll(async () => {
  await prisma.session.deleteMany({
    where: { user: { email: CANDIDATE.email } },
  });
  await prisma.user
    .deleteMany({ where: { email: CANDIDATE.email } })
    .catch(() => {});
});

test.describe('P5.5 platform-admin users screen', () => {
  test('anonymous /admin/users follows the login-redirect convention', async ({
    page,
  }) => {
    const response = await page.goto('/admin/users');

    await expect(page).toHaveURL(/\/auth\/login\?callbackUrl=/);
    expect(response?.status()).toBe(200);
  });

  test('anonymous /api/admin/users gets JSON 401 (not an HTML login page)', async ({
    request,
  }) => {
    const response = await request.get('/api/admin/users');

    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toContain('application/json');
  });

  test('member gets 403 on /admin/users and /api/admin/users', async ({
    page,
  }) => {
    await signIn(page, user);

    const pageResponse = await page.goto('/admin/users');

    expect(pageResponse?.status()).toBe(403);

    const apiResponse = await page.request.get('/api/admin/users');

    expect(apiResponse.status()).toBe(403);
    expect(apiResponse.headers()['content-type']).toContain('application/json');
  });

  test('platform admin sees the users table and its navigation entry', async ({
    page,
  }) => {
    await signIn(page, adminUser);

    const response = await page.goto('/admin/users');

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Users — Platform Admin/);

    // AdminNav exposes the users tab and points at the route.
    const usersTab = page.getByRole('link', { name: 'Users', exact: true });
    await expect(usersTab).toBeVisible();
    await expect(usersTab).toHaveAttribute('href', /\/admin\/users$/);

    // Table headers prove the screen rendered, not a redirect target.
    await expect(
      page.getByRole('heading', { name: 'Platform Users' })
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: 'Platform Role' })
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: 'Teams' })
    ).toBeVisible();

    // The seeded candidate is listed once filtered to it (the list is
    // newest-first and paginated).
    await page.getByTestId('admin-users-search').fill(CANDIDATE.email);
    await expect(
      page.getByTestId(`admin-user-row-${CANDIDATE.email}`)
    ).toBeVisible();
  });

  test('platform admin payload never exposes credential material', async ({
    page,
  }) => {
    await signIn(page, adminUser);

    const response = await page.request.get('/api/admin/users?limit=100');

    expect(response.status()).toBe(200);

    const body = await response.json();
    const items = body.data.items as Array<Record<string, unknown>>;

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      expect(Object.keys(item)).not.toContain('password');
      expect(Object.keys(item)).not.toContain('accounts');
      expect(item).toHaveProperty('platformRole');
      expect(Array.isArray(item.teamMembers)).toBe(true);
    }
  });

  test('search narrows the list and shows an empty state for no matches', async ({
    page,
  }) => {
    await signIn(page, adminUser);
    await page.goto('/admin/users');

    const search = page.getByTestId('admin-users-search');

    await search.fill(CANDIDATE.email);
    await expect(
      page.getByTestId(`admin-user-row-${CANDIDATE.email}`)
    ).toBeVisible();

    await search.fill('no-such-platform-user-xyz');
    await expect(page.getByText('No matching users')).toBeVisible();
    await expect(
      page.getByTestId(`admin-user-row-${CANDIDATE.email}`)
    ).toHaveCount(0);
  });

  test('self-administration is blocked in the UI and by the API', async ({
    page,
  }) => {
    await signIn(page, adminUser);
    await openUsersListFilteredBy(page, adminUser.email);

    const adminId = await findUserId(page, adminUser.email);
    const ownRow = page.getByTestId(`admin-user-row-${adminUser.email}`);

    await expect(ownRow).toBeVisible();
    // No self-disable / self-lock controls are rendered for the operator's row.
    await expect(
      ownRow.getByTestId(`admin-user-action-disable-${adminId}`)
    ).toHaveCount(0);
    await expect(
      ownRow.getByTestId(`admin-user-action-lock-${adminId}`)
    ).toHaveCount(0);

    // Backend contract behind that UI rule.
    const response = await page.request.post(
      `/api/admin/users/${adminId}/disable`
    );

    expect(response.status()).toBe(422);
    expect((await response.json()).error.message).toContain(
      'your own administrator account'
    );
  });
});

test.describe.serial('P5.5 disable/enable against the real login gate', () => {
  test('admin disables the candidate and the row reflects it', async ({
    page,
  }) => {
    await signIn(page, adminUser);
    await openUsersListFilteredBy(page, CANDIDATE.email);

    const candidateId = await findUserId(page, CANDIDATE.email);
    const row = page.getByTestId(`admin-user-row-${CANDIDATE.email}`);

    await row.getByTestId(`admin-user-action-disable-${candidateId}`).click();

    // Confirmation dialog (scoped to the modal: the row button carries the
    // same accessible name).
    const modal = page.getByLabel('Modal');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Disable' }).click();

    await expect(row.getByText('Disabled')).toBeVisible();
  });

  test('disabled candidate is rejected at login with the localized message', async ({
    page,
  }) => {
    await attemptLogin(page, CANDIDATE);

    // Still on the login page and the operator-facing reason is shown.
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByText(DISABLED_MESSAGE)).toBeVisible();
  });

  test('admin re-enables the candidate and the row reflects it', async ({
    page,
  }) => {
    await signIn(page, adminUser);
    await openUsersListFilteredBy(page, CANDIDATE.email);

    const candidateId = await findUserId(page, CANDIDATE.email);
    const row = page.getByTestId(`admin-user-row-${CANDIDATE.email}`);

    await row.getByTestId(`admin-user-action-enable-${candidateId}`).click();

    const modal = page.getByLabel('Modal');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Enable' }).click();

    await expect(row.getByText('Active')).toBeVisible();
  });

  test('re-enabled candidate can log in again', async ({ page }) => {
    await attemptLogin(page, CANDIDATE);

    await page.waitForURL(
      (url) => !/^\/?(en\/)?auth\/login/.test(url.pathname)
    );
  });
});
