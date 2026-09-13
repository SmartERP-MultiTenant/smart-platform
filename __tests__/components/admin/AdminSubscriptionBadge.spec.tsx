/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminSubscriptionBadge from '@/components/admin/AdminSubscriptionBadge';
import { normalizeErpSubscription } from 'models/adminDashboard';
import { buildAdminSummary } from '@/lib/adminDashboard';

// The badge test also asserts that the badge and the summary AGREE for the same
// record, so it imports `buildAdminSummary`. That module reaches for prisma/env/
// erp at import time; none of them are used by the pure summary function.
jest.mock('@/lib/prisma', () => ({
  prisma: { team: { findMany: jest.fn(), findUnique: jest.fn() } },
}));

jest.mock('@/lib/env', () => ({
  __esModule: true,
  default: {
    erp: { apiUrl: 'https://erp.example.test/api', platformApiKey: 'key' },
  },
}));

jest.mock('@/lib/erp', () => {
  const actual = jest.requireActual('@/lib/erp');
  return {
    ...actual,
    erp: { ...actual.erp, getTenantBillingSubscription: jest.fn() },
  };
});

const NOW = new Date('2026-09-10T12:00:00Z');

describe('AdminSubscriptionBadge', () => {
  it('renders an expired trial as EXPIRED, not as a trial (F-A regression)', () => {
    // The exact contradiction the console must never show: this row is counted
    // under "الاشتراكات المنتهية" by buildAdminSummary.
    const lapsedTrial = normalizeErpSubscription(
      {
        subscription: {
          status: 'Trialing',
          isTrial: true,
          endDate: '2026-09-01T00:00:00Z',
        },
      },
      NOW
    );

    expect(lapsedTrial?.status).toBe('expired');

    render(
      <AdminSubscriptionBadge
        status={lapsedTrial?.status}
        isTrial={lapsedTrial?.isTrial}
        linked
        reachable
      />
    );

    expect(screen.getByText('منتهي')).toBeInTheDocument();
    expect(screen.queryByText('تجريبي')).not.toBeInTheDocument();
  });

  it('renders a future-dated active trial as a trial', () => {
    const runningTrial = normalizeErpSubscription(
      {
        subscription: {
          status: 'Trialing',
          isTrial: true,
          endDate: '2026-09-30T00:00:00Z',
        },
      },
      NOW
    );

    expect(runningTrial?.status).toBe('trial');

    render(
      <AdminSubscriptionBadge
        status={runningTrial?.status}
        isTrial={runningTrial?.isTrial}
        linked
        reachable
      />
    );

    expect(screen.getByText('تجريبي')).toBeInTheDocument();
  });

  it('still calls an active subscription with isTrial set a trial', () => {
    // `isTrial: true` with a non-trial raw status is the case the promotion rule
    // exists for: the ERP flag is authoritative when the subscription is live.
    render(<AdminSubscriptionBadge status="active" isTrial linked reachable />);

    expect(screen.getByText('تجريبي')).toBeInTheDocument();
  });

  it('renders a cancelled subscription as cancelled even with isTrial set', () => {
    const cancelled = normalizeErpSubscription(
      {
        subscription: {
          status: 'Cancelled',
          isTrial: true,
          endDate: '2026-09-30T00:00:00Z',
        },
      },
      NOW
    );

    expect(cancelled?.status).toBe('cancelled');

    render(
      <AdminSubscriptionBadge
        status={cancelled?.status}
        isTrial={cancelled?.isTrial}
        linked
        reachable
      />
    );

    expect(screen.getByText('ملغي')).toBeInTheDocument();
    expect(screen.queryByText('تجريبي')).not.toBeInTheDocument();
  });

  it('AGREES with buildAdminSummary for a lapsed trial (the actual guard)', () => {
    const lapsedTrial = normalizeErpSubscription(
      {
        subscription: {
          status: 'Trialing',
          isTrial: true,
          endDate: '2026-09-01T00:00:00Z',
        },
      },
      NOW
    );

    const summary = buildAdminSummary([
      { erpTenantId: 'tenant-1', subscription: lapsedTrial } as any,
    ]);

    render(
      <AdminSubscriptionBadge
        status={lapsedTrial?.status}
        isTrial={lapsedTrial?.isTrial}
        linked
        reachable
      />
    );

    // KPI card says expired ⇒ the badge MUST say expired. The old
    // `isTrial ? 'trial' : status` mapped this row back to "تجريبي".
    expect(summary.expiredSubscriptions).toBe(1);
    expect(summary.trialSubscriptions).toBe(0);
    expect(screen.getByText('منتهي')).toBeInTheDocument();
  });

  it('keeps the linked/reachable states unchanged', () => {
    const { unmount } = render(<AdminSubscriptionBadge linked reachable />);
    expect(screen.getByText('لا يوجد اشتراك')).toBeInTheDocument();
    unmount();

    render(<AdminSubscriptionBadge linked reachable={false} />);
    expect(screen.getByText('تعذر جلب الحالة')).toBeInTheDocument();
  });
});
