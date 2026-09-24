/**
 * @jest-environment jsdom
 *
 * PG-23 — the receipt's data provenance.
 *
 * The receipt can only name a package if the order's recorded `packageId`
 * survives the trip through the gateway. These tests pin the two rules that
 * make that safe:
 *
 *  1. the recorded id is used ONLY when it belongs to the exact order being
 *     displayed — otherwise the receipt would name a different attempt's
 *     package; and
 *  2. every way the catalogue can fail (unreadable body, unknown id, network
 *     error) degrades to "no package row" rather than to a wrong or empty one.
 *
 * Plus the failed page's next action, which the copy had been promising
 * ("you can try again from the pricing page") without ever linking to it.
 */
import { act, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import PaymentSuccess from '../../../pages/payment/success';
import PaymentFailed from '../../../pages/payment/failed';
import {
  savePaymentInFlight,
  PAYMENT_IN_FLIGHT_KEY,
} from '../../../components/payment/paymentInFlight';
import mockEn from '../../../locales/en/common.json';

jest.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      let out: string = (mockEn as Record<string, string>)[key] ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          out = out.split(`{{${name}}}`).join(String(value));
        }
      }
      return out;
    },
  }),
}));

jest.mock('next-i18next/serverSideTranslations', () => ({
  serverSideTranslations: jest.fn(async () => ({})),
}));

const mockRouter: {
  query: Record<string, string>;
  replace: jest.Mock;
  locale: string;
} = { query: {}, replace: jest.fn(), locale: 'en' };

jest.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('@/components/layouts', () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@/components/shared/SEO', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/lib/env', () => ({
  __esModule: true,
  default: {
    erp: {
      clientUrl: 'http://localhost:4200',
      clientLoginPath: '/auth/login',
      baseDomain: 'smartapro.com',
    },
  },
}));

const ORDER = 'pay-abc12345-1757851200000';
const mockFetch = jest.fn();

/** A catalogue row shaped like the public `/packages` BFF response. */
const CATALOGUE = {
  data: [
    { id: 'pkg-gold', name: 'Gold', priceMonthly: 500, priceYearly: 5000 },
    { id: 'pkg-silver', name: 'Silver', priceMonthly: 250, priceYearly: 2500 },
  ],
};

const renderSuccess = async () => {
  await act(async () => {
    render(
      <PaymentSuccess
        erpClientUrl="http://localhost:4200"
        erpLoginPath="/auth/login"
        erpBaseDomain="smartapro.com"
      />
    );
  });
  // Let the receipt's catalogue fetch settle.
  await act(async () => {});
};

