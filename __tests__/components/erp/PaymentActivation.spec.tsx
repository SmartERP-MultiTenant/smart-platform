/**
 * @jest-environment jsdom
 *
 * PG-21 — the payment method picker — and the two PG-24 client-side recovery
 * paths that live in the same component.
 *
 * The translator returns the key itself, so a rendered key-shaped string proves
 * the copy came through `t()` while a raw server string proves it did not.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PaymentActivation } from '@/components/erp/PaymentActivation';
import { PAYMENT_IN_FLIGHT_KEY } from '@/components/payment/paymentInFlight';

jest.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockRouter = { locale: 'ar', replace: jest.fn() };
jest.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

const PACKAGE_ID = 'pkg-growth';
const PKG = { id: PACKAGE_ID, name: 'Growth', priceMonthly: 199 };
const GATEWAY_URL = 'https://api.moyasar.com/v1/payments/redirect';

const METHODS = [
  {
    key: 'card',
    label: 'بطاقة مدى',
    provider: 'moyasar',
    available: true,
    iconUrl: 'https://erp.example.com/icons/mada.svg',
  },
  {
    key: 'tabby',
    label: 'Tabby',
    provider: 'tabby',
    available: false,
  },
];

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: async () => body,
});

const mockFetch = jest.fn();

/** Records every POSTed payment body so assertions can read the order reference. */
const paymentPosts = () =>
  mockFetch.mock.calls
    .filter(([url]) => url === '/api/public/erp/payments')
    .map(([, init]) => JSON.parse(init.body));

/**
 * The in-flight marker is written on the line immediately before
 * `window.location.assign`, so its presence is the observable proof that the
 * component decided to hand the customer to the gateway.
 *
 * `window.location.assign` itself is unforgeable in jsdom (a read-only,
 * non-configurable own property of the Location instance), so it is not
 * stubbed: jsdom declines the cross-origin navigation and the component simply
 * stays mounted, which is exactly the state the back-navigation test needs.
 */
