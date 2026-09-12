import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useSession } from 'next-auth/react';
import { Button } from 'react-daisyui';
import toast from 'react-hot-toast';
import {
  CheckCircleIcon,
  LockClosedIcon,
  LockOpenIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';

import {
  Alert,
  ConfirmationDialog,
  EmptyState,
  LetterAvatar,
} from '@/components/shared';
import { defaultHeaders } from '@/lib/common';
import useAdminUsers, {
  ADMIN_USERS_PAGE_SIZE,
  type AdminUserListItem,
} from 'hooks/useAdminUsers';
import type { ApiResponse } from 'types';

/**
 * P5.5 — platform user administration table.
 *
 * Consumes the merged backend contract (pages/api/admin/users*):
 *   GET    /api/admin/users?search=&page=&limit=  -> { data: { items, total, page, limit, hasMore } }
 *   POST   /api/admin/users/[id]/{disable|enable|lock|unlock} -> { data: updatedUser }
 *
 * Direction is intentionally NOT set here: it is inherited from the
 * locale-aware page container (pages/admin/users.tsx).
 */

type AdminUserAction = 'disable' | 'enable' | 'lock' | 'unlock';

const SEARCH_DEBOUNCE_MS = 400;

export const UsersAdmin: React.FC = () => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { data: session } = useSession();
  const currentLocale = router.locale || 'ar';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pendingAction, setPendingAction] = useState<{
    user: AdminUserListItem;
    action: AdminUserAction;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { users, isLoading, isError, mutate } = useAdminUsers(search, page);

  const sessionUserId = session?.user?.id;

  // Dates follow the ACTIVE locale, pinned to the Gregorian calendar: 'ar-SA'
  // resolves to islamic-umalqura (Hijri) and would show a different year than
  // the ERP/team pages (pages/teams/[slug]/erp.tsx uses 'ar-EG').
  const dateLocale = currentLocale === 'ar' ? 'ar-EG' : 'en-US';
  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString(dateLocale);

  // Debounce the search box (repo precedent: components/erp/RegisterFunnel.tsx).
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // A dead session mid-view (JWT expiry/revocation) must not render an empty
  // table: follow the repo's login-redirect convention instead.
  useEffect(() => {
    if (isError?.message === 'Unauthorized') {
      router.push(
        `/auth/login?callbackUrl=${encodeURIComponent(router.asPath)}`
      );
    }
  }, [isError, router]);

  const ACTION_LABELS: Record<AdminUserAction, string> = useMemo(
    () => ({
      disable: t('admin-users-action-disable'),
      enable: t('admin-users-action-enable'),
      lock: t('admin-users-action-lock'),
      unlock: t('admin-users-action-unlock'),
    }),
    [t]
  );

  const ACTION_CONFIRMATIONS: Record<AdminUserAction, string> = useMemo(
    () => ({
      disable: t('admin-users-confirm-disable'),
      enable: t('admin-users-confirm-enable'),
      lock: t('admin-users-confirm-lock'),
      unlock: t('admin-users-confirm-unlock'),
    }),
    [t]
  );

  const ACTION_SUCCESS: Record<AdminUserAction, string> = useMemo(
    () => ({
      disable: t('admin-users-success-disable'),
      enable: t('admin-users-success-enable'),
      lock: t('admin-users-success-lock'),
      unlock: t('admin-users-success-unlock'),
    }),
    [t]
  );

  const ACTION_COLORS: Record<
    AdminUserAction,
    'error' | 'success' | 'warning' | 'primary'
  > = {
    disable: 'error',
    enable: 'success',
    lock: 'warning',
    unlock: 'primary',
  };

  const ACTION_ICONS = {
    disable: NoSymbolIcon,
    enable: CheckCircleIcon,
    lock: LockClosedIcon,
    unlock: LockOpenIcon,
  } as const;

  const TEAM_ROLE_LABELS: Record<string, string> = useMemo(
    () => ({
      OWNER: t('admin-users-team-role-owner'),
      ADMIN: t('admin-users-team-role-admin'),
      MEMBER: t('admin-users-team-role-member'),
    }),
    [t]
  );

  // Backend error strings -> locale keys (mirrors the funnel's
  // getErpErrorMessage precedent). Unknown messages fall through verbatim.
  // The translations are hoisted into constants so every translation call
  // stays on a single line and the check-locale static-usage gate can
  // resolve it.
  const errorOwnAccount = t('admin-users-error-own-account');
  const errorLastAdmin = t('admin-users-error-last-admin');
  const errorConflict = t('admin-users-error-conflict');
  const errorNotFound = t('admin-users-error-not-found');

  const knownErrorMessages: Record<string, string> = useMemo(
    () => ({
      'Cannot disable or lock your own administrator account': errorOwnAccount,
      'Cannot disable the last active platform administrator': errorLastAdmin,
      'Concurrent update conflict, please retry': errorConflict,
      'User not found': errorNotFound,
    }),
    [errorOwnAccount, errorLastAdmin, errorConflict, errorNotFound]
  );

  const translateError = (message?: string) =>
    (message && knownErrorMessages[message]) ||
    message ||
    t('admin-users-error-generic');

  const runAction = async (
    user: AdminUserListItem,
    action: AdminUserAction
  ) => {
    setActionError(null);
    setActionLoading(true);

    try {
      const response = await fetch(`/api/admin/users/${user.id}/${action}`, {
        method: 'POST',
        headers: defaultHeaders,
      });

      const body = (await response.json().catch(() => ({}))) as ApiResponse;

      if (!response.ok) {
        setActionError(translateError(body?.error?.message));
        return;
      }

      toast.success(ACTION_SUCCESS[action]);
      await mutate();
    } catch {
      setActionError(t('admin-users-error-generic'));
    } finally {
      setActionLoading(false);
    }
  };

  const askAction = (user: AdminUserListItem, action: AdminUserAction) => {
    setActionError(null);
    setPendingAction({ user, action });
  };

  const renderStatus = (user: AdminUserListItem) => {
    if (user.disabledAt) {
      return (
        <span className="badge badge-sm badge-error text-white font-semibold">
          {t('admin-users-status-disabled')}
        </span>
      );
    }

    if (user.lockedAt) {
      return (
        <span className="badge badge-sm badge-warning text-gray-900 font-semibold">
          {t('admin-users-status-locked')}
        </span>
      );
    }

    return (
      <span className="badge badge-sm badge-success text-white font-semibold">
        {t('admin-users-status-active')}
      </span>
    );
  };

  const renderActions = (user: AdminUserListItem) => {
    // Self-administration is blocked server-side (422); keep the same rule in
    // the UI so the operator never triggers a guaranteed failure.
    const isSelf = user.id === sessionUserId;

    const actions: AdminUserAction[] = [];

    if (user.disabledAt) {
      actions.push('enable');
    } else if (!isSelf) {
      actions.push('disable');
    }

    if (user.lockedAt) {
      actions.push('unlock');
    } else if (!isSelf) {
      actions.push('lock');
    }

    if (actions.length === 0) {
      return <span className="text-xs text-gray-400">—</span>;
    }

    return (
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action) => {
          const Icon = ACTION_ICONS[action];

          return (
            <Button
              key={action}
              size="xs"
              variant="outline"
              color={ACTION_COLORS[action]}
              onClick={() => askAction(user, action)}
              data-testid={`admin-user-action-${action}-${user.id}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {ACTION_LABELS[action]}
            </Button>
          );
        })}
      </div>
    );
  };

  const total = users?.total ?? 0;
  const items = users?.items ?? [];
  const limit = users?.limit ?? ADMIN_USERS_PAGE_SIZE;
  const rangeFrom = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeTo = total === 0 ? 0 : rangeFrom + items.length - 1;

  return (
    <div className="space-y-6 text-start">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {t('admin-users-table-title')}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {t('admin-users-table-subtitle')}
            </p>
          </div>
          <span className="badge badge-outline text-xs text-gray-500">
            {t('admin-users-total', { count: total })}
          </span>
        </div>

        <div className="p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="relative w-full max-w-md">
            <MagnifyingGlassIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-gray-400" />
            <input
              type="search"
              className="input input-bordered w-full ps-9"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('admin-users-search-placeholder')}
              aria-label={t('admin-users-search-placeholder')}
              data-testid="admin-users-search"
            />
          </div>
        </div>

        {actionError && (
          <div className="px-5 pt-4">
            <Alert status="error">{actionError}</Alert>
          </div>
        )}

        {isLoading ? (
          <div className="p-5 space-y-2">
            {[...Array(4)].map((_, index) => (
              <div
                key={index}
                className="h-12 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
              />
            ))}
          </div>
        ) : isError ? (
          <div className="p-5">
            <Alert status="error">
              {isError.message === 'Forbidden'
                ? t('admin-forbidden-desc')
                : t('admin-users-load-error')}
            </Alert>
          </div>
        ) : items.length === 0 ? (
          <div className="p-5">
            {search ? (
              <EmptyState
                title={t('admin-users-no-results-title')}
                description={t('admin-users-no-results-desc')}
              />
            ) : (
              <EmptyState
                title={t('admin-users-empty-title')}
                description={t('admin-users-empty-desc')}
              />
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">
                    {t('admin-users-col-user')}
                  </th>
                  <th className="py-3.5 px-4 font-semibold">
                    {t('admin-users-col-role')}
                  </th>
                  <th className="py-3.5 px-4 font-semibold">
                    {t('admin-users-col-teams')}
                  </th>
                  <th className="py-3.5 px-4 font-semibold">
                    {t('admin-users-col-created')}
                  </th>
                  <th className="py-3.5 px-4 font-semibold">
                    {t('admin-users-col-status')}
                  </th>
                  <th className="py-3.5 px-4 font-semibold">
                    {t('admin-users-col-actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors"
                    data-testid={`admin-user-row-${user.email}`}
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <LetterAvatar name={user.name || user.email} />
                        <div>
                          <div className="font-bold text-gray-900 dark:text-white">
                            {user.name || user.email}
                          </div>
                          <div
                            className="text-xs text-gray-400 font-mono mt-0.5"
                            dir="ltr"
                          >
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {user.platformRole === 'PLATFORM_ADMIN' ? (
                        <span className="badge badge-sm badge-primary text-white font-semibold">
                          {t('admin-users-role-platform-admin')}
                        </span>
                      ) : (
                        <span className="badge badge-sm badge-ghost">
                          {t('admin-users-role-member')}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {user.teamMembers.length === 0 ? (
                        <span className="text-xs text-gray-400">
                          {t('admin-users-teams-none')}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {user.teamMembers.map((membership) => (
                            <span
                              key={membership.id}
                              className="badge badge-sm badge-outline gap-1"
                            >
                              {membership.team.name}
                              <span className="text-[10px] text-gray-500">
                                {TEAM_ROLE_LABELS[membership.role] ||
                                  membership.role}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-600 dark:text-gray-300">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="py-3.5 px-4">{renderStatus(user)}</td>
                    <td className="py-3.5 px-4">{renderActions(user)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-5 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t('admin-users-range', {
              from: rangeFrom,
              to: rangeTo,
              total,
            })}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              data-testid="admin-users-prev"
            >
              {t('admin-users-prev')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!users?.hasMore || isLoading}
              onClick={() => setPage((current) => current + 1)}
              data-testid="admin-users-next"
            >
              {t('admin-users-next')}
            </Button>
          </div>
        </div>
      </div>

      {items.length === 0 && !isLoading && !isError && (
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <UsersIcon className="h-4 w-4" />
          <span>{t('admin-users-empty-hint')}</span>
        </div>
      )}

      {pendingAction && (
        <ConfirmationDialog
          visible={Boolean(pendingAction)}
          title={t('admin-users-confirm-title', {
            action: ACTION_LABELS[pendingAction.action],
          })}
          confirmText={ACTION_LABELS[pendingAction.action]}
          confirmColor={ACTION_COLORS[pendingAction.action]}
          loading={actionLoading}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => runAction(pendingAction.user, pendingAction.action)}
        >
          <div className="space-y-2">
            <p className="font-semibold" dir="ltr">
              {pendingAction.user.email}
            </p>
            <p>{ACTION_CONFIRMATIONS[pendingAction.action]}</p>
          </div>
        </ConfirmationDialog>
      )}
    </div>
  );
};

export default UsersAdmin;
