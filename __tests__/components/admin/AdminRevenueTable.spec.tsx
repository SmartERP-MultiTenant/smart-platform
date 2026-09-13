/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AdminRevenueTable } from '@/components/admin/AdminRevenueTable';
import type { AdminRevenuePayload } from '@/lib/adminRevenue';

// The translator returns the key itself, so a rendered string that looks like a
// locale key proves the mapping happened and a rendered string that looks like a
// server code proves it did not.
jest.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('next/router', () => ({
  useRouter: () => ({ locale: 'en', replace: jest.fn(), asPath: '/admin' }),
}));

// `swr` is imported for its `mutate` revalidation helper; nothing in these
// assertions triggers it, but the module must resolve without a provider.
jest.mock('swr', () => ({ mutate: jest.fn(), __esModule: true }));

const degraded = (error: string | undefined): AdminRevenuePayload => ({
  generatedAt: '2026-01-01T00:00:00.000Z',
  source: 'erp-aggregate',
  ok: false,
  error,
  counts: { active: 0, trial: 0, expired: 0, total: 0 },
  mrr: 0,
  subscriptions: [],
  trialExpirations: [],
});

const renderDegraded = (error: string | undefined) =>
  render(<AdminRevenueTable revenue={degraded(error)} isLoading={false} />);

const GENERIC_FALLBACK = 'admin-revenue-erp-alert-desc';

/**
 * The degraded banner used to map only `erp-not-configured` through a hardcoded
 * ternary and sent everything else to the generic sentence. `erp-unreachable` —
 * the other code this route emits — therefore rendered as the generic message
 * even though a map entry existed for it. These assertions pin the shared
 * mapper's behaviour so that gap cannot come back.
 */
describe('AdminRevenueTable degraded banner', () => {
  it('maps erp-unreachable through the shared mapper instead of the generic sentence', () => {
    renderDegraded('erp-unreachable');

    expect(
      screen.getAllByText('admin-error-erp-unreachable').length
    ).toBeGreaterThan(0);
    expect(screen.queryByText(GENERIC_FALLBACK)).not.toBeInTheDocument();
    expect(screen.queryByText('erp-unreachable')).not.toBeInTheDocument();
  });

  it('maps erp-unavailable the same way', () => {
    renderDegraded('erp-unavailable');

    expect(
      screen.getAllByText('admin-error-erp-unavailable').length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('erp-unavailable')).not.toBeInTheDocument();
  });

  // The page keeps its OWN copy for this code rather than the shared map's
  // entry, because the map's sentence is written for action surfaces and this
  // banner reports missing data. Pinned so the special case cannot silently
  // collapse into the shared wording.
  it('keeps this page’s own copy for erp-not-configured, not the shared map’s', () => {
    renderDegraded('erp-not-configured');

    expect(
      screen.getAllByText('admin-revenue-erp-not-configured').length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText('admin-error-erp-not-configured')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('erp-not-configured')).not.toBeInTheDocument();
  });

  it('falls back to the generic sentence for an unrecognised code-shaped token', () => {
    renderDegraded('some-future-erp-code');

    expect(screen.getAllByText(GENERIC_FALLBACK).length).toBeGreaterThan(0);
    expect(screen.queryByText('some-future-erp-code')).not.toBeInTheDocument();
  });

  it('never renders a raw Validation Error fragment', () => {
    // The wrapper is unwrapped and its payload mapped, so the wrapped form
    // resolves to the SPECIFIC copy for that code rather than the fallback.
    // Either way the operator never sees the English technical fragment.
    renderDegraded('Validation Error: invalid-package-id');

    expect(
      screen.getAllByText('admin-error-invalid-package-id').length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText('Validation Error: invalid-package-id')
    ).not.toBeInTheDocument();
  });

  it('falls back for a wrapped fragment whose payload is not a known code', () => {
    renderDegraded('Validation Error: Token is required');

    expect(screen.getAllByText(GENERIC_FALLBACK).length).toBeGreaterThan(0);
    expect(
      screen.queryByText('Validation Error: Token is required')
    ).not.toBeInTheDocument();
  });

  it('passes a human sentence through untouched', () => {
    renderDegraded('Could not reach the billing service');

    expect(
      screen.getAllByText('Could not reach the billing service').length
    ).toBeGreaterThan(0);
  });

  it('falls back when the code is absent', () => {
    renderDegraded(undefined);

    expect(screen.getAllByText(GENERIC_FALLBACK).length).toBeGreaterThan(0);
  });

  it('falls back when the code is an empty string', () => {
    renderDegraded('');

    expect(screen.getAllByText(GENERIC_FALLBACK).length).toBeGreaterThan(0);
  });
});
