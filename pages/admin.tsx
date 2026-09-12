import { type ReactElement } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { ApiError } from 'lib/errors';
import { requirePlatformAdmin } from 'lib/guardPlatformAdmin';
import type { NextPageWithLayout } from 'types';

import AdminNav from '@/components/admin/AdminNav';
import Link from 'next/link';
import {
  BanknotesIcon,
  ArrowRightIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';

const AdminPage: NextPageWithLayout<{ forbidden: boolean }> = ({
  forbidden,
}) => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const currentLocale = router.locale || 'ar';
  const isRtl = currentLocale === 'ar';

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

                {/* P5.5 interim entry point until the P5.3 admin shell ships. */}
                <Link
                  href="/admin/users"
                  className="inline-flex items-center gap-2 btn btn-outline"
                >
                  <UsersIcon className="h-5 w-5" />
                  <span>{t('admin-view-users-btn')}</span>
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>
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
