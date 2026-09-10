import React from 'react';
import { useTranslation } from 'next-i18next';
import {
  BanknotesIcon,
  CheckBadgeIcon,
  ClockIcon,
  ExclamationCircleIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/outline';
import StatCard from '@/components/dashboard/StatCard';
import { Alert } from '@/components/shared';
import { AdminRevenuePayload } from '@/lib/adminRevenue';

interface AdminRevenueTableProps {
  revenue: AdminRevenuePayload | undefined;
  isLoading: boolean;
}

export const AdminRevenueTable: React.FC<AdminRevenueTableProps> = ({
  revenue,
  isLoading,
}) => {
  const { t } = useTranslation('common');

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (!revenue) {
    return (
      <Alert status="error">
        {t('admin-revenue-load-error')}
      </Alert>
    );
  }

  const { counts, mrr, subscriptions, trialExpirations, ok, error } = revenue;

  return (
    <div className="space-y-8 text-start" dir="rtl">
      {/* Degraded state alert when ERP is down */}
      {!ok && (
        <Alert status="warning" className="shadow-sm">
          <div>
            <h4 className="font-bold">{t('admin-revenue-erp-alert-title')}</h4>
            <p className="text-sm mt-1">
              {error || t('admin-revenue-erp-alert-desc')}
            </p>
          </div>
        </Alert>
      )}

      {/* Summary StatCards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('admin-revenue-active-subs')}
          value={counts.active}
          icon={CheckBadgeIcon}
          description={t('admin-revenue-active-subs-desc')}
        />
        <StatCard
          title={t('admin-revenue-trial-subs')}
          value={counts.trial}
          icon={ClockIcon}
          description={t('admin-revenue-trial-subs-desc')}
        />
        <StatCard
          title={t('admin-revenue-expired-subs')}
          value={counts.expired}
          icon={ExclamationCircleIcon}
          description={t('admin-revenue-expired-subs-desc')}
        />
        <StatCard
          title={t('admin-revenue-mrr')}
          value={`${mrr.toLocaleString('ar-SA')} ${t('admin-revenue-sar')}`}
          icon={BanknotesIcon}
          description={t('admin-revenue-mrr-desc')}
        />
      </div>

      {/* Trial Expirations Notice Section */}
      {trialExpirations.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 mb-3">
            <ClockIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <h3 className="font-bold text-amber-900 dark:text-amber-200 text-base">
              {t('admin-revenue-trial-expirations-heading')} ({trialExpirations.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {trialExpirations.map((exp, idx) => (
              <div
                key={`${exp.tenantId || exp.tenantName}-${idx}`}
                className="flex justify-between items-center bg-white dark:bg-gray-800 p-3 rounded-lg border border-amber-100 dark:border-amber-900/40 shadow-xs"
              >
                <div>
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">
                    {exp.tenantName}
                  </p>
                  {exp.subdomain && (
                    <p className="text-xs text-gray-500 font-mono" dir="ltr">
                      {`${exp.subdomain}.smartapro.com`}
                    </p>
                  )}
                </div>
                <div className="text-left">
                  <span
                    className={`badge badge-sm font-semibold ${
                      exp.daysRemaining <= 3
                        ? 'badge-error text-white'
                        : 'badge-warning text-gray-900'
                    }`}
                  >
                    {exp.daysRemaining === 0
                      ? t('admin-revenue-expires-today')
                      : exp.daysRemaining === 1
                      ? t('admin-revenue-day-left')
                      : t('admin-revenue-days-left', { count: exp.daysRemaining })}
                  </span>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {exp.endDateFormatted}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subscriptions MRR Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {t('admin-revenue-table-title')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {t('admin-revenue-table-subtitle')}
            </p>
          </div>
          <span className="badge badge-outline text-xs text-gray-500">
            {t('admin-revenue-total-tenants', { count: subscriptions.length })}
          </span>
        </div>

        {subscriptions.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400 mb-3" />
            <p className="text-base font-semibold">{t('admin-revenue-no-subs')}</p>
            <p className="text-xs text-gray-400 mt-1">
              {t('admin-revenue-no-subs-desc')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">{t('admin-revenue-col-tenant')}</th>
                  <th className="py-3.5 px-4 font-semibold">{t('admin-revenue-col-plan')}</th>
                  <th className="py-3.5 px-4 font-semibold">{t('admin-revenue-col-price')}</th>
                  <th className="py-3.5 px-4 font-semibold">{t('admin-revenue-col-end-date')}</th>
                  <th className="py-3.5 px-4 font-semibold">{t('admin-revenue-col-status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {subscriptions.map((sub, idx) => (
                  <tr
                    key={`${sub.tenantId || sub.tenantName}-${idx}`}
                    className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900 dark:text-white">
                        {sub.tenantName}
                      </div>
                      {sub.subdomain && (
                        <div
                          className="text-xs text-gray-400 font-mono mt-0.5"
                          dir="ltr"
                        >
                          {sub.subdomain}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {sub.planName ? (
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          {sub.planName}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-semibold">
                      {typeof sub.priceMonthly === 'number' &&
                      sub.priceMonthly > 0 ? (
                        <span className="text-primary">
                          {`${sub.priceMonthly.toLocaleString('ar-SA')} ${t('admin-revenue-sar')}`}
                        </span>
                      ) : sub.isTrial ? (
                        <span className="text-amber-600 dark:text-amber-400 text-xs">
                          {t('admin-revenue-free-trial')}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">{t('admin-revenue-unavailable')}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300 font-mono text-xs">
                      {sub.endDateFormatted || sub.endDate || '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`badge badge-sm font-semibold px-2.5 py-1 ${
                          sub.status === 'Active'
                            ? 'badge-success text-white'
                            : sub.status === 'Trial'
                            ? 'badge-warning text-gray-900'
                            : sub.status === 'Expired'
                            ? 'badge-error text-white'
                            : 'badge-ghost'
                        }`}
                      >
                        {sub.status === 'Active'
                          ? t('erp-sub-status-active')
                          : sub.status === 'Trial'
                          ? t('erp-sub-status-trial')
                          : sub.status === 'Expired'
                          ? t('admin-revenue-expired-subs')
                          : sub.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminRevenueTable;
