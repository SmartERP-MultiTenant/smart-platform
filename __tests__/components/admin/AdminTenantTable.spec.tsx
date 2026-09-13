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

type TableProps = React.ComponentProps<typeof AdminTenantTable>;

/**
 * The table is presentational: it renders the page the server returned and
 * reports intentions upward (search/status/page). Filtering and paging happen
 * server-side, so these tests assert the props and callbacks, not local
 * filtering.
 */
const renderTable = (overrides: Partial<TableProps> = {}) => {
  const props: TableProps = {
    tenants: [makeTenant()],
    total: 1,
    page: 1,
    pageSize: 25,
    totalPages: 1,
    search: '',
    searchInput: '',
    status: 'all',
    isLoading: false,
    onSearchInputChange: jest.fn(),
    onStatusChange: jest.fn(),
    onPageChange: jest.fn(),
    ...overrides,
  };

  return { ...render(<AdminTenantTable {...props} />), props };
};

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
    renderTable();

    expect(screen.getByText('شركة الأفق')).toBeInTheDocument();
    expect(screen.getByText('/alofoq')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    // Column header carries the live tenant count.
    expect(
      screen.getByText('قائمة الشركات والمستأجرين (1)')
    ).toBeInTheDocument();
  });

  it('links each tenant name to its drill-down page', () => {
    renderTable({ tenants: [makeTenant({ id: 'team-42' })] });

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
    renderTable({
      tenants: [
        makeTenant({
          subscription: {
            status,
            isTrial,
            planName: null,
            endDate: '2026-01-01T00:00:00.000Z',
            daysRemaining: 0,
          },
        }),
      ],
    });

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows an explicit ERP-unavailable state for a LINKED tenant whose ERP read failed', () => {
    // The whole point of the linked/reachable pair: an ERP outage must not read
    // as "this tenant was never linked".
    renderTable({
      tenants: [
        makeTenant({
          subscription: null,
          erpReachable: false,
          error: 'erp-unavailable',
        }),
      ],
    });

    expect(screen.getByText('تعذر جلب الحالة')).toBeInTheDocument();
    expect(screen.getByText('تعذر الاتصال بـ ERP')).toBeInTheDocument();
    expect(screen.queryByText('غير مربوط')).not.toBeInTheDocument();
  });

  it('surfaces a timeout distinctly from an unreachable ERP', () => {
    renderTable({
      tenants: [
        makeTenant({
          subscription: null,
          erpReachable: false,
          error: 'erp-timeout',
        }),
      ],
    });

    expect(screen.getByText('انتهت مهلة الاتصال بـ ERP')).toBeInTheDocument();
  });

  it('shows the genuinely-unlinked state (and no ERP error) for a tenant with no ERP id', () => {
    renderTable({
      tenants: [
        makeTenant({
          erpTenantId: null,
          erpSubdomain: null,
          erpLinkedAt: null,
          subscription: null,
          erpReachable: false,
          error: null,
        }),
      ],
    });

    expect(screen.getByText('غير مربوط')).toBeInTheDocument();
    expect(screen.queryByText('تعذر جلب الحالة')).not.toBeInTheDocument();
    expect(screen.queryByText('تعذر الاتصال بـ ERP')).not.toBeInTheDocument();
  });

  it('distinguishes a linked-and-reachable tenant that simply has no subscription row', () => {
    renderTable({
      tenants: [
        makeTenant({
          subscription: null,
          erpReachable: true,
          error: 'no-subscription',
        }),
      ],
    });

    expect(screen.getByText('لا يوجد اشتراك')).toBeInTheDocument();
    // `no-subscription` is a normal state, so it renders no error affordance.
    expect(screen.queryByText('تعذر الاتصال بـ ERP')).not.toBeInTheDocument();
  });

  it('renders the empty state when there are no tenants at all', () => {
    renderTable({ tenants: [], total: 0, totalPages: 1 });

    expect(screen.getByText('لا توجد شركات مسجلة بعد')).toBeInTheDocument();
    // Nothing to page through ⇒ no pagination affordance at all.
    expect(
      screen.queryByTestId('admin-tenants-page-indicator')
    ).not.toBeInTheDocument();
  });

  it('reports the search input upward instead of filtering locally', () => {
    // Filtering moved to the SERVER: any local filtering here would only ever
    // search the current page and silently hide matches from other pages.
    const { props } = renderTable({
      tenants: [
        makeTenant({ id: 'a', name: 'شركة الأفق', slug: 'alofoq' }),
        makeTenant({
          id: 'b',
          name: 'شركة النخبة',
          slug: 'elnokhba',
          erpSubdomain: 'elnokhba',
        }),
      ],
      total: 2,
    });

    fireEvent.change(
      screen.getByPlaceholderText('بحث باسم الشركة، الرابط، أو المعرف...'),
      { target: { value: 'elnokhba' } }
    );

    expect(props.onSearchInputChange).toHaveBeenCalledWith('elnokhba');
  });

  it('reports the status filter upward', () => {
    const { props } = renderTable();

    fireEvent.change(screen.getByTestId('admin-tenants-status'), {
      target: { value: 'trial' },
    });

    expect(props.onStatusChange).toHaveBeenCalledWith('trial');
  });

  it('distinguishes a filter that matches nothing from an empty platform', () => {
    renderTable({
      tenants: [],
      total: 0,
      totalPages: 1,
      search: 'nothing-matches',
      searchInput: 'nothing-matches',
    });

    expect(screen.getByText('لا توجد نتائج مطابقة للبحث')).toBeInTheDocument();
    expect(
      screen.queryByText('لا توجد شركات مسجلة بعد')
    ).not.toBeInTheDocument();
  });

  it('shows the filtered total and the current page range', () => {
    renderTable({
      tenants: [
        makeTenant({ id: 'a' }),
        makeTenant({ id: 'b', name: 'شركة النخبة', slug: 'elnokhba' }),
      ],
      total: 42,
      page: 2,
      pageSize: 10,
      totalPages: 5,
      status: 'linked',
    });

    // The card title carries the FILTERED total (42), not the page length (2).
    expect(
      screen.getByText(/قائمة الشركات والمستأجرين \(42\)/)
    ).toBeInTheDocument();
    expect(screen.getByText('الصفحة 2 من 5')).toBeInTheDocument();
    expect(screen.getByText('عرض 11–12 من 42')).toBeInTheDocument();
  });

  it('renders RTL pagination controls and pages forward/backward', () => {
    const { props } = renderTable({ total: 60, page: 2, totalPages: 3 });

    const prev = screen.getByTestId('admin-tenants-prev');
    const next = screen.getByTestId('admin-tenants-next');

    expect(prev).toHaveTextContent('السابق');
    expect(next).toHaveTextContent('التالي');
    expect(prev).toBeEnabled();
    expect(next).toBeEnabled();

    fireEvent.click(next);
    expect(props.onPageChange).toHaveBeenCalledWith(3);

    fireEvent.click(prev);
    expect(props.onPageChange).toHaveBeenCalledWith(1);
  });

  it('disables the pager at the first and last page', () => {
    const { unmount } = renderTable({ total: 10, page: 1, totalPages: 1 });
    expect(screen.getByTestId('admin-tenants-prev')).toBeDisabled();
    expect(screen.getByTestId('admin-tenants-next')).toBeDisabled();
    unmount();

    renderTable({ total: 60, page: 1, totalPages: 3 });
    expect(screen.getByTestId('admin-tenants-prev')).toBeDisabled();
    expect(screen.getByTestId('admin-tenants-next')).toBeEnabled();
  });

  it('disables the pager while a page/filter request is loading', () => {
    renderTable({ total: 60, page: 2, totalPages: 3, isLoading: true });

    // Prevents double-click paging into a stale page while the server answers.
    expect(screen.getByTestId('admin-tenants-prev')).toBeDisabled();
    expect(screen.getByTestId('admin-tenants-next')).toBeDisabled();
  });

  it('labels a page that is past the end as out-of-range, not as an empty platform', () => {
    renderTable({ tenants: [], total: 30, page: 9, totalPages: 3 });

    expect(screen.getByText('لا توجد شركات في هذه الصفحة')).toBeInTheDocument();
    expect(
      screen.queryByText('لا توجد شركات مسجلة بعد')
    ).not.toBeInTheDocument();
    // …and the operator can still navigate back out of it.
    expect(
      screen.getByTestId('admin-tenants-page-indicator')
    ).toHaveTextContent('الصفحة 9 من 3');
    expect(screen.getByTestId('admin-tenants-prev')).toBeEnabled();
  });
});
