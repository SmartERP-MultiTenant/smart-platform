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
import UsersAdmin from '@/components/admin/UsersAdmin';

interface AdminUsersPageProps {
  forbidden?: boolean;
}

// P5.5 — platform users administration (search, roles/teams, disable/lock).
// Guarded server-side by requirePlatformAdmin, mirroring pages/admin.tsx and
// pages/admin/revenue.tsx (middleware is defense in depth only).
const AdminUsersPage: NextPageWithLayout<AdminUsersPageProps> = ({
  forbidden,
}) => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const currentLocale = router.locale || 'ar';
  const isRtl = currentLocale === 'ar';

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
        <title>{t('admin-users-page-title')}</title>
      </Head>

      <div className="mx-auto max-w-7xl">
        <AdminNav activeTab="users" />
        <UsersAdmin />
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

AdminUsersPage.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export default AdminUsersPage;
