import React from 'react';
import Link from 'next/link';
import { Card, EmptyState, LetterAvatar } from '@/components/shared';
import {
  AdminTenantRecord,
  AdminTenantStatusFilter,
} from 'models/adminDashboard';
import AdminSubscriptionBadge from './AdminSubscriptionBadge';
import { formatDate } from '@/components/dashboard/format';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

interface AdminTenantTableProps {
  /** Rows of the CURRENT page (the server ships only this page). */
  tenants: AdminTenantRecord[];
  /** Teams matching the active filters across the WHOLE dataset. */
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Debounced search actually applied by the server (drives the query). */
  search: string;
  /** Immediate input value (may be ahead of `search` while debouncing). */
  searchInput: string;
  status: AdminTenantStatusFilter;
  /**
   * True only while the FIRST page has not arrived yet: there is literally
   * nothing on screen to page from.
   *
   * Must NOT be fed from SWR's `isValidating` (see `isPaging`).
   */
  isLoading: boolean;
  /**
   * True only while a page change the OPERATOR made is still unanswered
   * (`useAdminDashboard().isPaging`).
   *
   * Kept separate from `isLoading` because a plain background revalidation
   * re-fetches the same page and must leave the pager usable: disabling the
   * buttons for the whole of every 30s refresh makes the pager flicker, and a
   * click that lands in such a window is dropped by the browser (disabled
   * buttons receive no click event), so the operator's paging action can be
   * silently swallowed.
   */
  isPaging: boolean;
  onSearchInputChange: (value: string) => void;
  onStatusChange: (value: AdminTenantStatusFilter) => void;
  onPageChange: (page: number) => void;
}

/**
 * Per-row ERP failure tokens (emitted by `lib/adminDashboard.ts`) mapped to
 * operator-facing Arabic. `no-subscription` is deliberately absent: a linked
 * tenant that simply has no billing row yet is a normal state, not an error.
 */
const ERP_ERROR_LABELS: Record<string, string> = {
  'erp-timeout': 'انتهت مهلة الاتصال بـ ERP',
  'erp-unavailable': 'تعذر الاتصال بـ ERP',
  'erp-malformed-payload': 'استجابة ERP غير صالحة',
  'resolution-failed': 'تعذر تحليل بيانات المستأجر',
};

/**
 * Tenant list for the platform-admin dashboard.
 *
 * Search, status filtering and paging are all SERVER-side: this component owns
 * no filter state, it reports intentions upward and renders whatever page the
 * server returned. Filtering a single page locally would silently produce wrong
 * results ("لا توجد نتائج" for a match sitting on another page).
 */
