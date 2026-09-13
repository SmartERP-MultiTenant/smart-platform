/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AdminRulesMatrix } from '@/components/admin/AdminRulesMatrix';

// The translator returns the key itself, so a rendered string that looks like a
// locale key proves the mapping happened and a rendered string that looks like a
// server code proves it did not.
jest.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const noop = async () => undefined;

const renderMatrix = (error: string) =>
  render(
    <AdminRulesMatrix
      rules={{ ok: false, packages: [], systemModules: [], error }}
      isLoading={false}
      isSaving={false}
      saveError={null}
      onUpdatePlanModules={noop}
      onSyncAllModules={noop}
      onRefresh={() => undefined}
    />
  );

describe('AdminRulesMatrix degraded banner', () => {
  // Regression: `/api/admin/rules` reports a stable CODE in `error`, and the
  // banner used to render it verbatim — an operator saw `erp-not-configured`
  // instead of a sentence. The code must be mapped to localized copy.
  it('renders localized copy, never the raw erp-not-configured code', () => {
    renderMatrix('erp-not-configured');

    expect(
      screen.getAllByText('admin-error-erp-not-configured').length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('erp-not-configured')).not.toBeInTheDocument();
  });

  it('maps a classifyErpError code the same way', () => {
    renderMatrix('erp-unavailable');

    expect(
      screen.getAllByText('admin-error-erp-unavailable').length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('erp-unavailable')).not.toBeInTheDocument();
  });

  // Some routes still answer with prose; that must keep rendering as before.
  it('passes a human sentence through untouched', () => {
    renderMatrix('Invalid plan ID');

    expect(screen.getAllByText('Invalid plan ID').length).toBeGreaterThan(0);
  });

  // An unknown future code must not leak as a token either.
  it('falls back to generic copy for an unrecognised code', () => {
    renderMatrix('some-future-code');

    expect(
      screen.getAllByText('admin-rules-erp-alert-desc').length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('some-future-code')).not.toBeInTheDocument();
  });
});
