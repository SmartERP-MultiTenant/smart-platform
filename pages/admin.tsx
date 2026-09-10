import { type ReactElement } from 'react';
import Head from 'next/head';
import { useTranslation } from 'next-i18next';
import { ApiError } from 'lib/errors';
import { requirePlatformAdmin } from 'lib/guardPlatformAdmin';
import type { NextPageWithLayout } from 'types';

import AdminNav from '@/components/admin/AdminNav';
import Link from 'next/link';
import { BanknotesIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

const AdminPage: NextPageWithLayout<{ forbidden: boolean }> = ({
  forbidden,
}) => {
  const { t } = useTranslation('common');

  return (
    <div
      dir="rtl"
      lang="ar"
      className="min-h-screen bg-gray-50/50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-4 py-8 sm:px-6 lg:px-8"
    >
      <Head>
        <title>{t('admin-platform-title')}</title>
      </Head>

      <div className="mx-auto max-w-7xl">
        <AdminNav activeTab="overview" />

        {forbidden ? (
          <div className="mx-auto max-w-lg text-center py-12">
            <h1 className="mb-2 text-3xl font-bold text-error">{t('admin-forbidden-title')}</h1>
            <p className="text-gray-600">
              {t('admin-forbidden-desc')}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <h2 className="text-xl font-bold mb-2">{t('admin-welcome-title')}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                {t('admin-welcome-desc')}
              </p>

              <Link
                href="/admin/revenue"
                className="inline-flex items-center gap-2 btn btn-primary text-white"
              >
                <BanknotesIcon className="h-5 w-5" />
                <span>{t('admin-view-revenue-btn')}</span>
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const getServerSideProps = async (context) => {
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
        props: { forbidden: true },
      };
    }

    // Anything else is an unexpected failure (e.g. database outage) —
    // rethrow so it surfaces as a real 500 instead of a misleading 403.
    throw error;
  }

  return {
    props: { forbidden: false },
  };
};

AdminPage.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export default AdminPage;
