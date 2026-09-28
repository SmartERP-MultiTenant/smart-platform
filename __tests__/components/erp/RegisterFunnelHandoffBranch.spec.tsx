/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://app.smartapro.com/register"}
 *
 * The WIRING of the register funnel's ERP handoff, which the predicate tests
 * cannot reach.
 *
 * `isAllowedRedirectUrl` is tested on its own (`__tests__/lib/erp/handoff.spec.ts`)
 * and the funnel tests the allowed path end to end (Playwright). What neither
 * covers is the branch the funnel takes when the ERP returns a target the
 * allowlist REJECTS: it must surface the error and must NOT navigate. That is
 * the only place a security decision in this component can be undone by a
 * one-line edit, and it was untested.
 *
 * The observable proof of "did not navigate" is that `buildErpHandoffUrl` — the
 * only function that produces the URL handed to `window.location.assign` — is
 * never called. `window.location.assign` itself is unforgeable in jsdom (a
 * read-only, non-configurable own property of the Location instance), so it is
 * not stubbed; the spy on the builder is the seam that can actually be asserted.
 * The on-allowlist control below therefore does reach jsdom's
 * `window.location.assign`, which declines the navigation and logs
 * `Not implemented: navigation (except hash changes)` — expected noise in this
 * file, and the reason the control asserts the builder's arguments rather than
 * a resulting page load.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RegisterFunnel } from '@/components/erp/RegisterFunnel';
import { buildErpHandoffUrl, isAllowedRedirectUrl } from '@/lib/erp/handoff';

jest.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('next/router', () => ({
  useRouter: () => ({
    query: { package: PACKAGE_ID },
    locale: 'en',
    replace: jest.fn(),
    push: jest.fn(),
  }),
}));

/**
 * The payment step is a separate component with its own suite; it is stubbed so
 * this file asserts the handoff branch and nothing else.
 */
jest.mock('@/components/erp/PaymentActivation', () => ({
  __esModule: true,
  default: () => null,
}));

// Real behaviour, counted calls: never a hand-written stand-in for the
// allowlist check under test.
jest.mock('@/lib/erp/handoff', () => {
  const actual = jest.requireActual('@/lib/erp/handoff');

  return {
    ...actual,
    buildErpHandoffUrl: jest.fn(actual.buildErpHandoffUrl),
    isAllowedRedirectUrl: jest.fn(actual.isAllowedRedirectUrl),
  };
});

const PACKAGE_ID = 'pkg-growth';
const HANDOFF_CODE = 'Zm9vYmFyLTAxMjM0NTY3ODlhYmNkZWZnaGlqa2xtbm9w';

const FUNNEL_PROPS = {
  erpClientUrl: 'http://localhost:4200',
  erpLoginPath: '/auth/login',
  erpBaseDomain: 'smartapro.com',
};

/** The shape `isAllowedRedirectUrl` is asked with — host allowlist only. */
const ALLOWLIST_OPTS = {
  erpClientUrl: FUNNEL_PROPS.erpClientUrl,
  erpBaseDomain: FUNNEL_PROPS.erpBaseDomain,
};

const buildErpHandoffUrlMock = buildErpHandoffUrl as unknown as jest.Mock;
const isAllowedRedirectUrlMock = isAllowedRedirectUrl as unknown as jest.Mock;

const mockFetch = jest.fn();

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: async () => body,
});

/** Registers a tenant whose `redirectTo` is what the test decides. */
const registrationSucceedsWith = (redirectTo: string) =>
  mockFetch.mockImplementation(async (url: string) => {
    if (url === '/api/public/erp/register') {
      return jsonResponse({
        data: {
          success: true,
          subdomain: 'acme-co',
          redirectTo,
          handoffCode: HANDOFF_CODE,
          handoffExpiresAt: '2026-09-24T10:02:00Z',
        },
      });
    }

    if (
      url.startsWith('/api/public/erp/check-subdomain') ||
      url.startsWith('/api/public/erp/check-email')
    ) {
      return jsonResponse({ data: { available: true } });
    }

    throw new Error(`unexpected fetch: ${url}`);
  });

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
  global.fetch = mockFetch as unknown as typeof fetch;
});

const setField = (name: string, value: string) =>
  fireEvent.change(document.querySelector(`[name="${name}"]`) as HTMLElement, {
    target: { value },
  });

/** Fills the form, submits it, and waits for the success step. */
const reachSuccessStep = async () => {
  render(<RegisterFunnel {...FUNNEL_PROPS} />);

  setField('companyName', 'Acme Co');
  setField('subdomain', 'acme-co');
  setField('adminEmail', 'owner@acme.com');
  setField('adminUserName', 'owner');
  setField('adminPassword', 'SecurePass123!');
  setField('confirmPassword', 'SecurePass123!');

  fireEvent.click(
    screen.getByRole('button', { name: 'erp-register-submit-button' })
  );

  await screen.findByRole('button', { name: 'erp-enter-system-button' });
};

describe('RegisterFunnel — ERP handoff branch (HANDOFF CONTRACT v1)', () => {
  it('surfaces the error and does not navigate when the target is off-allowlist', async () => {
    registrationSucceedsWith('https://not-our-erp.example.com');

    await reachSuccessStep();

    expect(
      screen.queryByText('erp-login-redirect-error')
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'erp-enter-system-button' })
    );

    // The allowlist was consulted on the destination the customer would reach —
    // host only, deliberately: the query string cannot change the origin.
    await waitFor(() =>
      expect(isAllowedRedirectUrlMock).toHaveBeenCalledWith(
        'https://not-our-erp.example.com/auth/login',
        ALLOWLIST_OPTS
      )
    );

    // … and the rejected target produced an error instead of a navigation: the
    // URL builder is what the assign call consumes, so it never running is the
    // proof that no handoff URL was handed to the browser.
    expect(buildErpHandoffUrlMock).not.toHaveBeenCalled();
    expect(await screen.findByText('erp-login-redirect-error')).toBeVisible();
    expect(window.location.href).toBe('https://app.smartapro.com/register');
  });

  it('navigates through the handoff builder when the target is on the allowlist', async () => {
    // The control for the test above: the same click path must reach
    // `buildErpHandoffUrl` for an allowed target, otherwise "never called"
    // would pass for the wrong reason.
    registrationSucceedsWith('https://acme-co.smartapro.com');

    await reachSuccessStep();

    fireEvent.click(
      screen.getByRole('button', { name: 'erp-enter-system-button' })
    );

    await waitFor(() =>
      expect(buildErpHandoffUrlMock).toHaveBeenCalledWith(
        expect.objectContaining({ handoffCode: HANDOFF_CODE }),
        {
          isLocalhost: false,
          clientUrl: FUNNEL_PROPS.erpClientUrl,
          loginPath: FUNNEL_PROPS.erpLoginPath,
          baseDomain: FUNNEL_PROPS.erpBaseDomain,
          handoff: HANDOFF_CODE,
          // The logged-in identity is prefilled: the user name when the form
          // has one, the email otherwise.
          userName: 'owner',
        }
      )
    );

    expect(
      screen.queryByText('erp-login-redirect-error')
    ).not.toBeInTheDocument();
  });
});
