import { type ReactElement } from 'react';
import type { NextPageWithLayout } from 'types';
import { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import env from '@/lib/env';
import Head from 'next/head';

// Fenoise SMART PLATFORM landing sections
import HeroSection from '@/components/defaultLanding/fenoise/HeroSection';
import TrustSection from '@/components/defaultLanding/fenoise/TrustSection';
import FeaturesSection from '@/components/defaultLanding/fenoise/FeaturesSection';
import AlternatingSection from '@/components/defaultLanding/fenoise/AlternatingSection';
import MobileSection from '@/components/defaultLanding/fenoise/MobileSection';
import TestimonialsSection from '@/components/defaultLanding/fenoise/TestimonialsSection';
import CtaSection from '@/components/defaultLanding/fenoise/CtaSection';
import { PublicLayout } from '@/components/layouts';

const Home: NextPageWithLayout = () => {
  const { t } = useTranslation('marketing');

  return (
    <>
      <Head>
        <title>{t('landing-page-title')}</title>
      </Head>
      <HeroSection />
      <TrustSection />
      <FeaturesSection />
      <AlternatingSection />
      <MobileSection />
      <TestimonialsSection />
      <CtaSection />
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
