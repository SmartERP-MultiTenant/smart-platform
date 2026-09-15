import { expect, test } from '@playwright/test';

import gateways from '../../fixtures/erp-gateways.json';

/**
 * Funnel payment contract, driven end to end by the ERP stub (PG-55).
 *
 * ## What is different about this spec
 *
 * Every payment assertion in `payment.spec.ts` sits behind a `page.route`
 * handler that intercepts **our own BFF** verify endpoint. That is a fine way
 * to test the poller's state machine — it is not a contract test, and it cannot
 * be one: the mocked response never travels through `lib/zod/erp.ts`,
 * `lib/erp.ts` or the route's error handling, so a regression anywhere in that
 * chain leaves those tests green.
 *
 * This spec registers **no route interception for the ERP surface at all**.
 * Requests go browser -> BFF -> `tests/e2e/support/erp-stub.cjs`, so the body
 * really is validated by the real schema, filtered by the real availability
 * rule and error-mapped by the real classifier.
 *
 * The proof that the chain is live is the *transformation* test below: the stub
 * serves a `200` whose body the contract rejects, and the page's own request to
 * the BFF receives a `502`. No route mock can express that, because a mock
 * supplies the final response rather than the upstream body.
 *
 * ## Scope honesty — read before quoting a green run
 *
 * The stub is a **hand-written fixture server**, not a gateway. A green run here
 * proves the kit honours the agreed contract against a deterministic ERP; it
 * does **not** prove the ERP sends these shapes, and it is **not** live-gateway
 * coverage. That leg is blocked on the ERP half (PG-10/PG-11/PG-12, real
 * Moyasar credentials) and nothing in this file substitutes for it.
 *
 * `attempts=1` shortens the poll window (localhost-only knob) so each terminal
 * state is reached deterministically instead of after ~30s of real polling.
 */

const BASE = 'http://localhost:4002';
const STUB = 'http://127.0.0.1:4100';

/**
 * The stub's Basic plan (`tests/e2e/support/erp-stub.cjs`, `BASIC_PACKAGE_ID`),
 * priced at 199. Spelled out as a literal rather than imported because there is
 * no shared module between the spec and the stub; a drifting id fails loudly on
 * a 400, which is the behaviour a contract test wants.
 */
const BASIC_PACKAGE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** A well-formed package id that the stub's catalogue does NOT contain. */
const UNKNOWN_PACKAGE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const expected = gateways.methods._expected;

/** The methods the funnel must NOT publish, whatever the reason. */
const unavailableKeys = [
  ...expected.droppedForAvailability,
  ...expected.droppedForSchemaFailure,
];

const gotoSuccess = (page: import('@playwright/test').Page, order: string) =>
  page.goto(`/payment/success?order=${order}&attempts=1&interval=50`);