beforeEach(() => {
  window.sessionStorage.clear();
  mockRouter.replace.mockClear();
  mockFetch.mockReset();
  // Every verify settles on Paid immediately — the receipt must not depend on
  // which terminal state the poll reached.
  mockFetch.mockImplementation(async (url: string) => {
    if (String(url).startsWith('/api/public/erp/packages')) {
      return { ok: true, status: 200, json: async () => CATALOGUE };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { success: true, status: 'Paid' } }),
    };
  });
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe('PG-23 — the success page resolves the ordered package', () => {
  it('names the package and price recorded for this exact order', async () => {
    savePaymentInFlight({
      orderReference: ORDER,
      packageId: 'pkg-gold',
      methodKey: 'mada',
      startedAt: new Date().toISOString(),
    });
    mockRouter.query = { order: ORDER, attempts: '1', interval: '10' };

    await renderSuccess();

    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('500 SAR / month')).toBeInTheDocument();
    expect(screen.getByTestId('receipt-order-reference')).toHaveTextContent(
      ORDER
    );
  });

  it('ignores a recorded record that belongs to a different order', async () => {
    // The customer started a second attempt; only one record survives. Showing
    // its package against the first order's reference would be a false receipt.
    savePaymentInFlight({
      orderReference: 'pay-different-1757851200000',
      packageId: 'pkg-gold',
      methodKey: 'mada',
      startedAt: new Date().toISOString(),
    });
    mockRouter.query = { order: ORDER, attempts: '1', interval: '10' };

    await renderSuccess();

    expect(screen.getByTestId('receipt-order-reference')).toHaveTextContent(
      ORDER
    );
    expect(screen.queryByText('Package')).not.toBeInTheDocument();
    expect(screen.queryByText('Gold')).not.toBeInTheDocument();
    // And the catalogue was never even consulted.
    expect(
      mockFetch.mock.calls.filter(([url]) =>
        String(url).startsWith('/api/public/erp/packages')
      )
    ).toHaveLength(0);
  });

  it('falls back to the order reference alone when no package was recorded', async () => {
    mockRouter.query = { order: ORDER, attempts: '1', interval: '10' };

    await renderSuccess();

    expect(screen.getByTestId('receipt-order-reference')).toHaveTextContent(
      ORDER
    );
    expect(screen.queryByText('Package')).not.toBeInTheDocument();
    expect(screen.queryByText('Amount')).not.toBeInTheDocument();
  });

  it('omits the package rather than failing when the catalogue body is not a list', async () => {
    savePaymentInFlight({
      orderReference: ORDER,
      packageId: 'pkg-gold',
      methodKey: 'mada',
      startedAt: new Date().toISOString(),
    });
    mockRouter.query = { order: ORDER, attempts: '1', interval: '10' };
    mockFetch.mockImplementation(async () => ({
      ok: true,
      status: 200,
      // A malformed-but-parseable 200 — the shape P4.10b is about.
      json: async () => ({ data: { unexpected: true } }),
    }));

    await renderSuccess();

    expect(screen.getByTestId('receipt-order-reference')).toHaveTextContent(
      ORDER
    );
    expect(screen.queryByText('Package')).not.toBeInTheDocument();
  });

  it('omits the package when the recorded id is no longer in the catalogue', async () => {
    savePaymentInFlight({
      orderReference: ORDER,
      packageId: 'pkg-removed',
      methodKey: 'mada',
      startedAt: new Date().toISOString(),
    });
    mockRouter.query = { order: ORDER, attempts: '1', interval: '10' };

    await renderSuccess();

    expect(screen.queryByText('Package')).not.toBeInTheDocument();
    expect(screen.queryByText('Amount')).not.toBeInTheDocument();
  });

  it('never renders a placeholder when the catalogue request rejects', async () => {
    savePaymentInFlight({
      orderReference: ORDER,
      packageId: 'pkg-gold',
      methodKey: 'mada',
      startedAt: new Date().toISOString(),
    });
    mockRouter.query = { order: ORDER, attempts: '1', interval: '10' };
    // Only the catalogue read fails; the verify poll still settles on Paid, so
    // the page reaches its success state and the receipt is actually rendered.
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/public/erp/packages')) {
        throw new Error('network down');
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { success: true, status: 'Paid' } }),
      };
    });

    await renderSuccess();

    const receipt = screen.getByRole('region', { name: 'Order details' });
    expect(receipt).toBeInTheDocument();
    expect(within(receipt).queryByText('Amount')).not.toBeInTheDocument();
    expect(within(receipt).queryByText(/SAR \/ month/)).not.toBeInTheDocument();
  });
});

describe('PG-23 — the failed page offers a real next action', () => {
  const renderFailed = async () => {
    await act(async () => {
      render(<PaymentFailed />);
    });
  };

  it('links to the pricing page, which the copy already told the customer to use', async () => {
    mockRouter.query = { order: ORDER };

    await renderFailed();

    const retry = screen.getByRole('link', {
      name: 'Try again from the pricing page',
    });
    expect(retry).toHaveAttribute('href', '/pricing');
  });

  it('shows the reference so support can trace the failed attempt', async () => {
    mockRouter.query = { order: ORDER };

    await renderFailed();

    expect(screen.getByTestId('receipt-order-reference')).toHaveTextContent(
      ORDER
    );
  });

  it('does not render a tax block for a payment that never completed', async () => {
    mockRouter.query = { order: ORDER };

    await renderFailed();

    expect(screen.queryByText(/310428442600003/)).not.toBeInTheDocument();
  });

  it('renders no receipt when the URL carries no reference', async () => {
    mockRouter.query = {};

    await renderFailed();

    expect(screen.queryByText('Order details')).not.toBeInTheDocument();
    // The retry affordance is unconditional: it never depends on URL state.
    expect(
      screen.getByRole('link', { name: 'Try again from the pricing page' })
    ).toHaveAttribute('href', '/pricing');
  });
});

