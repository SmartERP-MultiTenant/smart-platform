import { test, expect } from '@playwright/test';

test.describe('Funnel - Team ERP Management API', () => {
  test('rejects unauthenticated extend request with 401 or redirect', async ({
    request,
  }) => {
    const res = await request.post('/api/teams/any-team/erp-extend', {
      data: {
        newEndDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    });

    // Unauthenticated request should be rejected (401 Unauthorized)
    expect([401, 403, 400]).toContain(res.status());
  });

  test('rejects unauthenticated cancel request with 401 or redirect', async ({
    request,
  }) => {
    const res = await request.post('/api/teams/any-team/erp-cancel');

    expect([401, 403, 400]).toContain(res.status());
  });
});
