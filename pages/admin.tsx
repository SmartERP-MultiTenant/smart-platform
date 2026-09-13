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

import AdminNav from '@/components/admin/AdminNav';
import { AdminHealthCard, AdminTenantTable } from '@/components/admin';
import useAdminDashboard from 'hooks/useAdminDashboard';
import { StatCard } from '@/components/dashboard';
import { formatDate } from '@/components/dashboard/format';
import {
  Card,
  Error as ErrorAlert,
  LetterAvatar,
  Loading,
} from '@/components/shared';
import {
  ArrowRightIcon,
  BanknotesIcon,
  BuildingOffice2Icon,
  CheckBadgeIcon,
  ClockIcon,
  ExclamationCircleIcon,
  LinkIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';

const AdminPage: NextPageWithLayout<{ forbidden: boolean }> = ({
  forbidden,
}) => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const currentLocale = router.locale || 'ar';
  const isRtl = currentLocale === 'ar';

  const { dashboard, isLoading, error } = useAdminDashboard();

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      lang={currentLocale}
      className="min-h-screen bg-gray-50/50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-4 py-8 sm:px-6 lg:px-8"
    >
      <Head>
        <title>{t('admin-platform-title')}</title>
      </Head>

      <div className="mx-auto max-w-7xl">
        <AdminNav activeTab="overview" />

        {forbidden ? (
          <div className="mx-auto max-w-lg text-center py-12">
            <h1 className="mb-2 text-3xl font-bold text-error">
              {t('admin-forbidden-title')}
            </h1>
            <p className="text-gray-600">{t('admin-forbidden-desc')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <h2 className="text-xl font-bold">
                  {t('admin-welcome-title')}
                </h2>
                <span className="badge badge-warning font-medium">
                  {t('admin-wip-badge')}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                {t('admin-welcome-desc')}
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/admin/revenue"
                  className="inline-flex items-center gap-2 btn btn-primary text-white"
                >
                  <BanknotesIcon className="h-5 w-5" />
                  <span>{t('admin-view-revenue-btn')}</span>
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>

                <Link
                  href="/admin/users"
                  className="inline-flex items-center gap-2 btn btn-outline"
                >
                  <UsersIcon className="h-5 w-5" />
                  <span>{t('admin-view-users-btn')}</span>
                </Link>
              </div>
            </div>

            {/* P5.3: read-only tenant / subscription / ERP-health dashboard.
                Copy is hardcoded Arabic per the locked 2026-09-02 decision
                (no new locale files; see docs/implementation-plan-admin-dashboard.md). */}
            {isLoading && <Loading />}

            {error && (
              <ErrorAlert message="تعذر تحميل بيانات لوحة التحكم، يرجى المحاولة لاحقاً." />
            )}

            {dashboard && (
              <div className="space-y-6">
                {/* KPI Stat Cards.
                    NOTE: the `description` prop must be an expression, never a
                    double-quoted JSX attribute — check-locale.js treats such an
                    attribute as an i18n key reference and splits multi-word
                    values into bogus keys (same convention noted in
                    __tests__/components/dashboard/StatCard.spec.tsx). */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <StatCard
                    title="إجمالي الشركات"
                    value={dashboard.summary.totalTeams}
                    icon={BuildingOffice2Icon}
                    description={'إجمالي الفرق المسجلة'}
                  />
                  <StatCard
                    title="الشركات المربوطة بـ ERP"
                    value={dashboard.summary.linkedTeams}
                    icon={LinkIcon}
                    description={'تم ربطها بنظام ERP'}
                  />
                  <StatCard
                    title="الاشتراكات النشطة"
                    value={dashboard.summary.activeSubscriptions}
                    icon={CheckBadgeIcon}
                    description={'اشتراكات مدفوعة وسارية'}
                  />
                  <StatCard
                    title="الاشتراكات التجريبية"
                    value={dashboard.summary.trialSubscriptions}
                    icon={ClockIcon}
                    description={'فترة تجربة مجانية'}
                  />
                  <StatCard
                    title="الاشتراكات المنتهية"
                    value={dashboard.summary.expiredSubscriptions}
                    icon={ExclamationCircleIcon}
                    description={'تتطلب تجديداً'}
                  />
                </div>

                {/* ERP Health Card — degrades to a red state when ERP is down. */}
                <AdminHealthCard health={dashboard.health} />

                {/* Tenant table + recent registrations */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                  <div className="lg:col-span-2 space-y-6">
                    <AdminTenantTable tenants={dashboard.tenants} />
                  </div>

                  <div className="lg:col-span-1 space-y-6">
                    <Card>
                      <Card.Body>
                        <Card.Header>
                          <Card.Title>أحدث التسجيلات</Card.Title>
                          <Card.Description>
                            آخر الشركات التي انضمت إلى المنصة مؤخراً.
                          </Card.Description>
                        </Card.Header>

                        {dashboard.recentRegistrations.length === 0 ? (
                          <p className="text-sm text-gray-500 py-4 text-center">
                            لا توجد تسجيلات حديثة.
                          </p>
                        ) : (
                          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                            {dashboard.recentRegistrations.map((tenant) => (
                              <li
                                key={tenant.id}
                                className="py-3 flex items-center justify-between gap-3"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <LetterAvatar name={tenant.name} />
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                      {tenant.name}
                                    </p>
                                    <p className="text-xs text-gray-400 font-mono truncate">
                                      {tenant.erpSubdomain || tenant.slug}
                                    </p>
                                  </div>
                                </div>
                                <span className="text-[11px] text-gray-400 whitespace-nowrap">
                                  {formatDate(tenant.createdAt, 'ar')}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Card.Body>
                    </Card>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  const { locale } = context;

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
      ...(locale
        ? await serverSideTranslations(locale, ['common'])
        : await serverSideTranslations('ar', ['common'])),
    },
  };
};

AdminPage.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export default AdminPage;
