import { type ReactElement } from 'react';
import type { NextPageWithLayout } from 'types';
import { InferGetServerSidePropsType } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { Button } from 'react-daisyui';

import { erp } from '@/lib/erp';

const Pricing: NextPageWithLayout<
  InferGetServerSidePropsType<typeof getServerSideProps>
> = ({ packages, error }) => {
  return (
    <div
      dir="rtl"
      lang="ar"
      className="min-h-screen bg-white text-[var(--ds-text)]"
    >
      <Head>
        <title>باقات SMART ERP</title>
      </Head>

      <main className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="mb-2 text-center text-3xl font-bold">باقات SMART ERP</h1>
        <p className="mb-12 text-center text-gray-600">
          اختر الباقة المناسبة لشركتك وابدأ تجربتك المجانية
        </p>

        {error && (
          <p className="text-center text-gray-600">
            تعذر تحميل الباقات، حاول مرة أخرى
          </p>
        )}

        {!error && packages.length === 0 && (
          <p className="text-center text-gray-600">لا توجد باقات متاحة حاليا</p>
        )}

        {!error && packages.length > 0 && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className="flex flex-col rounded-2xl border border-gray-200 p-6 shadow-sm"
              >
                <h2 className="mb-1 text-xl font-bold">{pkg.name}</h2>
                {pkg.description && (
                  <p className="mb-4 text-sm text-gray-600">
                    {pkg.description}
                  </p>
                )}
                <p className="mb-1 text-2xl font-bold text-primary">
                  {typeof pkg.priceMonthly === 'number' && pkg.priceMonthly > 0
                    ? `${pkg.priceMonthly} ر.س / شهرياً`
                    : 'مجاني'}
                </p>
                <p className="mb-6 text-sm text-gray-500">
                  {typeof pkg.trialDays === 'number' && pkg.trialDays > 0
                    ? `تجربة مجانية ${pkg.trialDays} يوم`
                    : 'ابدأ فورا'}
                </p>
                <div className="mt-auto">
                  <Link href={`/register?package=${pkg.id}`} className="w-full">
                    <Button color="primary" fullWidth size="md">
                      ابدأ الآن
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export const getServerSideProps = async () => {
  try {
    const packages = await erp.getPackages();
    return { props: { packages, error: false } };
  } catch {
    return { props: { packages: [], error: true } };
  }
};

Pricing.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export default Pricing;
