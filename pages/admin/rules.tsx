import { type ReactElement } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { apiErrorStatus } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import type { NextPageWithLayout } from 'types';
import AdminNav from '@/components/admin/AdminNav';
import AdminRulesMatrix from '@/components/admin/AdminRulesMatrix';
import useAdminRules from 'hooks/useAdminRules';

interface AdminRulesPageProps {
  forbidden?: boolean;
}

const AdminRulesPage: NextPageWithLayout<AdminRulesPageProps> = ({
  forbidden,
}) => {
  const { t } = useTranslation('common');
  const {
    rules,
    isLoading,
    isSaving,
    saveError,
    mutate,
    updatePlanModules,
    syncAllModules,
  } = useAdminRules();

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
        <title>{`${t('admin-rules-page-title', 'قواعد وصلاحيات الباقات')} — ${t('admin-platform-title')}`}</title>
      </Head>

      <div className="mx-auto max-w-7xl">
        <AdminNav activeTab="rules" />
        <AdminRulesMatrix
          rules={rules}
          isLoading={isLoading}
          isSaving={isSaving}
          saveError={saveError}
          onUpdatePlanModules={updatePlanModules}
          onSyncAllModules={syncAllModules}
          onRefresh={() => mutate()}
        />
      </div>
    </div>
  );
};

AdminRulesPage.getLayout = function getLayout(page: ReactElement) {
  return page;
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  const { locale } = context;

  try {
    await requirePlatformAdmin(context.req, context.res);
  } catch (error) {
    const status = apiErrorStatus(error);
    if (status === 401) {
      return {
        redirect: {
          destination: `/auth/login?callbackUrl=${encodeURIComponent(
            context.resolvedUrl
          )}`,
          permanent: false,
        },
      };
    }
    if (status === 403) {
      return {
        props: {
          forbidden: true,
          ...(await serverSideTranslations(locale || 'ar', ['common'])),
        },
      };
    }
    throw error;
  }

  return {
    props: {
      ...(await serverSideTranslations(locale || 'ar', ['common'])),
    },
  };
};

export default AdminRulesPage;
