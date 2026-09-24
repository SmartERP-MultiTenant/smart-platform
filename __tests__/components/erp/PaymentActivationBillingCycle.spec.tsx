/**
 * The billing-cycle toggle is gated by the yearly-billing switch (PG-31).
 *
 * Production already carries three ACTIVE packages with yearly prices, so the
 * moment this code ships the toggle would render and an annual order would look
 * purchasable — while the ERP cannot yet honour a billing cycle. Hiding the
 * control is the client half of a fail-closed switch, and it is asserted here
 * against the REAL component rather than a hand-built one: the spec proves both
 * that the toggle is absent while the switch is off AND that the request the
 * component still sends asks for the monthly cycle.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PaymentActivation } from '@/components/erp/PaymentActivation';

jest.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('next/router', () => ({
  useRouter: () => ({ locale: 'ar', replace: jest.fn() }),
}));

const PACKAGE_ID = 'pkg-growth';
const YEARLY_PKG = {
  id: PACKAGE_ID,
  name: 'Growth',
  priceMonthly: 199,
  priceYearly: 1990,
};
const METHODS = [
  { key: 'card', label: 'بطاقة مدى', provider: 'moyasar', available: true },
];
const GATEWAY_URL = 'https://api.moyasar.com/v1/payments/redirect';

const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const mockFetch = jest.fn();

/** The body the component sent to `/api/public/erp/orders`. */
let ordersBody: Record<string, unknown> | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  ordersBody = null;

  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const target = String(url);

    if (target === '/api/public/erp/packages') {
      return jsonResponse({ data: [YEARLY_PKG] });
    }
    if (target === '/api/public/erp/methods') {
      return jsonResponse({ data: METHODS });
    }
    if (target === '/api/public/erp/orders') {
      ordersBody = JSON.parse(String(init?.body));
      return jsonResponse({
        data: {
          orderReference: 'ord_0123456789abcdef0123456789abcdef',
          amount: 199,
          currency: 'SAR',
          packageId: PACKAGE_ID,
          packageName: 'Growth',
          billingCycle: 'monthly',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          intent: 'intent-token',
        },
      });
    }
    if (target === '/api/public/erp/payments') {
      return jsonResponse({ data: { paymentUrl: GATEWAY_URL } });
    }

    throw new Error(`unexpected fetch: ${target}`);
  });

  global.fetch = mockFetch as unknown as typeof fetch;
});

const renderActivation = async (yearlyBillingEnabled?: boolean) => {
  render(
    <PaymentActivation
      companyName="Acme"
      customerEmail="buyer@example.com"
      packageId={PACKAGE_ID}
      yearlyBillingEnabled={yearlyBillingEnabled}
    />
  );

  // The method chips are the signal that the package loaded: the component
  // renders `null` until the catalogue answers with a priced package.
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /بطاقة مدى/ })
    ).toBeInTheDocument()
  );
};

const monthlyButton = () =>
  screen.queryByRole('button', { name: 'erp-payment-cycle-monthly' });
const yearlyButton = () =>
  screen.queryByRole('button', { name: 'erp-payment-cycle-yearly' });

describe('PaymentActivation billing-cycle toggle (PG-31)', () => {
  it('renders NO toggle when the switch is off, even though the package has a yearly price', async () => {
    await renderActivation(false);

    expect(monthlyButton()).toBeNull();
    expect(yearlyButton()).toBeNull();
  });

  it('renders NO toggle when the caller does not pass the switch at all', async () => {
    // The fail-closed default: a caller that forgets the prop must get no annual
    // option, never a purchasable one.
    await renderActivation();

    expect(yearlyButton()).toBeNull();
  });

  it('still asks for the MONTHLY cycle while the switch is off', async () => {
    await renderActivation(false);

    fireEvent.click(screen.getByRole('button', { name: /بطاقة مدى/ }));
    await waitFor(() => expect(ordersBody).not.toBeNull());

    expect(ordersBody!.billingCycle).toBe('monthly');
  });

  it('renders both cycles when the switch is on', async () => {
    await renderActivation(true);

    expect(monthlyButton()).toHaveAttribute('aria-pressed', 'true');
    expect(yearlyButton()).toHaveAttribute('aria-pressed', 'false');
  });

  it('prices and asks for the yearly cycle when the switch is on', async () => {
    await renderActivation(true);

    fireEvent.click(yearlyButton()!);

    expect(
      screen.getByText('erp-payment-pkg-summary-yearly')
    ).toBeInTheDocument();
    expect(yearlyButton()).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /بطاقة مدى/ }));
    await waitFor(() => expect(ordersBody).not.toBeNull());

    // The server refuses a yearly order regardless of what is rendered here, so
    // the request must carry the cycle the customer actually selected.
    expect(ordersBody!.billingCycle).toBe('yearly');
  });

  it('shows the MONTHLY summary while the switch is off', async () => {
    await renderActivation(false);

    expect(screen.getByText('erp-payment-pkg-summary')).toBeInTheDocument();
    expect(screen.queryByText('erp-payment-pkg-summary-yearly')).toBeNull();
  });
});