describe('PG-31 — the receipt states the amount that was charged, for the period it was charged', () => {
  /**
   * Writes a marker byte-for-byte as another client version would have, which
   * `savePaymentInFlight` cannot express once its record type is current: the
   * two fields under test here are exactly the ones an older or newer client
   * would omit or spell differently.
   */
  const writeRawMarker = (record: Record<string, unknown>) => {
    window.sessionStorage.setItem(
      PAYMENT_IN_FLIGHT_KEY,
      JSON.stringify({
        orderReference: ORDER,
        packageId: 'pkg-gold',
        methodKey: 'mada',
        startedAt: new Date().toISOString(),
        ...record,
      })
    );
  };

  it('prices and labels a yearly order from the yearly catalogue column', async () => {
    savePaymentInFlight({
      orderReference: ORDER,
      packageId: 'pkg-gold',
      methodKey: 'mada',
      startedAt: new Date().toISOString(),
      billingCycle: 'yearly',
    });
    mockRouter.query = { order: ORDER, attempts: '1', interval: '10' };

    await renderSuccess();

    expect(screen.getByText('5000 SAR / year')).toBeInTheDocument();
    // The defect this closes: a yearly charge printed under a per-month unit.
    expect(screen.queryByText(/SAR \/ month/)).not.toBeInTheDocument();
  });

  it('prefers the amount the server priced over the current catalogue price', async () => {
    savePaymentInFlight({
      orderReference: ORDER,
      packageId: 'pkg-gold',
      methodKey: 'mada',
      startedAt: new Date().toISOString(),
      billingCycle: 'yearly',
      amount: 4500,
    });
    mockRouter.query = { order: ORDER, attempts: '1', interval: '10' };

    await renderSuccess();

    // A catalogue edit between the order and the callback must not rewrite what
    // the customer was quoted.
    expect(screen.getByText('4500 SAR / year')).toBeInTheDocument();
    expect(screen.queryByText('5000 SAR / year')).not.toBeInTheDocument();
  });

  it('keeps a monthly order labelled monthly', async () => {
    savePaymentInFlight({
      orderReference: ORDER,
      packageId: 'pkg-gold',
      methodKey: 'mada',
      startedAt: new Date().toISOString(),
      billingCycle: 'monthly',
    });
    mockRouter.query = { order: ORDER, attempts: '1', interval: '10' };

    await renderSuccess();

    expect(screen.getByText('500 SAR / month')).toBeInTheDocument();
    expect(screen.queryByText(/SAR \/ year/)).not.toBeInTheDocument();
  });

  it('reads a marker written before the cycle work as monthly', async () => {
    // The upgrade path: a marker from the build that had no cycle at all. Every
    // order it could have recorded was priced monthly, so the amount is shown
    // rather than withheld.
    writeRawMarker({});
    mockRouter.query = { order: ORDER, attempts: '1', interval: '10' };

    await renderSuccess();

    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('500 SAR / month')).toBeInTheDocument();
  });

  it('omits the amount when the recorded period is one it cannot name', async () => {
    // A cycle this build does not know — e.g. a marker written by a future
    // client. The amount cannot be attributed to a period, so showing it under
    // either unit would state something the receipt cannot stand behind.
    writeRawMarker({ billingCycle: 'quarterly', amount: 4500 });
    mockRouter.query = { order: ORDER, attempts: '1', interval: '10' };

    await renderSuccess();

    const receipt = screen.getByRole('region', { name: 'Order details' });
    expect(within(receipt).getByText('Gold')).toBeInTheDocument();
    expect(within(receipt).queryByText('Amount')).not.toBeInTheDocument();
    expect(within(receipt).queryByText(/SAR \//)).not.toBeInTheDocument();
  });

  it('states a yearly charge on the pending panel too', async () => {
    savePaymentInFlight({
      orderReference: ORDER,
      packageId: 'pkg-gold',
      methodKey: 'mada',
      startedAt: new Date().toISOString(),
      billingCycle: 'yearly',
    });
    mockRouter.query = { order: ORDER, attempts: '1', interval: '10' };
    // The pending panel is a SECOND render site for the same receipt, so it can
    // regress independently of the success one.
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/public/erp/packages')) {
        return { ok: true, status: 200, json: async () => CATALOGUE };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { success: true, status: 'Pending' } }),
      };
    });

    await renderSuccess();

    expect(screen.getByText('5000 SAR / year')).toBeInTheDocument();
    expect(screen.queryByText(/SAR \/ month/)).not.toBeInTheDocument();
  });
});
