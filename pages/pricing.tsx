import { type ReactElement } from 'react';
import type { NextPageWithLayout } from 'types';
import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import { Button } from 'react-daisyui';

import { erp } from '@/lib/erp';
import { PublicLayout } from '@/components/layouts';
import SEO from '@/components/shared/SEO';

const Pricing: NextPageWithLayout<
  InferGetServerSidePropsType<typeof getServerSideProps>
> = ({ packages, error }) => {
  const { t } = useTranslation('common');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'SMART PLATFORM ERP Plans',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'SAR',
      offerCount: String(packages.length || 3),
      offers: packages.map((pkg) => ({
        '@type': 'Offer',
        name: pkg.name,
        description: pkg.description || undefined,
        price: String(pkg.priceMonthly || 0),
        priceCurrency: 'SAR',
        availability: 'https://schema.org/InStock',
        url: 'https://platform.smartapro.com/pricing',
      })),
    },
    description:
      'باقات واشتراكات نظام SMART PLATFORM المحاسبي والإداري السحابي للشركات والمؤسسات.',
  };

  return (
    <>
      <SEO
        title={t('erp-pricing-page-title')}
        description={t('erp-pricing-subtitle')}
        ogType="product"
        jsonLd={jsonLd}
      />

      <div className="mx-auto max-w-6xl px-4 py-16">
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
                    ? t('erp-pricing-trial-days', { count: pkg.trialDays })
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
      </div>
    </>
  );
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  const { locale } = context;

  try {
    const packages = await erp.getPackages();
    return {
      props: {
        ...(locale
          ? await serverSideTranslations(locale, ['common', 'marketing'])
          : await serverSideTranslations('ar', ['common', 'marketing'])),
        packages,
        error: false,
      },
    };
  } catch {
    return {
      props: {
        ...(locale
          ? await serverSideTranslations(locale, ['common', 'marketing'])
          : await serverSideTranslations('ar', ['common', 'marketing'])),
        packages: [],
        error: true,
      },
    };
  }
};

Pricing.getLayout = function getLayout(page: ReactElement) {
  return <PublicLayout>{page}</PublicLayout>;
};

export default Pricing;
