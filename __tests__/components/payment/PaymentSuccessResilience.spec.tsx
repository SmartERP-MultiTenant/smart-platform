/**
 * @jest-environment jsdom
 *
 * PG-24 — payment-result page resilience.
 *
 * Two behaviours are pinned here, both of which fail silently in production if
 * they regress: the poll loop must not spend its attempt budget while the tab
 * is hidden, and it must resume exactly once (never twice) when the customer
 * comes back. The resume/abandonment affordance is pinned alongside them.
 */
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PaymentSuccess from '../../../pages/payment/success';
import {
  PAYMENT_IN_FLIGHT_KEY,
  savePaymentInFlight,
} from '@/components/payment/paymentInFlight';

jest.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
const INTERVAL_MS = 1000;

let hidden = false;
const mockFetch = jest.fn();

const verifyCalls = () =>
  mockFetch.mock.calls.filter(([url]) =>
    String(url).startsWith('/api/public/erp/verify')
  ).length;

/** Renders the page and lets the mount-time `check()` settle. */
const mount = async (query: Record<string, string>) => {
  mockRouter.query = {
    order: ORDER,
    attempts: '5',
    interval: String(INTERVAL_MS),
    ...query,
  };

  await act(async () => {
    render(
      <PaymentSuccess
        erpClientUrl="http://localhost:4200"
        erpLoginPath="/auth/login"
        erpBaseDomain="smartapro.com"
      />
    );
  });
};

/** Advances fake timers and flushes the promises they resolve. */
const advance = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

const setHidden = async (value: boolean) => {
  hidden = value;
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

beforeAll(() => {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
});

beforeEach(() => {
  jest.useFakeTimers();
  hidden = false;
  window.sessionStorage.clear();
  mockRouter.replace.mockClear();
  mockFetch.mockReset();

  // `Pending` keeps the loop alive, so every fetch the page makes is a step the
  // test can count.
  mockFetch.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { success: true, status: 'Pending' } }),
  }));

  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('PG-24 — polling is parked while the tab is hidden', () => {
  it('keeps polling on the normal cadence while the tab is visible', async () => {
    await mount({});
    expect(verifyCalls()).toBe(1);

    await advance(INTERVAL_MS);
    expect(verifyCalls()).toBe(2);

    await advance(INTERVAL_MS);
    expect(verifyCalls()).toBe(3);
  });

  it('stops issuing requests once the tab goes hidden', async () => {
    await mount({});

    await setHidden(true);

    // One in-flight tick can still land (the timer was already armed before
    // the tab hid), after which the loop parks instead of rearming.
    await advance(INTERVAL_MS);
    const afterHide = verifyCalls();

    await advance(INTERVAL_MS * 20);
    expect(verifyCalls()).toBe(afterHide);
    expect(afterHide).toBeLessThan(4);
  });

  it('resumes on return without resetting the attempt budget', async () => {
    await mount({});

    await setHidden(true);
    await advance(INTERVAL_MS * 20);
    const parked = verifyCalls();

    await setHidden(false);

    // Exactly one further check per interval after resuming — proving the
    // parked window was not spent, but also that resuming did not flood.
    await advance(INTERVAL_MS);
    expect(verifyCalls()).toBe(parked + 1);

    await advance(INTERVAL_MS);
    expect(verifyCalls()).toBe(parked + 2);
  });

  it('does not double-fire when visibilitychange arrives while a check is already scheduled', async () => {
    await mount({});
    expect(verifyCalls()).toBe(1);

    // Already visible and already armed: a redundant event must not add a
    // second timer, which would double the request rate on every focus change.
    await setHidden(false);
    await setHidden(false);

    await advance(INTERVAL_MS);
    expect(verifyCalls()).toBe(2);
  });

  it('cannot resurrect a poll that already reached a terminal state', async () => {
    // A terminal `Paid` shortly after mount stops the loop for good.
    mockFetch.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { success: true, status: 'Paid' } }),
    }));

    await mount({});
    expect(
      screen.getByText('erp-payment-status-paid-title')
    ).toBeInTheDocument();

    const settled = verifyCalls();

    await setHidden(true);
    await setHidden(false);
    await advance(INTERVAL_MS * 10);

    expect(verifyCalls()).toBe(settled);
  });
});

describe('PG-24 — resume after refresh, back-navigation or abandonment', () => {
  beforeEach(() => {
    // These cases never need the poll loop to tick, so the timer stays parked.
    mockFetch.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { success: true, status: 'Pending' } }),
    }));
  });

  it('offers to resume a payment this tab left in flight', async () => {
    savePaymentInFlight({
      orderReference: ORDER,
      packageId: 'pkg-growth',
      methodKey: 'card',
      startedAt: new Date().toISOString(),
    });

    // No `order` in the URL: this is what a refresh mid-payment looks like.
    await mount({ order: '' });

    const resume = screen.getByRole('link', {
      name: 'erp-payment-resume-check',
    });

    expect(resume).toHaveAttribute(
      'href',
      `/payment/success?order=${encodeURIComponent(ORDER)}`
    );
    // It must not claim the payment could not be verified — the customer may
    // well have paid.
    expect(
      screen.queryByText('erp-payment-status-error-title')
    ).not.toBeInTheDocument();
  });

  it('still reports an unverifiable payment when there is no marker to resume', async () => {
    await mount({ order: '' });

    expect(
      screen.getByText('erp-payment-status-error-title')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'erp-payment-resume-check' })
    ).not.toBeInTheDocument();
  });

  it('clears the marker once the URL carries the reference', async () => {
    savePaymentInFlight({
      orderReference: ORDER,
      packageId: 'pkg-growth',
      methodKey: 'card',
      startedAt: new Date().toISOString(),
    });

    await mount({});

    // The query string is the source of truth, so the session copy is retired
    // rather than allowed to outlive the gap it exists to bridge.
    expect(window.sessionStorage.getItem(PAYMENT_IN_FLIGHT_KEY)).toBeNull();
  });

  it('keeps a marker that belongs to a different order', async () => {
    savePaymentInFlight({
      orderReference: 'pay-someone-else',
      packageId: 'pkg-growth',
      methodKey: 'card',
      startedAt: new Date().toISOString(),
    });

    await mount({});

    expect(window.sessionStorage.getItem(PAYMENT_IN_FLIGHT_KEY)).not.toBeNull();
  });
});
