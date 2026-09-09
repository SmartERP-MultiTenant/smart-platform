import { test, expect } from '@playwright/test';

test.describe('Funnel - Team ERP Management API', () => {
  test('rejects unauthenticated extend request with JSON 401', async ({
    request,
  }) => {
    const res = await request.post('/api/teams/any-team/erp-extend', {
      data: {
        newEndDate: new Date(Date.now() + 30 * 86400000).toISOString(),
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
