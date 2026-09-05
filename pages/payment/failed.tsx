import { type ReactElement } from 'react';
import Head from 'next/head';
import { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import type { NextPageWithLayout } from 'types';

import { PublicLayout } from '@/components/layouts';
import PaymentStatus from '@/components/payment/PaymentStatus';

const PaymentFailed: NextPageWithLayout = () => {
  const { t } = useTranslation('common');

  return (
    <>
      <Head>
        <title>{t('erp-payment-failed-page-title')}</title>
      </Head>

      <div className="bg-gradient-to-b from-slate-50 to-white px-4 py-16">
        <PaymentStatus
          variant="failed"
          title={t('erp-payment-status-failed-title')}
          message={t('erp-payment-status-failed-msg')}
          secondaryLabel={t('erp-payment-back-home')}
          secondaryHref="/"
        />
      </div>
    </>
  );
};

export async function getServerSideProps({
  locale,
}: GetServerSidePropsContext) {
  return {
    props: {
      ...(locale
        ? await serverSideTranslations(locale, ['common', 'marketing'])
        : await serverSideTranslations('ar', ['common', 'marketing'])),
    },
  };
}

PaymentFailed.getLayout = function getLayout(page: ReactElement) {
  return <PublicLayout compact>{page}</PublicLayout>;
};

export default PaymentFailed;
