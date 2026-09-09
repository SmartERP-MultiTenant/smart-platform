import { test, expect } from '@playwright/test';

test.describe('Funnel - Rate Limiting (P4.8)', () => {
  test('returns 429 too-many-requests when public check-subdomain rate limit is exceeded', async ({
    request,
  }) => {
    let hit429 = false;

    // Checks limiter allows 30 requests per minute
    for (let i = 0; i < 35; i++) {
      const res = await request.get(
        `/api/public/erp/check-subdomain?subdomain=rate-test-${i}`
      );

      if (res.status() === 429) {
        hit429 = true;
        const body = await res.json();
        expect(body).toEqual({
          error: { message: 'too-many-requests' },
        });
        break;
      }
    }

    expect(hit429).toBe(true);
  });
});