const inFlightMarker = () => {
  const raw = window.sessionStorage.getItem(PAYMENT_IN_FLIGHT_KEY);
  return raw ? JSON.parse(raw) : null;
};

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();

  mockFetch.mockImplementation(async (url: string) => {
    if (url === '/api/public/erp/packages') {
      return jsonResponse({ data: [PKG] });
    }
    if (url === '/api/public/erp/methods') {
      return jsonResponse({ data: METHODS });
    }
    if (url === '/api/public/erp/payments') {
      return jsonResponse({
        data: { paymentUrl: GATEWAY_URL, status: 'Pending' },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
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

const methodButton = (name: string) =>
  screen.getByRole('button', { name: new RegExp(name) });

/**
 * The chip for a method, addressed by position in the catalogue rather than by
 * its label: the label is deliberately swapped for the "redirecting…" copy
 * while that method's submission is in flight, so the accessible name is not
 * stable during exactly the assertions that need it.
 */
const methodButtonAt = (index: number) => screen.getAllByRole('button')[index];

describe('PG-21 — method picker accessibility', () => {
  it('exposes the picker as a named group of action buttons', async () => {
    const group = await renderPicker();

    // The accessible name is borrowed from the visible heading via
    // aria-labelledby — no duplicated copy, and no invented locale key.
    expect(group).toHaveAttribute(
      'aria-labelledby',
      'erp-payment-method-heading'
    );
    expect(screen.getByText('erp-payment-heading')).toHaveAttribute(
      'id',
      'erp-payment-method-heading'
    );
  });

  it('renders every catalogue method as a button that keyboard users can reach', async () => {
    await renderPicker();

    // Native buttons: Tab-reachable and Space/Enter-activatable with no
    // custom key handling — the reason a plain <button> is used here rather
    // than a role="radio" element whose keyboard model would not match.
    expect(methodButton('بطاقة مدى')).toBeInstanceOf(HTMLButtonElement);
    expect(methodButton('Tabby')).toBeInstanceOf(HTMLButtonElement);
  });

  it('keeps an unavailable method focusable but inert, and explains why', async () => {
    await renderPicker();

    const tabby = methodButton('Tabby');

    // aria-disabled, NOT the `disabled` attribute: the element must stay
    // focusable so a screen-reader user can hear the reason it is inert.
    expect(tabby).toHaveAttribute('aria-disabled', 'true');
    expect(tabby).not.toBeDisabled();

    const describedBy = tabby.getAttribute('aria-describedby');
    expect(describedBy).toBe('erp-payment-method-reason-tabby');

    const reason = document.getElementById(describedBy as string);
    expect(reason).toHaveTextContent('erp-payment-unsupported-method');
    expect(reason).toHaveClass('sr-only');
  });

  it('refuses to start a payment from an unavailable method', async () => {
    await renderPicker();

    fireEvent.click(methodButton('Tabby'));

    // The refusal has to be enforced in the handler precisely because the
    // button is no longer natively `disabled`.
    expect(paymentPosts()).toHaveLength(0);
    expect(inFlightMarker()).toBeNull();
  });

  it('marks only the in-flight method busy and announces the redirect', async () => {
    await renderPicker();

    const card = methodButton('بطاقة مدى');
    expect(card).not.toHaveAttribute('aria-busy');

    fireEvent.click(card);

    await waitFor(() => expect(card).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByRole('status')).toHaveTextContent(
      'erp-payment-redirecting'
    );
  });

  it('renders the live region before it is needed, so the status is announced', async () => {
    await renderPicker();

    // A region that appears at the same moment its content does is not
    // reliably announced; it must already be in the DOM, empty.
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('');
  });
});

describe('PG-21 — gateway icons', () => {
  it('renders an icon when the catalogue supplies an https URL, marked decorative', async () => {
    const group = await renderPicker();

    const icon = group.querySelector('img');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute(
      'src',
      'https://erp.example.com/icons/mada.svg'
    );
    // Decorative: the adjacent label is the accessible name, so a described
    // image would only duplicate it.
    expect(icon).toHaveAttribute('alt', '');
    expect(icon).toHaveAttribute('width', '20');
    expect(icon).toHaveAttribute('height', '20');
  });

  it('hides the icon after a load failure instead of showing a broken glyph', async () => {
    const group = await renderPicker();

    fireEvent.error(group.querySelector('img') as HTMLImageElement);

    await waitFor(() => expect(group.querySelector('img')).toBeNull());
    // The method itself stays usable — a missing icon must never cost a sale.
    expect(methodButton('بطاقة مدى')).toBeInTheDocument();
  });

  it.each([
    [
      'a non-https URL (mixed content)',
      'http://erp.example.com/icons/mada.svg',
    ],
    ['a data: URL', 'data:image/svg+xml;base64,PHN2Zy8+'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a relative path', '/icons/mada.svg'],
  ])('refuses to render %s', async (_label, iconUrl) => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/public/erp/packages')
        return jsonResponse({ data: [PKG] });
      if (url === '/api/public/erp/methods') {
        return jsonResponse({
          data: [{ ...METHODS[0], iconUrl }],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const group = await renderPicker();

    expect(group.querySelector('img')).toBeNull();
    expect(methodButton('بطاقة مدى')).toBeInTheDocument();
  });
});

describe('PG-24 — in-flight payment recovery', () => {
  it('records the attempt before handing the customer to the gateway', async () => {
    await renderPicker();

    fireEvent.click(methodButton('بطاقة مدى'));

    await waitFor(() => expect(inFlightMarker()).not.toBeNull());

    const [{ orderReference }] = paymentPosts();
    const stored = inFlightMarker();

    expect(stored.orderReference).toBe(orderReference);
    expect(stored.packageId).toBe(PACKAGE_ID);
    expect(stored.methodKey).toBe('card');
    expect(Number.isNaN(Date.parse(stored.startedAt))).toBe(false);
  });

  it('leaves no marker behind when the gateway URL fails the allow-list', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/public/erp/packages')
        return jsonResponse({ data: [PKG] });
      if (url === '/api/public/erp/methods')
        return jsonResponse({ data: METHODS });
      if (url === '/api/public/erp/payments') {
        return jsonResponse({
          data: { paymentUrl: 'https://evil.example.com/pay' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    await renderPicker();
    fireEvent.click(methodButton('بطاقة مدى'));

    await waitFor(() =>
      expect(screen.getByText('erp-payment-general-error')).toBeInTheDocument()
    );

    // A rejected response must not leave a marker that later offers the
    // customer a resume link to a payment that never started.
    expect(inFlightMarker()).toBeNull();
  });

  it('frees a picker left stuck disabled by a back-navigation from the gateway', async () => {
    await renderPicker();

    fireEvent.click(methodButton('بطاقة مدى'));
    await waitFor(() => expect(inFlightMarker()).not.toBeNull());
    expect(methodButtonAt(0)).toHaveAttribute('aria-busy', 'true');

    // The redirect ends the JS context; returning with the browser's Back
    // button restores this page from the bfcache with React state intact and
    // `submitting` still set — which would leave every method inert forever.
    const pageShow = new Event('pageshow');
    Object.defineProperty(pageShow, 'persisted', { value: true });
    window.dispatchEvent(pageShow);

    await waitFor(() =>
      expect(methodButtonAt(0)).not.toHaveAttribute('aria-busy')
    );
    expect(methodButtonAt(0)).toHaveTextContent('بطاقة مدى');
    expect(methodButtonAt(1)).toBeInTheDocument();
  });

  it('ignores a normal (non-bfcache) pageshow, which is not a restore', async () => {
    await renderPicker();

    fireEvent.click(methodButton('بطاقة مدى'));
    await waitFor(() => expect(inFlightMarker()).not.toBeNull());

    const pageShow = new Event('pageshow');
    Object.defineProperty(pageShow, 'persisted', { value: false });
    window.dispatchEvent(pageShow);

    // Still mid-submission: a fresh load must not unlock a picker whose
    // request is genuinely in flight.
    expect(methodButtonAt(0)).toHaveAttribute('aria-busy', 'true');
  });
});

/**
 * PG-54 — the picker renders from the SHARED error taxonomy
 * (`lib/payments/errorCopy.ts`), not from a local string matcher.
 *
 * The tests below are what makes "the substring matcher is gone" observable:
 * the translator returns the key itself, so a rendered key-shaped string proves
 * the copy came through `t()` via the code map, while the presence of any
 * upstream prose proves it did not.
 */
describe('PG-54 — payment error taxonomy wiring', () => {
  const rejectWith = (errorBody: unknown) => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/public/erp/packages') {
        return jsonResponse({ data: [PKG] });
      }
      if (url === '/api/public/erp/methods') {
        return jsonResponse({ data: METHODS });
      }
      if (url === '/api/public/erp/payments') {
        return jsonResponse(errorBody, false, 502);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  };

  const submitAndReadAlert = async () => {
    await renderPicker();
    fireEvent.click(methodButton('بطاقة مدى'));

    const alert = await screen.findByRole('alert');
    return alert.textContent;
  };

  it('renders the taxonomy copy for a stable code from the BFF', async () => {
    rejectWith({ error: { message: 'erp-rejected' } });

    expect(await submitAndReadAlert()).toBe('erp-payment-declined');
  });

  it('renders the method-specific copy the code map provides', async () => {
    rejectWith({ error: { message: 'unsupported-payment-method' } });

    expect(await submitAndReadAlert()).toBe('erp-payment-unsupported-method');
  });

  it('renders the rate-limit copy for a 429 code rather than a gateway error', async () => {
    rejectWith({ error: { message: 'too-many-requests' } });

    expect(await submitAndReadAlert()).toBe('erp-payment-rate-limited');
  });

  it('NEVER renders upstream prose — an unknown failure gets the fallback', async () => {
    // The exact sentence the old in-component matcher would have returned
    // verbatim, in an Arabic UI, because it was not one of its three cases.
    rejectWith({
      error: { message: 'SqlException: timeout elapsed at line 42' },
    });

    const rendered = await submitAndReadAlert();

    expect(rendered).toBe('erp-payment-general-error');
    expect(rendered).not.toContain('SqlException');
  });

  it('does not treat the ERP status vocabulary as an error message', async () => {
    // `data.status` is 'Pending'|'Paid'|'Failed' — a payment state, not an
    // error. The old matcher used it as a fallback and rendered the bare word
    // "failed" into both locales.
    rejectWith({ error: {}, data: { status: 'Failed' } });

    const rendered = await submitAndReadAlert();

    expect(rendered).toBe('erp-payment-general-error');
    expect(rendered).not.toContain('Failed');
  });

  it('tells the customer why an unavailable method will not start', async () => {
    await renderPicker();

    fireEvent.click(methodButton('Tabby'));

    // The chip is `aria-disabled`, not natively disabled, so a click must
    // produce a visible reason rather than silently doing nothing.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('erp-payment-method-unavailable');
    expect(paymentPosts()).toHaveLength(0);
  });
});
