import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, EmptyState, LetterAvatar } from '@/components/shared';
import { AdminTenantRecord } from 'models/adminDashboard';
import AdminSubscriptionBadge from './AdminSubscriptionBadge';
import { formatDate } from '@/components/dashboard/format';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface AdminTenantTableProps {
  tenants: AdminTenantRecord[];
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

const AdminTenantTable = ({ tenants }: AdminTenantTableProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredTenants = useMemo(() => {
    return tenants.filter((tenant) => {
      const matchesSearch =
        tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tenant.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (tenant.erpSubdomain &&
          tenant.erpSubdomain
            .toLowerCase()
            .includes(searchQuery.toLowerCase())) ||
        (tenant.erpTenantId &&
          tenant.erpTenantId.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (filterStatus === 'all') return true;
      if (filterStatus === 'unlinked') return !tenant.erpTenantId;
      if (filterStatus === 'linked') return Boolean(tenant.erpTenantId);
      if (tenant.subscription) {
        return tenant.subscription.status === filterStatus;
      }
      return false;
    });
  }, [tenants, searchQuery, filterStatus]);

  return (
    <Card>
      <Card.Body>
        <Card.Header>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <Card.Title>
                قائمة الشركات والمستأجرين ({tenants.length})
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
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input input-bordered input-sm w-full sm:w-64 ps-8 text-sm"
                />
                <MagnifyingGlassIcon className="h-4 w-4 absolute start-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              <select
                className="select select-bordered select-sm text-sm"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
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

        {filteredTenants.length === 0 ? (
          <EmptyState
            title={
              searchQuery || filterStatus !== 'all'
                ? 'لا توجد نتائج مطابقة للبحث'
                : 'لا توجد شركات مسجلة بعد'
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
                {filteredTenants.map((tenant) => (
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
      </Card.Body>
    </Card>
  );
};

export default AdminTenantTable;
