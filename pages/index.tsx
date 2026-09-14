import { type ReactElement } from 'react';
import type { NextPageWithLayout } from 'types';
import { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import env from '@/lib/env';
import SEO from '@/components/shared/SEO';

// SMART PLATFORM landing sections. The order and the set of sections live in
// the registry (`components/landing/sections.ts`, P4.25) — this page only maps
// over it, so adding or reordering a section never means editing the page.
import { landingSections } from '@/components/landing/sections';
import { PublicLayout } from '@/components/layouts';

const Home: NextPageWithLayout = () => {
  const { t } = useTranslation('marketing');

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'SMART PLATFORM',
      alternateName: 'SmartERP',
      url: 'https://platform.smartapro.com',
      logo: 'https://platform.smartapro.com/logo/logo.png',
      description:
        'منصة ERP سعودية سحابية متكاملة تجمع المحاسبة والمخزون والموارد البشرية والمبيعات والفوترة الإلكترونية المتوافقة مع هيئة الزكاة والضريبة والجمارك (ZATCA).',
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        areaServed: 'SA',
        availableLanguage: ['Arabic', 'English'],
      },
      // NOTE: only handles that are verifiable may appear here. The previously
      // listed LinkedIn URL (linkedin.com/company/smartapro) returns HTTP 404
      // — LinkedIn serves 200 for real companies — so it was removed rather
      // than advertised as a dead profile.
      sameAs: ['https://twitter.com/smartapro'],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'SMART PLATFORM',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      // No `offers` here on purpose: plan prices are not available to this
      // statically-rendered landing page (they come from the ERP at request
      // time via `erp.getPackages()`, as used by pages/pricing.tsx, which owns
      // the real AggregateOffer). Inventing lowPrice/offerCount here would be
      // fabricated pricing data.
      description:
        'نظام ERP سحابي وإداري متكامل للمنشآت في المملكة العربية السعودية.',
    },
  ];

  return (
    <>
      <SEO
        title={t('landing-page-title')}
        description={t('landing-hero-subtitle')}
        ogType="website"
        jsonLd={jsonLd}
      />
      {landingSections.map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </>
  );
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  // Redirect to login page if landing page is disabled
  if (env.hideLandingPage) {
    return {
      redirect: {
        destination: '/auth/login',
        permanent: true,
      },
    };
  }

  const { locale } = context;

  return {
    props: {
      ...(locale
        ? await serverSideTranslations(locale, ['marketing', 'common'])
        : await serverSideTranslations('ar', ['marketing', 'common'])),
    },
  };
};

Home.getLayout = function getLayout(page: ReactElement) {
  return <PublicLayout>{page}</PublicLayout>;
};

export default Home;
