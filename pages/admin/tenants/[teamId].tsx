import { type ReactElement } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { ApiError } from 'lib/errors';
import { requirePlatformAdmin } from 'lib/guardPlatformAdmin';
import type { NextPageWithLayout } from 'types';

import {
  resolveEffectiveSubscriptionStatus,
  type AdminSubscriptionStatus,
} from 'models/adminDashboard';
import AdminNav from '@/components/admin/AdminNav';
import AdminSubscriptionBadge from '@/components/admin/AdminSubscriptionBadge';
import useAdminTenant from 'hooks/useAdminTenant';
import { formatDate } from '@/components/dashboard/format';
import {
  Card,
  Error as ErrorAlert,
  LetterAvatar,
  Loading,
} from '@/components/shared';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

interface AdminTenantPageProps {
  forbidden?: boolean;
  teamId: string;
}

const AdminTenantPage: NextPageWithLayout<AdminTenantPageProps> = ({
  forbidden,
  teamId,
}) => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const currentLocale = router.locale || 'ar';
  const isRtl = currentLocale === 'ar';

  const { tenant, isLoading, error, isNotFound } = useAdminTenant(teamId);

  // Single source of truth for the status the operator sees (shared with the
  // badge). A cancelled/expired subscription must never be described as an
  // active trial — see `resolveEffectiveSubscriptionStatus`.
  const effectiveSubscriptionStatus: AdminSubscriptionStatus | null =
    resolveEffectiveSubscriptionStatus(
      tenant?.subscription?.status,
      tenant?.subscription?.isTrial
    );

  if (forbidden) {
    return (
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        lang={currentLocale}
        className="min-h-screen bg-white text-[var(--ds-text)] px-4 py-16"
      >
        <Head>
          <title>{`${t('admin-forbidden-title')} — ${t('admin-platform-title')}`}</title>
        </Head>
        <div className="mx-auto max-w-lg text-center">
          <h1 className="mb-2 text-3xl font-bold text-error">
            {t('admin-forbidden-title')}
          </h1>
          <p className="text-gray-600">{t('admin-forbidden-desc')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      lang={currentLocale}
      className="min-h-screen bg-gray-50/50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-4 py-8 sm:px-6 lg:px-8"
    >
      <Head>
        <title>{`${tenant?.name || 'تفاصيل الشركة'} — ${t('admin-platform-title')}`}</title>
      </Head>

      <div className="mx-auto max-w-5xl">
        <AdminNav activeTab="tenants" />

        <Link
          href="/admin"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
        >
          <ArrowRightIcon className="h-4 w-4 rtl:rotate-180" />
          {t('admin-nav-overview')}
        </Link>

        {isLoading && <Loading />}

        {/* A nonexistent team id is a bad link, not an outage: the API answers
            404 for it, so it gets its own state instead of the generic alert. */}
        {isNotFound && (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
              المنشأة غير موجودة
            </h1>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
              لا توجد منشأة بهذا المُعرِّف. تأكد من صحة الرابط أو اختر المنشأة
              من قائمة الشركات.
            </p>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            >
              <ArrowRightIcon className="h-4 w-4 rtl:rotate-180" />
              {t('admin-nav-overview')}
            </Link>
          </div>
        )}

        {error && !isNotFound && (
          <ErrorAlert message="تعذر تحميل بيانات الشركة، يرجى المحاولة لاحقاً." />
        )}

        {tenant && (
          <div className="space-y-6">
            {/* Identity */}
            <Card>
              <Card.Body>
                <div className="flex items-center gap-4 flex-wrap">
                  <LetterAvatar name={tenant.name} />
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold">{tenant.name}</h1>
                    <p className="text-sm text-gray-400 font-mono">
                      /{tenant.slug}
                    </p>
                  </div>
                </div>

                <dl className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-gray-400">رابط ERP</dt>
                    <dd className="font-mono text-gray-900 dark:text-gray-100">
                      {tenant.erpSubdomain || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-400">حالة الربط</dt>
                    <dd className="text-gray-900 dark:text-gray-100">
                      {tenant.erpTenantId ? 'مربوطة بـ ERP' : 'غير مربوطة'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-400">عدد الأعضاء</dt>
                    <dd className="font-semibold text-gray-900 dark:text-gray-100">
                      {tenant.memberCount}
                    </dd>
                  </div>
                </dl>
              </Card.Body>
            </Card>

            {/* Subscription — reuses the existing admin-revenue-* locale keys
                instead of adding new ones (locked 2026-09-02 decision). */}
            <Card>
              <Card.Body>
                <Card.Header>
                  <Card.Title>{t('admin-revenue-col-status')}</Card.Title>
                </Card.Header>

                <div className="flex items-center gap-3 flex-wrap">
                  <AdminSubscriptionBadge
                    status={tenant.subscription?.status}
                    isTrial={tenant.subscription?.isTrial}
                    linked={Boolean(tenant.erpTenantId)}
                    reachable={tenant.erpReachable}
                  />
                  {/* Gated on the SAME resolved status the badge renders, so a
                      past-dated or cancelled trial cannot be labelled "free
                      trial" while the badge says expired/cancelled. */}
                  {effectiveSubscriptionStatus === 'trial' && (
                    <span className="text-xs text-gray-500">
                      {t('admin-revenue-free-trial')}
                    </span>
                  )}
                </div>

                <dl className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-gray-400">
                      {t('admin-revenue-col-plan')}
                    </dt>
                    <dd className="text-gray-900 dark:text-gray-100">
                      {tenant.subscription?.planName || (
                        <span className="text-gray-400">
                          {t('admin-revenue-unavailable')}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-400">
                      {t('admin-revenue-col-end-date')}
                    </dt>
                    <dd className="text-gray-900 dark:text-gray-100">
                      {tenant.subscription?.endDate
                        ? formatDate(tenant.subscription.endDate, 'ar')
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-400">الأيام المتبقية</dt>
                    <dd className="text-gray-900 dark:text-gray-100">
                      {typeof tenant.subscription?.daysRemaining === 'number'
                        ? tenant.subscription.daysRemaining === 1
                          ? t('admin-revenue-day-left')
                          : tenant.subscription.daysRemaining === 0
                            ? t('admin-revenue-expires-today')
                            : t('admin-revenue-days-left', {
                                count: tenant.subscription.daysRemaining,
                              })
                        : '—'}
                    </dd>
                  </div>
                </dl>

                {/* Per-plan module entitlements are NOT part of the P5.3 M2M
                    billing payload (AdminTenantRecord carries no modules
                    field), so they are intentionally not rendered here rather
                    than fabricated. Surfacing SubscriptionModules belongs to
                    the P5.4+ / P3.1 module work. */}
              </Card.Body>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  const { locale, params } = context;
  const teamId = typeof params?.teamId === 'string' ? params.teamId : '';

  try {
    await requirePlatformAdmin(context.req, context.res);
  } catch (error) {
    // Not signed in — follow the existing login-redirect convention.
    if (error instanceof ApiError && error.status === 401) {
      return {
        redirect: {
          destination: `/auth/login?callbackUrl=${encodeURIComponent(
            context.resolvedUrl
          )}`,
          permanent: false,
        },
      };
    }

    // Signed in but not a platform admin: render a safe forbidden state.
    if (error instanceof ApiError && error.status === 403) {
      context.res.statusCode = 403;

      return {
        props: {
          forbidden: true,
          teamId,
          ...(locale
            ? await serverSideTranslations(locale, ['common'])
            : await serverSideTranslations('ar', ['common'])),
        },
      };
    }

    // Anything else is an unexpected failure (e.g. database outage) —
    // rethrow so it surfaces as a real 500 instead of a misleading 403.
    throw error;
  }

  return {
    props: {
      forbidden: false,
      teamId,
      ...(locale
        ? await serverSideTranslations(locale, ['common'])
        : await serverSideTranslations('ar', ['common'])),
    },
  };
};

AdminTenantPage.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export default AdminTenantPage;
