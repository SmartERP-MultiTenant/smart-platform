/* eslint-disable i18next/no-literal-string */
import { type ReactElement } from 'react';
import Head from 'next/head';
import type { NextPageWithLayout } from 'types';

import PaymentStatus from '@/components/payment/PaymentStatus';

const PaymentFailed: NextPageWithLayout = () => {
  // NOTE: retrying from here is intentionally NOT implemented — creating a new
  // payment order requires the funnel context (tenant + package). The retry
  // path goes back to /pricing and the registration/activation flow.
  return (
    <div
      dir="rtl"
      lang="ar"
      className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-16"
    >
      <Head>
        <title>فشل الدفع — SMART ERP</title>
      </Head>

      <main>
        <PaymentStatus
          variant="failed"
          title="فشل الدفع"
          message="لم يكتمل الدفع، يمكنك المحاولة مرة أخرى من صفحة الأسعار."
          secondaryLabel="العودة إلى الرئيسية"
          secondaryHref="/"
        />
      </main>
    </div>
  );
};

PaymentFailed.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export default PaymentFailed;