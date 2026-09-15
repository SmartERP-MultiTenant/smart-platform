import { type ReactElement } from 'react';
import { GetServerSidePropsContext } from 'next';
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import type { NextPageWithLayout } from 'types';

import { PublicLayout } from '@/components/layouts';
import PaymentReceipt from '@/components/payment/PaymentReceipt';
import PaymentStatus from '@/components/payment/PaymentStatus';
import SEO from '@/components/shared/SEO';

const PaymentFailed: NextPageWithLayout = () => {
  const { t } = useTranslation('common');
  const router = useRouter();

  // The poll loop redirects here with the reference it was checking
  // (`router.replace('/payment/failed?order=…')`), so it is normally present.
  // It is shown because a failed payment is exactly the case where a customer
  // contacts support and needs something to quote.
  const order =
    typeof router.query.order === 'string' ? router.query.order : null;

  return (
    <>
      <SEO title={t('erp-payment-failed-page-title')} noIndex={true} />

      <div className="bg-gradient-to-b from-slate-50 to-white px-4 py-16">
        <PaymentStatus
          variant="failed"
          title={t('erp-payment-status-failed-title')}
          message={t('erp-payment-status-failed-msg')}
          // PG-23: the copy already told the customer to retry from the
          // pricing page while offering only a "Back to Home" link. The
          // primary CTA now goes where the copy says.
          primaryLabel={t('erp-payment-retry-from-pricing')}
          primaryHref="/pricing"
          secondaryLabel={t('erp-payment-back-home')}
          secondaryHref="/"
        />

        {/* No package or amount is resolvable on this page: the funnel's
            in-flight record is cleared when the callback page loads, before
            the poll that can send the customer here. Only the reference is
            certain, so only the reference is shown. */}
        {order && (
          <PaymentReceipt orderReference={order} showTaxInformation={false} />
        )}
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
