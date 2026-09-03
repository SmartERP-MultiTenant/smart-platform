import { type ReactElement } from 'react';
import Head from 'next/head';
import { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import type { NextPageWithLayout } from 'types';

import PaymentStatus from '@/components/payment/PaymentStatus';

const PaymentFailed: NextPageWithLayout = () => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const currentLocale = router.locale || 'ar';
  const isRtl = currentLocale === 'ar';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      lang={currentLocale}
      className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-16"
    >
      <Head>
        <title>{t('erp-payment-failed-page-title')}</title>
      </Head>

      <main>
        <PaymentStatus
          variant="failed"
          title={t('erp-payment-status-failed-title')}
          message={t('erp-payment-status-failed-msg')}
          secondaryLabel={t('erp-payment-back-home')}
          secondaryHref="/"
        />
      </main>
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
    },
  };
}

PaymentFailed.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export default PaymentFailed;
