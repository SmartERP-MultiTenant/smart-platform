import { type ReactElement } from 'react';
import type { NextPageWithLayout } from 'types';
import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { Button } from 'react-daisyui';

import { erp } from '@/lib/erp';

const Pricing: NextPageWithLayout<
  InferGetServerSidePropsType<typeof getServerSideProps>
> = ({ packages, error }) => {
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
        <title>{t('erp-pricing-page-title')}</title>
      </Head>

      <main className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="mb-2 text-center text-3xl font-bold">
          {t('erp-pricing-heading')}
        </h1>
        <p className="mb-12 text-center text-gray-600">
          {t('erp-pricing-subtitle')}
        </p>

        {error && (
          <p className="text-center text-gray-600">
            {t('erp-pricing-load-error')}
          </p>
        )}

        {!error && packages.length === 0 && (
          <p className="text-center text-gray-600">
            {t('erp-pricing-no-packages')}
          </p>
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
                    ? `${pkg.priceMonthly} ${t('erp-pricing-sar-monthly')}`
                    : t('erp-pricing-free')}
                </p>
                <p className="mb-6 text-sm text-gray-500">
                  {typeof pkg.trialDays === 'number' && pkg.trialDays > 0
                    ? t('erp-pricing-trial-days', { days: pkg.trialDays })
                    : t('erp-pricing-start-now')}
                </p>
                <div className="mt-auto">
                  <Link href={`/register?package=${pkg.id}`} className="w-full">
                    <Button color="primary" fullWidth size="md">
                      {t('erp-pricing-start-button')}
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

export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const { locale } = context;

  try {
    const packages = await erp.getPackages();
    return {
      props: {
        ...(locale
          ? await serverSideTranslations(locale, ['common'])
          : await serverSideTranslations('ar', ['common'])),
        packages,
        error: false,
      },
    };
  } catch {
    return {
      props: {
        ...(locale
          ? await serverSideTranslations(locale, ['common'])
          : await serverSideTranslations('ar', ['common'])),
        packages: [],
        error: true,
      },
    };
  }
};

Pricing.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export default Pricing;

