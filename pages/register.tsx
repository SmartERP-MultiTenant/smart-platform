import { type ReactElement } from 'react';
import type { NextPageWithLayout } from 'types';
import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import Head from 'next/head';

import { RegisterFunnel } from '@/components/erp/RegisterFunnel';
import env from '@/lib/env';

const Register: NextPageWithLayout<
  InferGetServerSidePropsType<typeof getServerSideProps>
> = ({ erpClientUrl, erpLoginPath, erpBaseDomain }) => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const currentLocale = router.locale || 'ar';
  const isRtl = currentLocale === 'ar';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      lang={currentLocale}
      className="min-h-screen bg-white text-[var(--ds-text)]"
    >
      <Head>
        <title>{t('erp-register-page-title')}</title>
      </Head>

      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="mb-2 text-center text-3xl font-bold">
          {t('erp-register-heading')}
        </h1>
        <p className="mb-10 text-center text-gray-600">
          {t('erp-register-subtitle')}
        </p>

        <RegisterFunnel
          erpClientUrl={erpClientUrl}
          erpLoginPath={erpLoginPath}
          erpBaseDomain={erpBaseDomain}
        />
      </main>
    </div>
  );
};

export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const { locale } = context;

  return {
    props: {
      ...(locale
        ? await serverSideTranslations(locale, ['common'])
        : await serverSideTranslations('ar', ['common'])),
      erpClientUrl: env.erp.clientUrl,
      erpLoginPath: env.erp.clientLoginPath,
      erpBaseDomain: env.erp.baseDomain,
    },
  };
};

Register.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export default Register;

