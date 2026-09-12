import { test, expect } from '@playwright/test';

// `/api/cron/**` is allowlisted in middleware.ts but is NOT public: the handler
// owns the authentication via CRON_SECRET. This spec locks that contract —
// without the allowlist the API auth gate answers JSON 401 before the handler
// runs, so a scheduler could never invoke the job.
//
// `.env.e2e` deliberately does not set CRON_SECRET, so the handler's
// "not configured" branch (503, no open mode) is the observable proof that the
// request actually reached the handler instead of being intercepted.
test.describe('Cron guards', () => {
  test('reaches the handler (503 cron-not-configured) instead of a middleware 401', async ({
    request,
  }) => {
    const res = await request.post('/api/cron/renewal-reminders');

    expect(res.status()).toBe(503);
    expect(await res.json()).toEqual({
      error: { message: 'cron-not-configured' },
    });
  });

  test('handler method gate is reachable too (DELETE → 405 Allow: GET, POST)', async ({
    request,
  }) => {
    const res = await request.delete('/api/cron/renewal-reminders');

    expect(res.status()).toBe(405);
    expect(res.headers()['allow']).toBe('GET, POST');
  });
});
