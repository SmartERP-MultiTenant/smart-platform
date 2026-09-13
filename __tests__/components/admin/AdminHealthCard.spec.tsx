/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminHealthCard from '@/components/admin/AdminHealthCard';
import type { AdminHealthStatus } from 'models/adminDashboard';

describe('AdminHealthCard', () => {
  it('renders the healthy state with latency and status code', () => {
    const health: AdminHealthStatus = {
      ok: true,
      reachable: true,
      latencyMs: 42,
      statusCode: 200,
    };

    render(<AdminHealthCard health={health} />);

    expect(
      screen.getByText(/خادم ERP يعمل بشكل طبيعي والاتصال مستقر/)
    ).toBeInTheDocument();
    expect(screen.getByText(/زمن الاستجابة: 42ms/)).toBeInTheDocument();
    expect(screen.getByText(/رمز الحالة: 200/)).toBeInTheDocument();
  });

  it('renders the degraded (reachable but erroring) state', () => {
    const health: AdminHealthStatus = {
      ok: false,
      reachable: true,
      latencyMs: 120,
      statusCode: 503,
      error: 'http-503',
    };

    render(<AdminHealthCard health={health} />);

    expect(
      screen.getByText(/خادم ERP متاح لكن واجه خطأ أثناء الاستجابة/)
    ).toBeInTheDocument();
    expect(screen.getByText(/الخطأ: http-503/)).toBeInTheDocument();
  });

  it('renders the RED unreachable state without a latency figure', () => {
    // The P5.3 graceful-degradation acceptance: an ERP outage shows a red,
    // semantic state rather than a blank card or a crash.
    const health: AdminHealthStatus = {
      ok: false,
      reachable: false,
      error: 'unreachable',
    };

    render(<AdminHealthCard health={health} />);

    expect(
      screen.getByText(/خادم ERP غير متاح حالياً \(انقطاع الاتصال\)/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/زمن الاستجابة/)).not.toBeInTheDocument();
    expect(screen.getByText(/الخطأ: unreachable/)).toBeInTheDocument();
  });
});
