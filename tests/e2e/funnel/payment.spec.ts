import { test, expect } from '@playwright/test';

test.describe('Funnel - Payment Pages', () => {
  test('renders payment failed page with retry and home links', async ({
    page,
  }) => {
    await page.goto('/payment/failed');
    await expect(
      page.getByText(/Payment Failed|فشل الدفع/i).first()
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /الرئيسية|Home/i }).first()
    ).toBeVisible();
  });

  test('renders payment success page with fallback when order reference is missing', async ({
    page,
  }) => {
    await page.goto('/payment/success');
    await expect(
      page
        .getByText(
          /Unable to Verify Payment|تعذر التحقق من الدفع|Payment Received|تم استلام طلب الدفع/i
        )
        .first()
    ).toBeVisible();
  });

  test('redirects to the failed page when ERP verify reports success:false', async ({
    page,
  }) => {
    await page.route('**/api/public/erp/verify*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: false } }),
      });
    });

    await page.goto('/payment/success?order=e2e-failed-ref');

    await page.waitForURL(/\/payment\/failed/);
    await expect(
      page.getByText(/Payment Failed|فشل الدفع/i).first()
    ).toBeVisible();
  });

  test('hands off to the ERP login page with no credential anywhere (P4.23)', async ({
    page,
  }) => {
    // Simulate the erpLogin payload RegisterFunnel stores after a successful
    // registration so the success CTA (ERP client login) is rendered.
    //
    // P4.23: the payload carries NO token. It used to, and that live ERP access
    // token sat in this JS-readable store for the whole tab session.
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        'erpLogin',
        JSON.stringify({ subdomain: 'acme', redirectTo: '' })
      );
    });

    await page.route('**/api/public/erp/verify*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: true } }),
      });
    });

    // Stub the cross-origin ERP login target so the navigation resolves
    // locally, and record every request to prove no URL or body ever carried a
    // credential.
    const requests: Array<{ url: string; postData: string | null }> = [];
    page.on('request', (request) =>
      requests.push({ url: request.url(), postData: request.postData() })
    );

    await page.route('http://localhost:4200/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>erp-login-stub</body></html>',
      });
    });

    const handoffRequest = page.waitForRequest((request) =>
      request.url().includes('/auth/login')
    );

    // attempts=1 shortens the poll window (localhost-only knob in the page)
    // so the optimistic terminal state is reached without ~30s of polling.
    await page.goto('/payment/success?order=e2e-ok-ref&attempts=1&interval=50');

    await expect(
      page.getByText(/Payment Order Received|تم استلام طلب الدفع/i).first()
    ).toBeVisible();

    const enterSystem = page.getByRole('button', {
      name: /Enter System|الدخول إلى النظام/i,
    });
    await expect(enterSystem).toBeVisible();

    // P4.23: once the page has read the handoff target it removes the key, and
    // there is no credential left in the tab to remove in the first place.
    expect(
      await page.evaluate(() => window.sessionStorage.getItem('erpLogin'))
    ).toBeNull();

    await enterSystem.click();

    const handoff = await handoffRequest;
    // A plain GET to the login route — the hidden-form POST that carried the
    // token in its body is gone.
    expect(handoff.method()).toBe('GET');
    expect(handoff.url()).not.toContain('token=');

    // The whole point of P4.23: nothing in the session carries a credential,
    // in a URL or in a request body.
    expect(requests.filter((r) => r.url.includes('token='))).toEqual([]);
    expect(
      requests.filter((r) => (r.postData ?? '').includes('token='))
    ).toEqual([]);
  });

  test('ignores a token left in sessionStorage by an older build (P4.23)', async ({
    page,
  }) => {
    // A tab that registered BEFORE this change still holds a token-bearing
    // `erpLogin` payload. The page must not forward it: tolerating the stale
    // shape while refusing to act on it is what makes the fix deploy-safe.
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        'erpLogin',
        JSON.stringify({
          token: 'e2e-legacy-token',
          expiresIn: new Date(Date.now() + 3600_000).toISOString(),
          subdomain: 'acme',
          redirectTo: '',
        })
      );
    });

    await page.route('**/api/public/erp/verify*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: true } }),
      });
    });

    const requests: Array<{ url: string; postData: string | null }> = [];
    page.on('request', (request) =>
      requests.push({ url: request.url(), postData: request.postData() })
    );

    await page.route('http://localhost:4200/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>erp-login-stub</body></html>',
      });
    });

    const handoffRequest = page.waitForRequest((request) =>
      request.url().includes('/auth/login')
    );

    await page.goto(
      '/payment/success?order=e2e-legacy-ref&attempts=1&interval=50'
    );

    const enterSystem = page.getByRole('button', {
      name: /Enter System|الدخول إلى النظام/i,
    });
    await expect(enterSystem).toBeVisible();

    await enterSystem.click();

    const handoff = await handoffRequest;

    // The stale token is neither in the URL nor in a body.
    expect(handoff.url()).not.toContain('token');
    expect(
      requests.filter(
        (r) =>
          r.url.includes('e2e-legacy-token') ||
          (r.postData ?? '').includes('e2e-legacy-token')
      )
    ).toEqual([]);
  });

  test('shows Unable to Verify Payment state when ERP verify keeps failing', async ({
    page,
  }) => {
    await page.route('**/api/public/erp/verify*', (route) => route.abort());

    await page.goto(
      '/payment/success?order=e2e-err-ref&attempts=1&interval=50'
    );

    await expect(
      page.getByText(/Unable to Verify Payment|تعذر التحقق من الدفع/i).first()
    ).toBeVisible();
  });

  // P2.14: the ERP /verify endpoint may return an explicit `status`. The three
  // cases below pin the kit's behaviour for each terminal value.

  test('shows the confirmed-paid state and hands off without a credential when ERP verify reports status:Paid', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        'erpLogin',
        JSON.stringify({ subdomain: 'acme', redirectTo: '' })
      );
    });

    await page.route('**/api/public/erp/verify*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: true, status: 'Paid' } }),
      });
    });

    const requests: Array<{ url: string; postData: string | null }> = [];
    page.on('request', (request) =>
      requests.push({ url: request.url(), postData: request.postData() })
    );

    await page.route('http://localhost:4200/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>erp-login-stub</body></html>',
      });
    });

    const handoffRequest = page.waitForRequest((request) =>
      request.url().includes('/auth/login')
    );

    await page.goto(
      '/payment/success?order=e2e-paid-ref&attempts=1&interval=50'
    );

    // Explicitly Paid renders the confirmed copy, not the "order received" one.
    await expect(
      page.getByText(/Payment Successful|تم الدفع بنجاح/i).first()
    ).toBeVisible();

    const enterSystem = page.getByRole('button', {
      name: /Enter System|الدخول إلى النظام/i,
    });
    await expect(enterSystem).toBeVisible();

    await enterSystem.click();

    const handoff = await handoffRequest;
    expect(handoff.method()).toBe('GET');
    expect(handoff.url()).not.toContain('token=');
    expect(requests.filter((r) => r.url.includes('token='))).toEqual([]);
    expect(
      requests.filter((r) => (r.postData ?? '').includes('token='))
    ).toEqual([]);
  });

  test('shows the pending state (no ERP CTA) when ERP verify reports status:Pending', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        'erpLogin',
        JSON.stringify({
          subdomain: 'acme',
          redirectTo: '',
        })
      );
    });

    await page.route('**/api/public/erp/verify*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: true, status: 'Pending' } }),
      });
    });

    await page.goto(
      '/payment/success?order=e2e-pending-ref&attempts=1&interval=50'
    );

    // Dedicated "processing" copy — distinct from the optimistic settle's
    // "order received" wording, which still belongs to the success panel.
    await expect(
      page.getByText(/Payment Processing|قيد المعالجة/i).first()
    ).toBeVisible();

    // An explicitly-pending payment must NOT offer the ERP login handoff —
    // the webhook is what activates the subscription.
    await expect(
      page.getByRole('button', {
        name: /Enter System|الدخول إلى النظام/i,
      })
    ).toHaveCount(0);

    await expect(
      page
        .getByRole('link', { name: /Back to Home|العودة إلى الرئيسية/i })
        .first()
    ).toBeVisible();
  });

  test('never claims success when ERP verify reports an unrecognised status', async ({
    page,
  }) => {
    // Seed the ERP login payload so that a WRONG optimistic settle would
    // render the handoff button — that is what makes this test discriminating
    // rather than a tautology.
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        'erpLogin',
        JSON.stringify({
          subdomain: 'acme',
          redirectTo: '',
        })
      );
    });

    await page.route('**/api/public/erp/verify*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        // `success: true` but a status value this kit does not understand:
        // a contract violation, not a confirmation.
        body: JSON.stringify({ data: { success: true, status: 'Succeeded' } }),
      });
    });

    await page.goto(
      '/payment/success?order=e2e-unknown-ref&attempts=1&interval=50'
    );

    // Honest pending terminal state.
    await expect(
      page.getByText(/Payment Processing|قيد المعالجة/i).first()
    ).toBeVisible();

    // Never the success panel...
    await expect(
      page.getByText(/Payment Successful|تم الدفع بنجاح/i)
    ).toHaveCount(0);

    // ...and never the ERP login handoff: an unrecognised status must not hand
    // over a token for a subscription that is not confirmed as active.
    await expect(
      page.getByRole('button', {
        name: /Enter System|الدخول إلى النظام/i,
      })
    ).toHaveCount(0);

    // Nor may it be misrouted to the failure page.
    await expect(page).toHaveURL(/\/payment\/success/);
  });

  test('treats a blank ERP status as pre-rollout and keeps the optimistic settle', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        'erpLogin',
        JSON.stringify({
          subdomain: 'acme',
          redirectTo: '',
        })
      );
    });

    await page.route('**/api/public/erp/verify*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: true, status: '' } }),
      });
    });

    await page.goto(
      '/payment/success?order=e2e-blank-status-ref&attempts=1&interval=50'
    );

    // A blank status means "no status": the PR #59 optimistic path still
    // applies, so this is a success panel with the handoff CTA — proving that
    // `blank` and `unrecognised` are handled differently.
    await expect(
      page.getByText(/Payment Order Received|تم استلام طلب الدفع/i).first()
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Enter System|الدخول إلى النظام/i })
    ).toBeVisible();
  });

  test('redirects to the failed page when ERP verify reports status:Failed', async ({
    page,
  }) => {
    await page.route('**/api/public/erp/verify*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: true, status: 'Failed' } }),
      });
    });

    await page.goto(
      '/payment/success?order=e2e-status-failed-ref&attempts=3&interval=50'
    );

    await page.waitForURL(/\/payment\/failed/);
    await expect(
      page.getByText(/Payment Failed|فشل الدفع/i).first()
    ).toBeVisible();
  });

  // F-C: a non-2xx verify response hides two different failure classes. A
  // client-side rejection is permanent; an infrastructure failure is not. The
  // four cases below pin the split, because collapsing them (as an earlier
  // revision did) dead-ended a customer who had already paid.

  test('a transient 503 with a JSON body does NOT dead-end the user on the error panel', async ({
    page,
  }) => {
    // A BFF/proxied-ERP outage during the poll window says nothing about the
    // payment. It must fall through to the normal poll path and settle
    // optimistically, not strand someone who may well have paid.
    await page.route('**/api/public/erp/verify*', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'erp-unavailable' } }),
      })
    );

    await page.goto(
      '/payment/success?order=e2e-503-json-ref&attempts=1&interval=50'
    );

    await expect(
      page.getByText(/Payment Order Received|تم استلام طلب الدفع/i).first()
    ).toBeVisible();
    await expect(
      page.getByText(/Unable to Verify Payment|تعذر التحقق من الدفع/i)
    ).toHaveCount(0);
  });

  test('a transient 503 with a NON-JSON (HTML) body is also not dead-ended', async ({
    page,
  }) => {
    // The subtler half of the same regression: parsing the body of every
    // response meant an HTML/empty gateway error page threw inside
    // `res.json()`, landing the user on the error panel even though the
    // payment was never refused.
    await page.route('**/api/public/erp/verify*', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'text/html',
        body: '<html><body>503 Service Unavailable</body></html>',
      })
    );

    await page.goto(
      '/payment/success?order=e2e-503-html-ref&attempts=1&interval=50'
    );

    await expect(
      page.getByText(/Payment Order Received|تم استلام طلب الدفع/i).first()
    ).toBeVisible();
    await expect(
      page.getByText(/Unable to Verify Payment|تعذر التحقق من الدفع/i)
    ).toHaveCount(0);
  });

  test('a genuine client-side rejection (400 with a JSON body) stays a hard error', async ({
    page,
  }) => {
    // The other half of the split: a bad/unknown reference can never become
    // valid by retrying, so it must NOT be papered over with the reassuring
    // settle. This is what proves the split actually splits.
    await page.route('**/api/public/erp/verify*', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'missing-reference' } }),
      })
    );

    await page.goto(
      '/payment/success?order=e2e-400-ref&attempts=1&interval=50'
    );

    await expect(
      page.getByText(/Unable to Verify Payment|تعذر التحقق من الدفع/i).first()
    ).toBeVisible();
    await expect(
      page.getByText(/Payment Order Received|تم استلام طلب الدفع/i)
    ).toHaveCount(0);
  });

  test('a rate-limited (429) poll is transient, not a hard error', async ({
    page,
  }) => {
    // The rate limiter firing during the poll window is an infrastructure
    // condition, not a statement about the payment: same treatment as a 5xx.
    await page.route('**/api/public/erp/verify*', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'too-many-requests' } }),
      })
    );

    await page.goto(
      '/payment/success?order=e2e-429-ref&attempts=1&interval=50'
    );

    await expect(
      page.getByText(/Payment Order Received|تم استلام طلب الدفع/i).first()
    ).toBeVisible();
    await expect(
      page.getByText(/Unable to Verify Payment|تعذر التحقق من الدفع/i)
    ).toHaveCount(0);
  });
});
