import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import {
  ClipboardDocumentCheckIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import useAdminAuditLogs from 'hooks/useAdminAuditLogs';
import { Alert } from '@/components/shared';

export const AdminAuditLogTable: React.FC = () => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const currentLocale = router.locale || 'ar';

  const [page, setPage] = useState(1);
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const { logs, isLoading, isError } = useAdminAuditLogs(
    page,
    15,
    selectedAction || undefined
  );

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  const getActionBadgeColor = (action: string) => {
    if (
      action.includes('cancel') ||
      action.includes('disable') ||
      action.includes('lock')
    ) {
      return 'badge-error text-white';
    }
    if (action.includes('extend') || action.includes('trial')) {
      return 'badge-warning text-gray-900';
    }
    if (
      action.includes('create') ||
      action.includes('enable') ||
      action.includes('unlock')
    ) {
      return 'badge-success text-white';
    }
    return 'badge-ghost';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCEEDED':
        return (
          <span className="badge badge-success text-white text-xs font-semibold">
            {t('admin-audit-status-succeeded')}
          </span>
        );
      case 'FAILED':
        return (
          <span className="badge badge-error text-white text-xs font-semibold">
            {t('admin-audit-status-failed')}
          </span>
        );
      case 'STARTED':
        return (
          <span className="badge badge-info text-white text-xs font-semibold">
            {t('admin-audit-status-started')}
          </span>
        );
      default:
        return <span className="badge badge-ghost text-xs">{status}</span>;
    }
  };

  if (isError) {
    return <Alert status="error">{t('admin-audit-load-error')}</Alert>;
  }

  return (
    <div className="space-y-6 text-start">
      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="h-5 w-5 text-primary" />
          <h3 className="text-base font-bold text-gray-900 dark:text-white">
            {t('admin-audit-logs-title')}
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <select
            className="select select-bordered select-sm text-xs"
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('admin-audit-all-actions')}</option>
            <option value="subscription.create">
              {t('admin-audit-action-sub-create')}
            </option>
            <option value="subscription.extend">
              {t('admin-audit-action-sub-extend')}
            </option>
            <option value="subscription.cancel">
              {t('admin-audit-action-sub-cancel')}
            </option>
            <option value="subscription.trial_override">
              {t('admin-audit-action-sub-trial-override')}
            </option>
            <option value="user.disable">
              {t('admin-audit-action-user-disable')}
            </option>
            <option value="user.enable">
              {t('admin-audit-action-user-enable')}
            </option>
            <option value="user.lock">
              {t('admin-audit-action-user-lock')}
            </option>
            <option value="user.unlock">
              {t('admin-audit-action-user-unlock')}
            </option>
            <option value="package.modules_update">
              {t('admin-audit-action-package-update')}
            </option>
            <option value="package.modules_sync">
              {t('admin-audit-action-package-sync')}
            </option>
          </select>
        </div>
      </div>

      {/* Table Section */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
              />
            ))}
          </div>
        ) : !logs || logs.items.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <ClipboardDocumentCheckIcon className="mx-auto h-12 w-12 text-gray-400 mb-3" />
            <p className="text-base font-semibold">
              {t('admin-audit-no-logs')}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {t('admin-audit-no-logs-desc')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="py-3 px-4 font-semibold">
                    {t('admin-audit-col-timestamp')}
                  </th>
                  <th className="py-3 px-4 font-semibold">
                    {t('admin-audit-col-actor')}
                  </th>
                  <th className="py-3 px-4 font-semibold">
                    {t('admin-audit-col-action')}
                  </th>
                  <th className="py-3 px-4 font-semibold">
                    {t('admin-audit-col-target')}
                  </th>
                  <th className="py-3 px-4 font-semibold">
                    {t('admin-audit-col-status')}
                  </th>
                  <th className="py-3 px-4 font-semibold">
                    {t('admin-audit-col-details')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.items.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  // `ar-SA-u-ca-gregory` pins the calendar explicitly, matching
                  // `formatKsaDate` (lib/adminRevenue.ts). The ICU default
                  // calendar for `ar-SA` is not guaranteed across runtimes — it
                  // has been islamic-umalqura (Hijri) in some ICU builds — and
                  // two admin tables showing the same operator different
                  // calendars (or different years) is a real support hazard.
                  // The `-u-ca-gregory` extension keeps the default date *and*
                  // time formatting identical and only fixes the calendar, so
                  // the English branch is untouched.
                  const dateFormatted = new Date(log.createdAt).toLocaleString(
                    currentLocale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US'
                  );

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-gray-500 whitespace-nowrap">
                          {dateFormatted}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-xs text-gray-900 dark:text-white">
                            {log.actorEmail}
                          </div>
                          {log.actorName && (
                            <div className="text-[11px] text-gray-400">
                              {log.actorName}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`badge badge-sm font-mono text-xs ${getActionBadgeColor(
                              log.action
                            )}`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-gray-600 dark:text-gray-300">
                          <span className="badge badge-outline text-[11px] me-1">
                            {log.targetType}
                          </span>
                          <span title={log.targetId}>
                            {log.targetId.length > 18
                              ? `${log.targetId.substring(0, 8)}...${log.targetId.substring(
                                  log.targetId.length - 6
                                )}`
                              : log.targetId}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {getStatusBadge(log.status)}
                          {log.errorCode && (
                            <div className="text-[10px] text-error mt-0.5 font-mono">
                              {log.errorCode}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => toggleExpand(log.id)}
                            className="btn btn-ghost btn-xs text-primary font-medium"
                          >
                            {isExpanded
                              ? t('admin-audit-hide-diff')
                              : t('admin-audit-view-diff')}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Before / After JSON section */}
                      {isExpanded && (
                        <tr className="bg-gray-50 dark:bg-gray-800/30">
                          <td colSpan={6} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                              <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                <span className="font-bold text-gray-600 dark:text-gray-400 block mb-1">
                                  {t('admin-audit-before-state')}
                                </span>
                                <pre className="overflow-x-auto text-[11px] text-gray-700 dark:text-gray-300 max-h-40">
                                  {JSON.stringify(
                                    log.before || { status: 'None' },
                                    null,
                                    2
                                  )}
                                </pre>
                              </div>

                              <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                <span className="font-bold text-gray-600 dark:text-gray-400 block mb-1">
                                  {t('admin-audit-after-state')}
                                </span>
                                <pre className="overflow-x-auto text-[11px] text-gray-700 dark:text-gray-300 max-h-40">
                                  {JSON.stringify(
                                    log.after ||
                                      log.metadata || { status: 'None' },
                                    null,
                                    2
                                  )}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {logs && logs.total > logs.limit && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center text-xs">
            <span className="text-gray-500">
              {t('admin-audit-total-records', { count: logs.total })}
            </span>
            <div className="btn-group flex gap-1">
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {t('previous')}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={!logs.hasMore}
                onClick={() => setPage(page + 1)}
              >
                {t('next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAuditLogTable;
