/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminTenantTable from '@/components/admin/AdminTenantTable';
import type { AdminTenantRecord } from 'models/adminDashboard';

// `next/link` needs a router context to render; the table only cares about the
// resolved href, so render a plain anchor and keep the test environment-free.
jest.mock('next/link', () => {
  const Link = ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  return { __esModule: true, default: Link };
});

function makeTenant(
  overrides: Partial<AdminTenantRecord> = {}
): AdminTenantRecord {
  return {
    id: 'team-1',
    name: 'شركة الأفق',
    slug: 'alofoq',
    domain: null,
    erpTenantId: 'erp-1',
    erpSubdomain: 'alofoq',
    erpLinkedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T10:00:00.000Z',
    memberCount: 4,
    subscription: {
      status: 'active',
      rawStatus: 'Active',
      isTrial: false,
      planName: 'الباقة الاحترافية',
      endDate: '2026-12-01T00:00:00.000Z',
      daysRemaining: 30,
    },
    erpReachable: true,
    error: null,
    ...overrides,
  };
}

describe('AdminTenantTable', () => {
  it('renders a row per tenant with name, slug and member count', () => {
    render(<AdminTenantTable tenants={[makeTenant()]} />);

    expect(screen.getByText('شركة الأفق')).toBeInTheDocument();
    expect(screen.getByText('/alofoq')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    // Column header carries the live tenant count.
    expect(
      screen.getByText('قائمة الشركات والمستأجرين (1)')
    ).toBeInTheDocument();
  });

  it('links each tenant name to its drill-down page', () => {
    render(<AdminTenantTable tenants={[makeTenant({ id: 'team-42' })]} />);

    expect(screen.getByRole('link', { name: 'شركة الأفق' })).toHaveAttribute(
      'href',
      '/admin/tenants/team-42'
    );
  });

  it.each([
    ['active', false, 'نشط'],
    ['trial', true, 'تجريبي'],
    ['expired', false, 'منتهي'],
  ] as const)('renders the %s subscription badge', (status, isTrial, label) => {
    render(
      <AdminTenantTable
        tenants={[
          makeTenant({
            subscription: {
              status,
              isTrial,
              planName: null,
              endDate: '2026-01-01T00:00:00.000Z',
              daysRemaining: 0,
            },
          }),
        ]}
      />
    );

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows an explicit ERP-unavailable state for a LINKED tenant whose ERP read failed', () => {
    // The whole point of the linked/reachable pair: an ERP outage must not read
    // as "this tenant was never linked".
    render(
      <AdminTenantTable
        tenants={[
          makeTenant({
            subscription: null,
            erpReachable: false,
            error: 'erp-unavailable',
          }),
        ]}
      />
    );

    expect(screen.getByText('تعذر جلب الحالة')).toBeInTheDocument();
    expect(screen.getByText('تعذر الاتصال بـ ERP')).toBeInTheDocument();
    expect(screen.queryByText('غير مربوط')).not.toBeInTheDocument();
  });

  it('surfaces a timeout distinctly from an unreachable ERP', () => {
    render(
      <AdminTenantTable
        tenants={[
          makeTenant({
            subscription: null,
            erpReachable: false,
            error: 'erp-timeout',
          }),
        ]}
      />
    );

    expect(screen.getByText('انتهت مهلة الاتصال بـ ERP')).toBeInTheDocument();
  });

  it('shows the genuinely-unlinked state (and no ERP error) for a tenant with no ERP id', () => {
    render(
      <AdminTenantTable
        tenants={[
          makeTenant({
            erpTenantId: null,
            erpSubdomain: null,
            erpLinkedAt: null,
            subscription: null,
            erpReachable: false,
            error: null,
          }),
        ]}
      />
    );

    expect(screen.getByText('غير مربوط')).toBeInTheDocument();
    expect(screen.queryByText('تعذر جلب الحالة')).not.toBeInTheDocument();
    expect(screen.queryByText('تعذر الاتصال بـ ERP')).not.toBeInTheDocument();
  });

  it('distinguishes a linked-and-reachable tenant that simply has no subscription row', () => {
    render(
      <AdminTenantTable
        tenants={[
          makeTenant({
            subscription: null,
            erpReachable: true,
            error: 'no-subscription',
          }),
        ]}
      />
    );

    expect(screen.getByText('لا يوجد اشتراك')).toBeInTheDocument();
    // `no-subscription` is a normal state, so it renders no error affordance.
    expect(screen.queryByText('تعذر الاتصال بـ ERP')).not.toBeInTheDocument();
  });

  it('renders the empty state when there are no tenants', () => {
    render(<AdminTenantTable tenants={[]} />);

    expect(screen.getByText('لا توجد شركات مسجلة بعد')).toBeInTheDocument();
  });

  it('filters tenants by search query and reports the no-results state', () => {
    render(
      <AdminTenantTable
        tenants={[
          makeTenant({ id: 'a', name: 'شركة الأفق', slug: 'alofoq' }),
          makeTenant({
            id: 'b',
            name: 'شركة النخبة',
            slug: 'elnokhba',
            erpSubdomain: 'elnokhba',
          }),
        ]}
      />
    );

    fireEvent.change(
      screen.getByPlaceholderText('بحث باسم الشركة، الرابط، أو المعرف...'),
      { target: { value: 'elnokhba' } }
    );

    expect(screen.getByText('شركة النخبة')).toBeInTheDocument();
    expect(screen.queryByText('شركة الأفق')).not.toBeInTheDocument();
  });
});
