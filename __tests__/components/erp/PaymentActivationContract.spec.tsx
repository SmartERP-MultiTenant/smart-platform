/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost:4002/"}
 *
 * The regression guard for a DEAD PAID FUNNEL (PG-06).
 *
 * ## What went wrong, and why nothing caught it
 *
 * `pages/api/public/erp/payments.ts` was made server-authoritative: it can only
 * price an order from `intent` or `packageId`, and answers 400 when it has
 * neither. The component that is the route's ONLY shipped caller was never
 * updated — it kept posting a client-minted `orderReference` and a client-read
 * `amount`, with no `packageId` and no `intent`. Every click on a payment chip
 * would have returned "some order details are invalid".
 *
 * It survived 1454 unit tests and 181 e2e tests because **no test put the two
 * halves together**: the component spec mocked `fetch`, so it asserted against a
 * hand-written body; the route spec hand-built bodies, so it asserted against a
 * body the component never sends; and the e2e funnel spec never clicked a method
 * chip on the real route. Each half was green against its own fiction.
 *
 * ## What this file does differently
 *
 * It renders the REAL component, captures the body the component ACTUALLY sends,
 * and feeds that exact body through the REAL route handler. The two halves can no
 * longer disagree without failing here.
 *
 * The callback origin is pinned to `http://localhost:4002` via
 * `@jest-environment-options` so jsdom's `window.location.origin` matches the
 * `APP_URL` the route validates callbacks against. If `APP_URL` ever changes,
 * the callback assertion below fails with a clear message rather than a
 * mysterious 400.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PaymentActivation } from '@/components/erp/PaymentActivation';
import ordersHandler from 'pages/api/public/erp/orders';
import paymentsHandler from 'pages/api/public/erp/payments';

jest.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('next/router', () => ({
  useRouter: () => ({ locale: 'ar', replace: jest.fn() }),
}));

jest.mock('@/lib/rateLimit', () => ({
  clientKey: jest.fn(() => 'contract-test-client'),
  limiters: {
    catalog: { allow: jest.fn(() => true) },
    verify: { allow: jest.fn(() => true) },
    payments: { allow: jest.fn(() => true) },
  },
}));

/**
 * Deliberately NOT a UUID.
 *
 * This is the id shape the catalogue reader accepts (`erpPackageSchema.id` is a
 * free-form string) and the shape BOTH write paths used to reject. Driving the
 * whole flow with it proves the read and write contracts agree end to end —
 * which is the m1 fix — instead of hiding the divergence behind a UUID fixture.
 */
const PACKAGE_ID = 'pkg-growth';
const PKG = { id: PACKAGE_ID, name: 'Growth', priceMonthly: 199 };
const GATEWAY_URL = 'https://api.moyasar.com/v1/payments/redirect';

const METHODS = [
  { key: 'card', label: 'بطاقة مدى', provider: 'moyasar', available: true },
];

const CATALOGUE = [{ ...PKG, priceMonthly: 199, isActive: true }];

const expectAppOrigin = () => {
  const appOrigin = new URL(process.env.APP_URL as string).origin;
  // This spec pins the jsdom origin to APP_URL so the route accepts the
  // callback. If APP_URL changes, this fails here rather than as a mystery 400.
  expect(window.location.origin).toBe(appOrigin);
};

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: async () => body,
});

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, string>,
    setHeader: jest.fn((key: string, value: string) => {
      res.headers[key] = value;
    }),
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((data: unknown) => {
      res.body = data;
      return res;
    }),
    end: jest.fn(),
  } as any;

  return res;
};

const createMockReq = (over: Record<string, unknown> = {}) =>
  ({ method: 'POST', headers: {}, body: {}, ...over }) as any;

const mockFetch = jest.fn();

