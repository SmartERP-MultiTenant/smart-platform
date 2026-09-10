import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { Button } from 'react-daisyui';
import type { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';

import env from '@/lib/env';
import useTeam from 'hooks/useTeam';
import fetcher from '@/lib/fetcher';
import { TeamTab } from '@/components/team';
import { Alert, ConfirmationDialog, Error, Loading } from '@/components/shared';
import InputWithLabel from '@/components/shared/InputWithLabel';

interface ErpSubscriptionPayload {
  linked: boolean;
  error?: string;
  tenantId?: string;
  subdomain?: string;
  subscription?: {
    status?: string;
    isTrial?: boolean;
    daysRemaining?: number;
    endDate?: string | null;
    needsWarning?: boolean;
  };
  modules?: unknown;
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const getStatusLabel = (
  status: string | undefined,
  t: (k: string) => string
) => {
  if (status === 'Trial') return t('erp-sub-status-trial');
  if (status === 'Active') return t('erp-sub-status-active');
  if (status === 'No active subscription') return t('erp-sub-status-none');
  return status || '';
};

const getStatusBadgeClass = (status: string | undefined) => {
  if (status === 'Active') return 'badge-success text-white';
  if (status === 'Trial') return 'badge-warning text-gray-900';
  if (status === 'No active subscription') return 'badge-error text-white';
  return 'badge-ghost';
};

const getLocalizedModuleName = (
  raw: string,
  t: (k: string) => string
): string => {
  const key = raw.toLowerCase().trim();
  if (key === 'accounting' || key === 'general_accounting')
    return t('erp-module-accounting');
  if (key === 'invoicing' || key === 'e_invoicing' || key === 'einvoicing')
    return t('erp-module-invoicing');
  if (key === 'inventory' || key === 'stock') return t('erp-module-inventory');
  if (key === 'pos' || key === 'point_of_sale') return t('erp-module-pos');
  if (key === 'hr' || key === 'human_resources' || key === 'employees')
    return t('erp-module-hr');
  if (key === 'crm' || key === 'customers') return t('erp-module-crm');
  if (key === 'payroll') return t('erp-module-payroll');
  if (key === 'purchases' || key === 'procurement')
    return t('erp-module-purchases');
  if (key === 'sales') return t('erp-module-sales');
  return raw;
};

const ErpSubscription = ({ teamFeatures }) => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const currentLocale = router.locale || 'ar';
  const { isLoading, isError, team } = useTeam();
  const { data, mutate } = useSWR<{ data: ErpSubscriptionPayload }>(
    team?.slug ? `/api/teams/${team?.slug}/erp` : null,
    fetcher
  );

  const [subdomain, setSubdomain] = useState('');
  const [adminUserName, setAdminUserName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [extending, setExtending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  if (isLoading) {
    return <Loading />;
  }

  if (isError) {
    return <Error message={isError.message} />;
  }

  if (!team) {
    return <Error message={t('team-not-found')} />;
  }

  const payload = data?.data;
  const linked = payload?.linked === true;
  const subscription = payload?.subscription;

  const currentEnd = subscription?.endDate;
  const computedNewEndDate = currentEnd
    ? new Date(new Date(currentEnd).getTime() + MONTH_MS)
    : new Date(Date.now() + MONTH_MS);

  const formattedNewEndDate = computedNewEndDate.toLocaleDateString(
    currentLocale === 'ar' ? 'ar-EG' : 'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setConnecting(true);

    try {
      const res = await fetch(`/api/teams/${team.slug}/erp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain, adminUserName, adminPassword }),
      });
      const json = await res.json();

      if (!res.ok) {
        const message: string = json?.error?.message || 'unknown-error';
        setFormError(
          message === 'otp-required'
            ? t('erp-team-otp-required')
            : message === 'invalid-credentials'
              ? t('invalid-credentials')
              : t('erp-team-unexpected-error')
        );
        return;
      }

      toast.success(t('erp-team-link-success'));
      setAdminPassword('');
      mutate();
    } catch {
      setFormError(t('erp-team-unexpected-error'));
    } finally {
      setConnecting(false);
    }
  };

  const executeExtend = async () => {
    setExtending(true);
    try {
      const res = await fetch(`/api/teams/${team.slug}/erp-extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEndDate: computedNewEndDate.toISOString() }),
      });
      const json = await res.json();

      if (!res.ok) {
        const message: string = json?.error?.message || 'unknown-error';
        toast.error(
          message === 'no-subscription'
            ? t('erp-team-no-active-sub')
            : message === 'super-admin-auth-failed'
              ? t('erp-team-billing-conn-failed')
              : message === 'not-linked'
                ? t('erp-team-unreachable')
                : t('erp-team-unexpected-error')
        );
        return;
      }

      toast.success(t('erp-team-extend-success'));
      mutate();
    } catch {
      toast.error(t('erp-team-unexpected-error'));
    } finally {
      setExtending(false);
      setShowExtendDialog(false);
    }
  };

  const executeCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/teams/${team.slug}/erp-cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();

      if (!res.ok) {
        const message: string = json?.error?.message || 'unknown-error';
        toast.error(
          message === 'no-subscription'
            ? t('erp-team-no-active-sub')
            : message === 'super-admin-auth-failed'
              ? t('erp-team-billing-conn-failed')
              : message === 'not-linked'
                ? t('erp-team-unreachable')
                : t('erp-team-unexpected-error')
        );
        return;
      }

      toast.success(t('erp-team-cancel-success'));
      mutate();
    } catch {
      toast.error(t('erp-team-unexpected-error'));
    } finally {
      setCancelling(false);
      setShowCancelDialog(false);
    }
  };

  const modulesList = (() => {
    const modules = payload?.modules;
    const list = Array.isArray(modules)
      ? modules
      : ((modules as any)?.modules ?? []);
    return list.map((item: any) =>
      String(
        item?.name ?? item?.code ?? item?.displayName ?? item?.title ?? item
      )
    );
  })();

  const statusLabel = getStatusLabel(subscription?.status, t);
  const statusBadgeClass = getStatusBadgeClass(subscription?.status);
  const endDateLabel = subscription?.endDate
    ? new Date(subscription.endDate).toLocaleDateString(
        currentLocale === 'ar' ? 'ar-EG' : 'en-US',
        { year: 'numeric', month: 'long', day: 'numeric' }
      )
    : null;

  return (
    <div>
      <TeamTab activeTab="erp" team={team} teamFeatures={teamFeatures} />

      <h3 className="text-xl font-bold mb-4">{t('erp-team-tab-title')}</h3>

      {payload?.error === 'erp-unreachable' && (
        <Alert className="mb-4" status="warning">
          {t('erp-team-unreachable')}
        </Alert>
      )}

      {!linked ? (
        <div className="rounded-lg p-6 border border-gray-200 dark:border-gray-700 bg-base-100 max-w-lg shadow-sm">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">
            {t('erp-team-link-desc')}
          </p>
          {formError && (
            <Alert className="mb-4" status="error">
              {formError}
            </Alert>
          )}
          <form onSubmit={connect} className="space-y-4">
            <InputWithLabel
              type="text"
              name="subdomain"
              label={t('erp-team-subdomain-label')}
              placeholder="company-name"
              value={subdomain}
              required
              onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
            />
            <InputWithLabel
              type="text"
              name="adminUserName"
              label={t('erp-team-username-label')}
              value={adminUserName}
              required
              onChange={(e) => setAdminUserName(e.target.value)}
            />
            <InputWithLabel
              type="password"
              name="adminPassword"
              label={t('password')}
              value={adminPassword}
              required
              onChange={(e) => setAdminPassword(e.target.value)}
            />
            <Button
              type="submit"
              color="primary"
              loading={connecting}
              disabled={connecting}
              fullWidth
            >
              {t('erp-team-link-button')}
            </Button>
          </form>
        </div>
      ) : (
        <div className="space-y-6 max-w-3xl">
          <div className="rounded-lg p-6 border border-gray-200 dark:border-gray-700 bg-base-100 shadow-sm">
            <div className="flex justify-between items-start flex-wrap gap-4 pb-4 border-b border-gray-100 dark:border-gray-700/60">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {t('erp-team-company-label')}
                </p>
                <p
                  className="text-xl font-bold mt-0.5 text-gray-900 dark:text-white"
                  dir="ltr"
                >
                  {payload?.subdomain}
                </p>
                {payload?.tenantId && (
                  <p
                    className="text-xs text-gray-500 dark:text-gray-400 mt-1"
                    dir="ltr"
                  >
                    {t('erp-team-tenant-label')}: {payload?.tenantId}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  {t('subscription-status')}
                </p>
                <span
                  className={`badge badge-lg font-semibold px-3.5 py-2.5 ${statusBadgeClass}`}
                >
                  {statusLabel || '—'}
                </span>
              </div>
            </div>

            {subscription?.needsWarning && (
              <Alert className="mt-4" status="warning">
                {t('erp-team-warning-expiring')}
              </Alert>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 text-sm">
              <div className="bg-base-200/50 dark:bg-base-300/30 p-3.5 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('erp-team-days-remaining')}
                </p>
                <p className="text-lg font-bold mt-1 text-gray-900 dark:text-white">
                  {typeof subscription?.daysRemaining === 'number'
                    ? t('erp-team-days-count', {
                        count: Math.floor(subscription.daysRemaining),
                      })
                    : '—'}
                </p>
              </div>
              <div className="bg-base-200/50 dark:bg-base-300/30 p-3.5 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('erp-team-end-date')}
                </p>
                <p className="text-lg font-bold mt-1 text-gray-900 dark:text-white">
                  {endDateLabel || '—'}
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6 flex-wrap">
              <Button
                color="primary"
                loading={extending}
                disabled={extending || cancelling}
                onClick={() => setShowExtendDialog(true)}
              >
                {t('erp-team-extend-month')}
              </Button>
              <Button
                color="error"
                variant="outline"
                loading={cancelling}
                disabled={extending || cancelling}
                onClick={() => setShowCancelDialog(true)}
              >
                {t('erp-team-cancel-sub')}
              </Button>
            </div>
          </div>

          <div className="rounded-lg p-6 border border-gray-200 dark:border-gray-700 bg-base-100 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3.5">
              {t('erp-team-modules-active')}
            </h4>
            {modulesList.length > 0 ? (
              <div className="flex flex-wrap gap-2.5">
                {modulesList.map((name: string, idx: number) => (
                  <span
                    key={`${name}-${idx}`}
                    className="badge badge-lg badge-primary badge-outline font-medium px-3.5 py-2.5"
                  >
                    {getLocalizedModuleName(name, t)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('erp-team-modules-empty')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Extend Subscription */}
      <ConfirmationDialog
        title={t('erp-team-extend-confirm-title')}
        visible={showExtendDialog}
        confirmColor="primary"
        confirmText={t('erp-team-confirm-extend-btn')}
        cancelText={t('cancel')}
        loading={extending}
        onConfirm={executeExtend}
        onCancel={() => setShowExtendDialog(false)}
      >
        <p>
          {t('erp-team-extend-confirm-desc', { date: formattedNewEndDate })}
        </p>
      </ConfirmationDialog>

      {/* Confirmation Dialog for Cancel Subscription */}
      <ConfirmationDialog
        title={t('erp-team-cancel-confirm-title')}
        visible={showCancelDialog}
        confirmColor="error"
        confirmText={t('erp-team-confirm-cancel-btn')}
        cancelText={t('cancel')}
        loading={cancelling}
        onConfirm={executeCancel}
        onCancel={() => setShowCancelDialog(false)}
      >
        <p>{t('erp-team-cancel-confirm-desc')}</p>
      </ConfirmationDialog>
    </div>
  );
};

export async function getServerSideProps({
  locale,
}: GetServerSidePropsContext) {
  return {
    props: {
      ...(locale
        ? await serverSideTranslations(locale, ['common'])
        : await serverSideTranslations('ar', ['common'])),
      teamFeatures: env.teamFeatures,
    },
  };
}

export default ErpSubscription;