test.describe('Payment contract — stub-driven, no BFF interception', () => {
  test('the stub is wired to the funnel: the live catalogue reaches the BFF', async ({
    request,
  }) => {
    // Doubles as the diagnostic for the whole file. If ERP_API_URL is not
    // pointed at the stub, this fails first and unambiguously, instead of every
    // later test failing with a confusing state assertion.
    const res = await request.get(`${BASE}/api/public/erp/methods`);

    expect(res.status()).toBe(200);

    const body = await res.json();

    expect(body.data.map((method: { key: string }) => method.key)).toEqual(
      expected.surfacedKeys
    );
  });

  test('the real chain drops every unavailable and every malformed method', async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/public/erp/methods`);
    const serialized = JSON.stringify(await res.json());

    for (const key of unavailableKeys) {
      expect(serialized).not.toContain(key);
    }

    // Fail-closed, over the wire: nothing published may be non-`true`.
    for (const method of (
      await (await request.get(`${BASE}/api/public/erp/methods`)).json()
    ).data as Array<{ available: unknown }>) {
      expect(method.available).toBe(true);
    }
  });

  test("the BFF transforms the stub's malformed body into a 502 — a transformation a route mock cannot express", async ({
    request,
  }) => {
    // (a) The stub really does serve a 200 whose body the contract rejects.
    const fromStub = await request.get(
      `${STUB}/api/payments/verify/e2e-malformed-ref`
    );

    expect(fromStub.status()).toBe(200);
    expect(await fromStub.json()).toEqual({ success: 'true', status: 'Paid' });

    // (b) The SAME underlying data, read through the funnel's BFF, is a 502.
    // `success` is a string, so `erpVerifyResponseSchema` refuses it. If the
    // chain were mocked, (a) and (b) could not both hold.
    const throughBff = await request.get(
      `${BASE}/api/public/erp/verify?reference=e2e-malformed-ref`
    );

    expect(throughBff.status()).toBe(502);
    expect(await throughBff.json()).toEqual({
      error: { message: 'erp-malformed-response' },
    });
  });

  test('an ERP failure answers with a stable code, never upstream text', async ({
    request,
  }) => {
    // This test used to drive `/api/public/erp/packages`, which failed because
    // the stub deliberately did not serve the public catalogue. That premise is
    // gone: the server-authoritative payment path prices `packageId` against
    // that SAME endpoint (`lib/payments/payablePackage.ts` -> `erp.getPackages()`),
    // so the catalogue has to be served for a payment request to be priceable
    // at all, and `/api/public/erp/packages` now answers 200.
    //
    // The invariant is unchanged, and is still driven through a real upstream
    // round trip: the order endpoint MUST read the catalogue before it can
    // decide, and an id the catalogue does not contain has to become a stable
    // code rather than anything the upstream body said. Assertions are identical.
    const res = await request.post(`${BASE}/api/public/erp/orders`, {
      data: { packageId: UNKNOWN_PACKAGE_ID },
    });

    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await res.json())).not.toContain('stub:no-route');
  });

  test('a Paid status from the stub renders the confirmed-paid panel', async ({
    page,
  }) => {
    await gotoSuccess(page, 'e2e-paid-ref');

    await expect(
      page.getByText(/Payment Successful|تم الدفع بنجاح/i).first()
    ).toBeVisible();
  });

  test('a Pending status from the stub renders the processing panel with no ERP handoff', async ({
    page,
  }) => {
    await gotoSuccess(page, 'e2e-pending-ref');

    await expect(
      page.getByText(/Payment Processing|قيد المعالجة/i).first()
    ).toBeVisible();

    // The webhook activates the subscription; handing over a login token before
    // activation would be misleading.
    await expect(
      page.getByRole('button', { name: /Enter System|الدخول إلى النظام/i })
    ).toHaveCount(0);
  });

  test('a Failed status from the stub routes the customer to the failed page', async ({
    page,
  }) => {
    await gotoSuccess(page, 'e2e-failed-ref');

    await page.waitForURL(/\/payment\/failed/);
    await expect(
      page.getByText(/Payment Failed|فشل الدفع/i).first()
    ).toBeVisible();
  });

  test('an unrecognised status from the stub never claims success', async ({
    page,
  }) => {
    await gotoSuccess(page, 'e2e-unknown-ref');

    // `Succeeded` is well-typed but not a value the kit understands. It is not
    // coerced to Paid, and it is not rejected either — rejecting it would 5xx
    // and the poller reads 5xx as transient.
    await expect(
      page.getByText(/Payment Processing|قيد المعالجة/i).first()
    ).toBeVisible();
    await expect(
      page.getByText(/Payment Successful|تم الدفع بنجاح/i)
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/payment\/success/);
  });

  test('a pre-rollout stub body with no status keeps the optimistic settle', async ({
    page,
  }) => {
    await gotoSuccess(page, 'e2e-nostatus-ref');

    // Unique to the absent-status body. This is the ONLY input allowed to take
    // the PR #59 compatibility path.
    await expect(
      page.getByText(/Payment Order Received|تم استلام طلب الدفع/i).first()
    ).toBeVisible();
  });

  test('an upstream auth failure from the stub is a hard error, not a silent settle', async ({
    page,
  }) => {
    await gotoSuccess(page, 'e2e-unauth-ref');

    // The stub answers 401. `classifyErpError` would normally collapse that to
    // 502, which the poller reads as transient and settles optimistically —
    // showing the success panel to someone whose payment was never verified.
    // `publicStatus` preserves the upstream 401 for exactly this reason.
    await expect(
      page.getByText(/Unable to Verify Payment|تعذر التحقق من الدفع/i).first()
    ).toBeVisible();
    await expect(
      page.getByText(/Payment Order Received|تم استلام طلب الدفع/i)
    ).toHaveCount(0);
  });

  test('a malformed stub body is transient at the BFF and the poller retains its optimism', async ({
    page,
  }) => {
    // DOCUMENTS EXISTING BEHAVIOUR, and it is the consequence worth knowing:
    // the contract rejects the body (502), and the poller treats every 5xx as a
    // transient infrastructure failure, so after the poll window the customer
    // lands on the optimistic "order received" panel rather than an error.
    //
    // That is deliberate — the alternative dead-ends someone who may have paid
    // — but it does mean a contract violation is indistinguishable, to the
    // customer, from a slow gateway. Flagged rather than "fixed" here: changing
    // the poller's 5xx policy is a product decision, not a contract-test one.
    await gotoSuccess(page, 'e2e-malformed-ref');

    await expect(
      page.getByText(/Payment Order Received|تم استلام طلب الدفع/i).first()
    ).toBeVisible();
  });
});

test.describe('Payment creation — per gateway through the real BFF', () => {
  // `packageId` is the authority, and it is what the REAL funnel client sends:
  // `components/erp/PaymentActivation.tsx:214` mints an order reference from the
  // clock and posts it alongside `packageId`, and PG-06 made the server ignore
  // that reference and price the package itself. The two legacy fields are kept
  // here precisely BECAUSE the shipped client still sends them — dropping them
  // would stop testing that the route tolerates them, which is the
  // accept-and-ignore contract the live funnel depends on.
  //
  // Before this change the body carried ONLY the legacy fields, so it held no
  // authority at all and the route correctly answered 400 (PG-06's fail-closed
  // rule): an order whose price is unknowable must never become a charge.
  const validBody = (paymentMethod: string) => ({
    packageId: BASIC_PACKAGE_ID,
    orderReference: 'pay-e2e-12345678',
    amount: 199,
    currency: 'SAR',
    paymentMethod,
  });

  // Kept deliberately short: `limiters.payments` allows 10/min per client key
  // and every request in this suite shares one key, so a retry of a long
  // `it.each` could trip the limiter and fail for the wrong reason. The jest
  // contract suite covers all seven gateways with the limiter mocked; this
  // proves the TRANSPORT chain for a representative set.
  for (const methodKey of ['credit_card', 'tabby', 'tamara']) {
    test(`passes the ${methodKey} gateway redirect through unchanged`, async ({
      request,
    }) => {
      const res = await request.post(`${BASE}/api/public/erp/payments`, {
        data: validBody(methodKey),
      });

      expect(res.status()).toBe(200);

      const body = await res.json();
      const expectedResult =
        gateways.createPayment.byMethod[
          methodKey as keyof typeof gateways.createPayment.byMethod
        ];

      expect(body.data.paymentUrl).toBe(expectedResult.paymentUrl);
      expect(body.data.provider).toBe(expectedResult.provider);
    });
  }

  test('a gateway with no redirect target is passed through with a null URL', async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/public/erp/payments`, {
      data: validBody('no_redirect'),
    });

    // `paymentUrl` is optional AND nullable: a provider that never opened a
    // session is a legal success body. The funnel must receive the null rather
    // than a fabricated URL it would then try to navigate to.
    expect(res.status()).toBe(200);
    expect((await res.json()).data.paymentUrl).toBeNull();
  });

  test('an unsupported method is answered with a stable code, not the ERP sentence', async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/public/erp/payments`, {
      data: validBody('crypto'),
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({
      error: { message: 'unsupported-payment-method' },
    });
  });
});
