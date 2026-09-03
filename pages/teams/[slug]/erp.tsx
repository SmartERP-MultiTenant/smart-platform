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
import { Alert, Error, Loading } from '@/components/shared';
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

  if (isLoading) {
    return <Loading />;
  }

  if (isError) {
    return <Error message={isError.message} />;
  }

  if (!team) {
    return <Error message="team-not-found" />;
  }

  const payload = data?.data;
  const linked = payload?.linked === true;

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
              : message
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

  const extend = async () => {
    setExtending(true);
    try {
      const currentEnd = payload?.subscription?.endDate;
      const base = currentEnd
        ? new Date(new Date(currentEnd).getTime() + MONTH_MS)
        : new Date(Date.now() + MONTH_MS);
      const res = await fetch(`/api/teams/${team.slug}/erp-extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEndDate: base.toISOString() }),
      });
      const json = await res.json();

      if (!res.ok) {
        const message: string = json?.error?.message || 'unknown-error';
        toast.error(
          message === 'no-subscription'
            ? t('erp-team-no-active-sub')
            : message === 'super-admin-auth-failed'
              ? t('erp-team-billing-conn-failed')
              : message
        );
        return;
      }

      toast.success(t('erp-team-extend-success'));
      mutate();
    } catch {
      toast.error(t('erp-team-unexpected-error'));
    } finally {
      setExtending(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm(t('erp-team-cancel-confirm'))) {
      return;
    }

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
              : message
        );
        return;
      }

      toast.success(t('erp-team-cancel-success'));
      mutate();
    } catch {
      toast.error(t('erp-team-unexpected-error'));
    } finally {
      setCancelling(false);
    }
  };

  const modulesList = (() => {
    const modules = payload?.modules;
    const list = Array.isArray(modules)
      ? modules
      : ((modules as any)?.modules ?? []);
    return list.map((item: any) => String(item?.name ?? item?.code ?? item));
  })();

  const subscription = payload?.subscription;
  const statusLabel = getStatusLabel(subscription?.status, t);
  const endDateLabel = subscription?.endDate
    ? new Date(subscription.endDate).toLocaleDateString(
        currentLocale === 'ar' ? 'ar-EG' : 'en-US'
      )
    : null;

  return (
    <div>
      <TeamTab activeTab="erp" team={team} teamFeatures={teamFeatures} />

      <h3 className="text-lg font-semibold mb-4">{t('erp-team-tab-title')}</h3>

      {payload?.error === 'erp-unreachable' && (
        <Alert className="mb-4" status="warning">
          {t('erp-team-unreachable')}
        </Alert>
      )}

      {!linked ? (
        <div className="rounded p-6 border max-w-lg">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {t('erp-team-link-desc')}
          </p>
          {formError && (
            <Alert className="mb-4" status="error">
              {formError}
            </Alert>
          )}
          <form onSubmit={connect} className="space-y-3">
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
              fullWidth
            >
              {t('erp-team-link-button')}
            </Button>
          </form>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded p-6 border">
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <p className="text-sm text-gray-500">
                  {t('erp-team-company-label')}
                </p>
                <p className="text-lg font-semibold" dir="ltr">
                  {payload?.subdomain}
                </p>
                <p className="text-xs text-gray-500 mt-1" dir="ltr">
                  tenant: {payload?.tenantId}
                </p>
              </div>
              <div className="text-left">
                <p className="text-sm text-gray-500">
                  {t('subscription-status')}
                </p>
                {statusLabel ? (
                  <p className="text-lg font-semibold text-primary">
                    {statusLabel}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">—</p>
                )}
              </div>
            </div>

            {subscription?.needsWarning && (
              <Alert className="mt-4" status="warning">
                {t('erp-team-warning-expiring')}
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4 mt-6 text-sm">
              <div>
                <p className="text-gray-500">{t('erp-team-days-remaining')}</p>
                <p className="font-semibold">
                  {typeof subscription?.daysRemaining === 'number'
                    ? t('erp-team-days-count', {
                        count: Math.floor(subscription.daysRemaining),
                      })
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">{t('erp-team-end-date')}</p>
                <p className="font-semibold">{endDateLabel || '—'}</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6 flex-wrap">
              <Button
                color="primary"
                loading={extending}
                disabled={cancelling}
                onClick={extend}
              >
                {t('erp-team-extend-month')}
              </Button>
              <Button
                color="error"
                variant="outline"
                loading={cancelling}
                disabled={extending}
                onClick={cancel}
              >
                {t('erp-team-cancel-sub')}
              </Button>
            </div>
          </div>

          {modulesList.length > 0 && (
            <div className="rounded p-6 border">
              <p className="text-sm text-gray-500 mb-3">
                {t('erp-team-modules-active')}
              </p>
              <div className="flex flex-wrap gap-2">
                {modulesList.map((name: string, idx: number) => (
                  <span
                    key={`${name}-${idx}`}
                    className="badge badge-lg badge-outline"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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