const AdminTenantTable = ({
  tenants,
  total,
  page,
  pageSize,
  totalPages,
  search,
  searchInput,
  status,
  isLoading,
  isPaging,
  onSearchInputChange,
  onStatusChange,
  onPageChange,
}: AdminTenantTableProps) => {
  const hasActiveFilters = Boolean(search.trim()) || status !== 'all';
  // A full page beyond the end is not "no teams": the dataset has rows, this
  // page is simply out of range — say so instead of showing the empty dataset
  // copy, which would read as "the platform has no tenants".
  const isOutOfRange = total > 0 && tenants.length === 0;

  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = total === 0 ? 0 : rangeFrom + tenants.length - 1;

  return (
    <Card>
      <Card.Body>
        <Card.Header>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <Card.Title>
                {/* The FILTERED total across the whole dataset — not the number
                    of rows currently on screen. */}
                قائمة الشركات والمستأجرين ({total})
              </Card.Title>
              <Card.Description>
                متابعة الشركات المسجلة على المنصة وحالة اشتراكاتها في نظام ERP.
              </Card.Description>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="بحث باسم الشركة، الرابط، أو المعرف..."
                  value={searchInput}
                  onChange={(e) => onSearchInputChange(e.target.value)}
                  data-testid="admin-tenants-search"
                  className="input input-bordered input-sm w-full sm:w-64 ps-8 text-sm"
                />
                <MagnifyingGlassIcon className="h-4 w-4 absolute start-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              <select
                className="select select-bordered select-sm text-sm"
                value={status}
                onChange={(e) =>
                  onStatusChange(e.target.value as AdminTenantStatusFilter)
                }
                data-testid="admin-tenants-status"
              >
                <option value="all">كل الحالات</option>
                <option value="active">الاشتراكات النشطة</option>
                <option value="trial">الاشتراكات التجريبية</option>
                <option value="expired">الاشتراكات المنتهية</option>
                <option value="linked">المربوطة بـ ERP</option>
                <option value="unlinked">غير المربوطة</option>
              </select>
            </div>
          </div>
        </Card.Header>

        {tenants.length === 0 ? (
          <EmptyState
            title={
              isOutOfRange
                ? 'لا توجد شركات في هذه الصفحة'
                : hasActiveFilters
                  ? 'لا توجد نتائج مطابقة للبحث'
                  : 'لا توجد شركات مسجلة بعد'
            }
            description={
              isOutOfRange
                ? 'استخدم أزرار التنقل للعودة إلى نطاق الصفحات المتاح.'
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700 mt-2">
            <table className="w-full text-start text-sm text-gray-500 dark:text-gray-400">
              <thead className="bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-400">
                <tr>
                  <th scope="col" className="px-6 py-3">
                    الشركة
                  </th>
                  <th scope="col" className="px-6 py-3">
                    رابط ERP
                  </th>
                  <th scope="col" className="px-6 py-3">
                    حالة الاشتراك
                  </th>
                  <th scope="col" className="px-6 py-3">
                    الباقة
                  </th>
                  <th scope="col" className="px-6 py-3">
                    تاريخ الانتهاء
                  </th>
                  <th scope="col" className="px-6 py-3">
                    الأعضاء
                  </th>
                  <th scope="col" className="px-6 py-3">
                    تاريخ التسجيل
                  </th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr
                    key={tenant.id}
                    className="border-b border-gray-200 bg-white last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <LetterAvatar name={tenant.name} />{' '}
                        <div>
                          <Link
                            href={`/admin/tenants/${tenant.id}`}
                            className="font-semibold text-gray-900 dark:text-gray-100 block hover:text-primary hover:underline"
                          >
                            {tenant.name}
                          </Link>
                          <span className="text-xs text-gray-400 font-mono">
                            /{tenant.slug}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      {tenant.erpSubdomain ? (
                        <span className="font-mono text-xs text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">
                          {tenant.erpSubdomain}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {/* `linked` + `reachable` let the badge distinguish a
                          genuinely unlinked tenant from a linked one whose ERP
                          read failed — both arrive here with no subscription. */}
                      <AdminSubscriptionBadge
                        status={tenant.subscription?.status}
                        isTrial={tenant.subscription?.isTrial}
                        linked={Boolean(tenant.erpTenantId)}
                        reachable={tenant.erpReachable}
                      />
                      {tenant.error && ERP_ERROR_LABELS[tenant.error] && (
                        <span
                          className="mt-1 block text-[11px] text-gray-400"
                          title={tenant.error}
                        >
                          {ERP_ERROR_LABELS[tenant.error]}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-gray-900 dark:text-gray-100">
                        {tenant.subscription?.planName || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      {tenant.subscription?.endDate ? (
                        <div>
                          <span className="text-gray-900 dark:text-gray-100 text-xs">
                            {formatDate(tenant.subscription.endDate, 'ar')}
                          </span>
                          {typeof tenant.subscription.daysRemaining ===
                            'number' && (
                            <span className="text-[11px] text-gray-400 block">
                              (باقي {tenant.subscription.daysRemaining} يوم)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 font-semibold text-gray-900 dark:text-gray-100">
                      {tenant.memberCount}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-xs">
                      {formatDate(tenant.createdAt, 'ar')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination. Hidden only when the dataset itself is empty, so an
            out-of-range page still offers a way back.

            Disabled for exactly two reasons — nothing loaded yet (`isLoading`)
            or the operator's own page change still in flight (`isPaging`) — and
            never for a background revalidation. */}
        {total > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {`عرض ${rangeFrom}–${rangeTo} من ${total}`}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={isLoading || isPaging || page <= 1}
                onClick={() => onPageChange(Math.max(1, page - 1))}
                data-testid="admin-tenants-prev"
              >
                <ChevronRightIcon className="h-4 w-4" />
                السابق
              </button>

              <span
                className="text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap"
                data-testid="admin-tenants-page-indicator"
              >
                {`الصفحة ${page} من ${totalPages}`}
              </span>

              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={isLoading || isPaging || page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                data-testid="admin-tenants-next"
              >
                التالي
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default AdminTenantTable;