/** The body the component actually sent to `/api/public/erp/payments`. */
let capturedPaymentBody: Record<string, unknown> | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
  capturedPaymentBody = null;

  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const target = String(url);

    // ── The BFF routes the component calls ────────────────────────────────
    // Matched FIRST: the ERP branch below keys on a path suffix these share.
    if (target === '/api/public/erp/packages') {
      return jsonResponse({ data: [PKG] });
    }
    if (target === '/api/public/erp/methods') {
      return jsonResponse({ data: METHODS });
    }
    if (target === '/api/public/erp/orders') {
      // Driven through the REAL handler, so the intent the component receives is
      // genuinely signed and the real payment route will accept it.
      const res = createMockRes();
      await ordersHandler(
        createMockReq({ body: JSON.parse(String(init?.body)) }),
        res
      );
      return {
        ok: res.statusCode < 400,
        status: res.statusCode,
        json: async () => res.body,
      };
    }
    if (target === '/api/public/erp/payments') {
      capturedPaymentBody = JSON.parse(String(init?.body));
      return jsonResponse({ data: { paymentUrl: GATEWAY_URL } });
    }

    // ── The ERP, as reached by the handlers ───────────────────────────────
    if (target.includes('/platform/TenantRegistration/catalog/packages')) {
      // A bare array: `readErpList` fails the request on a non-array envelope.
      return jsonResponse(CATALOGUE);
    }
    if (target.endsWith('/payments')) {
      return jsonResponse({
        paymentUrl: GATEWAY_URL,
        externalId: 'ext-1',
        provider: 'moyasar',
        status: 'initiated',
      });
    }

    throw new Error(`unexpected fetch: ${target}`);
  });

  global.fetch = mockFetch as unknown as typeof fetch;
});

const renderPicker = async () => {
  render(
    <PaymentActivation
      companyName="Acme"
      customerEmail="buyer@example.com"
      packageId={PACKAGE_ID}
    />
  );

  await waitFor(() => expect(screen.getByRole('group')).toBeInTheDocument());

  return screen.getByRole('group');
};

describe('the shipped funnel body is payable by the real route', () => {
  it('sends a body the REAL route accepts — the guard for the dead paid funnel', async () => {
    expectAppOrigin();

    await renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /بطاقة مدى/ }));

    // The component's own submission has to complete first.
    await waitFor(() => expect(capturedPaymentBody).not.toBeNull());

    const componentBody = capturedPaymentBody!;

    // The two fields whose absence was the outage. Asserted explicitly so a
    // future refactor that drops one fails HERE with a readable reason:
    // without either, the route cannot price the request at all.
    expect(componentBody.packageId).toBe(PACKAGE_ID);
    expect(typeof componentBody.intent).toBe('string');
    expect((componentBody.intent as string).length).toBeGreaterThan(0);

    // …and no client-minted price authority survived.
    expect(componentBody.orderReference).toBeUndefined();
    expect(componentBody.amount).toBeUndefined();

    // The decisive step: feed EXACTLY that body to the REAL route.
    const res = createMockRes();
    await paymentsHandler(createMockReq({ body: componentBody }), res);

    // 400 here means the route REFUSED the body the component sends — the dead
    // paid funnel, caught in-process instead of in production.
    expect(res.statusCode).toBe(200);

    // It priced the SERVER's terms, not anything the component asserted.
    expect(res.body.data.paymentUrl).toBe(GATEWAY_URL);
  });

  it('still refuses the pre-PG-06 body, so the fix sends authority rather than loosening the route', async () => {
    const res = createMockRes();

    // Verbatim what the component used to send.
    await paymentsHandler(
      createMockReq({
        body: {
          orderReference: 'pay-pkg-grow-1757000000000',
          amount: 1,
          currency: 'SAR',
          paymentMethod: 'card',
          customerName: 'Acme',
          customerEmail: 'buyer@example.com',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: { message: 'invalid-request' } });
  });

  it('records the SERVER reference in the in-flight marker, so the receipt can resolve', async () => {
    await renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /بطاقة مدى/ }));

    await waitFor(() =>
      expect(window.sessionStorage.getItem('erpPaymentInFlight')).not.toBeNull()
    );

    const marker = JSON.parse(
      window.sessionStorage.getItem('erpPaymentInFlight') as string
    );

    // Not a `pay-…` value this component invented: the reference the gateway
    // callback URL will actually carry back, which is what `success.tsx` matches
    // on exactly.
    expect(marker.orderReference).toMatch(/^ord_/);
    expect(marker.orderReference).not.toMatch(/^pay-/);
    expect(marker.packageId).toBe(PACKAGE_ID);
  });
});
