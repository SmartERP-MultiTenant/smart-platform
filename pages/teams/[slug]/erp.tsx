import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { Button } from 'react-daisyui';
import type { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

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

const STATUS_LABELS: Record<string, string> = {
  Trial: 'تجريبي',
  Active: 'نشط',
  'No active subscription': 'لا يوجد اشتراك نشط',
};

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const ErpSubscription = ({ teamFeatures }) => {
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
            ? 'الحساب يحتاج تأكيد OTP — سجّل دخولك مرة أخرى'
            : message === 'invalid-credentials'
              ? 'بيانات الدخول غير صحيحة'
              : message
        );
        return;
      }

      toast.success('تم ربط الشركة بنجاح');
      setAdminPassword('');
      mutate();
    } catch {
      setFormError('حدث خطأ غير متوقع — حاول مرة أخرى');
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
            ? 'لا يوجد اشتراك نشط للتمديد'
            : message === 'super-admin-auth-failed'
              ? 'تعذر الاتصال بنظام الفوترة'
              : message
        );
        return;
      }

      toast.success('تم تمديد الاشتراك');
      mutate();
    } catch {
      toast.error('حدث خطأ غير متوقع — حاول مرة أخرى');
    } finally {
      setExtending(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm('هل أنت متأكد من إلغاء الاشتراك؟')) {
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
            ? 'لا يوجد اشتراك نشط للإلغاء'
            : message === 'super-admin-auth-failed'
              ? 'تعذر الاتصال بنظام الفوترة'
              : message
        );
        return;
      }

      toast.success('تم إلغاء الاشتراك');
      mutate();
    } catch {
      toast.error('حدث خطأ غير متوقع — حاول مرة أخرى');
    } finally {
      setCancelling(false);
    }
  };

  const modulesList = (() => {
    const modules = payload?.modules;
    const list = Array.isArray(modules) ? modules : (modules as any)?.modules ?? [];
    return list.map((item: any) =>
      String(item?.name ?? item?.code ?? item)
    );
  })();

  const subscription = payload?.subscription;
  const statusLabel = STATUS_LABELS[subscription?.status || ''] || subscription?.status || '';
  const endDateLabel = subscription?.endDate
    ? new Date(subscription.endDate).toLocaleDateString('ar-EG')
    : null;

  return (
    <div dir="rtl">
      <TeamTab activeTab="erp" team={team} teamFeatures={teamFeatures} />

      <h3 className="text-lg font-semibold mb-4">اشتراكك في نظام SMART PLATFORM</h3>

      {payload?.error === 'erp-unreachable' && (
        <Alert className="mb-4" status="warning">
          تعذر الوصول لخادم ERP — حاول لاحقًا
        </Alert>
      )}

      {!linked ? (
        <div className="rounded p-6 border max-w-lg">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            اربط حسابك في نظام ERP بهذا الفريق لعرض حالة الاشتراك وإدارته.
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
              label="الرابط الفرعي للشركة (subdomain)"
              placeholder="company-name"
              value={subdomain}
              required
              onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
            />
            <InputWithLabel
              type="text"
              name="adminUserName"
              label="اسم المستخدم أو البريد في النظام"
              value={adminUserName}
              required
              onChange={(e) => setAdminUserName(e.target.value)}
            />
            <InputWithLabel
              type="password"
              name="adminPassword"
              label="كلمة المرور"
              value={adminPassword}
              required
              onChange={(e) => setAdminPassword(e.target.value)}
            />
            <Button type="submit" color="primary" loading={connecting} fullWidth>
              ربط الشركة
            </Button>
          </form>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded p-6 border">
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <p className="text-sm text-gray-500">الشركة</p>
                <p className="text-lg font-semibold" dir="ltr">
                  {payload?.subdomain}
                </p>
                <p className="text-xs text-gray-500 mt-1" dir="ltr">
                  tenant: {payload?.tenantId}
                </p>
              </div>
              <div className="text-left">
                <p className="text-sm text-gray-500">حالة الاشتراك</p>
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
                اشتراكك ينتهي قريبًا!
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4 mt-6 text-sm">
              <div>
                <p className="text-gray-500">الأيام المتبقية</p>
                <p className="font-semibold">
                  {typeof subscription?.daysRemaining === 'number'
                    ? `${Math.floor(subscription.daysRemaining)} يوم`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">تاريخ الانتهاء</p>
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
                تمديد شهر
              </Button>
              <Button
                color="error"
                variant="outline"
                loading={cancelling}
                disabled={extending}
                onClick={cancel}
              >
                إلغاء الاشتراك
              </Button>
            </div>
          </div>

          {modulesList.length > 0 && (
            <div className="rounded p-6 border">
              <p className="text-sm text-gray-500 mb-3">الوحدات المفعلة</p>
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
      ...(locale ? await serverSideTranslations(locale, ['common']) : {}),
      teamFeatures: env.teamFeatures,
    },
  };
}

export default ErpSubscription;