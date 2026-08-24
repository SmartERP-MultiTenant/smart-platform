import { type ReactElement } from 'react';
import type { NextPageWithLayout } from 'types';
import { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { Cairo, Almarai } from 'next/font/google';
import useTheme from 'hooks/useTheme';
import env from '@/lib/env';
import Head from 'next/head';

// Fenoise SMART PLATFORM landing sections
import FenoiseHeader from '@/components/defaultLanding/fenoise/FenoiseHeader';
import HeroSection from '@/components/defaultLanding/fenoise/HeroSection';
import TrustSection from '@/components/defaultLanding/fenoise/TrustSection';
import FeaturesSection from '@/components/defaultLanding/fenoise/FeaturesSection';
import AlternatingSection from '@/components/defaultLanding/fenoise/AlternatingSection';
import MobileSection from '@/components/defaultLanding/fenoise/MobileSection';
import TestimonialsSection from '@/components/defaultLanding/fenoise/TestimonialsSection';
import CtaSection from '@/components/defaultLanding/fenoise/CtaSection';
import FooterSection from '@/components/defaultLanding/fenoise/FooterSection';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
});

const almarai = Almarai({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '700', '800'],
  variable: '--font-almarai',
});

const Home: NextPageWithLayout = () => {
  const { toggleTheme, selectedTheme } = useTheme();

  return (
    <div
      dir="rtl"
      lang="ar"
      className={`min-h-screen bg-white text-[var(--ds-text)] ${cairo.variable} ${almarai.variable}`}
      style={{
        fontFamily: 'var(--font-almarai), var(--font-cairo), sans-serif',
      }}
    >
      <Head>
        <title>SMART PLATFORM — نظام إدارة الأعمال المتكامل</title>
      </Head>

      <FenoiseHeader
        darkModeEnabled={env.darkModeEnabled}
        toggleTheme={toggleTheme}
        selectedThemeIcon={selectedTheme.icon}
        designSystemLabel="نظام التصميم"
        joinLabel="ابدأ الآن"
        loginLabel="تسجيل الدخول"
      />
      <main>
        <HeroSection />
        <TrustSection />
        <FeaturesSection />
        <AlternatingSection />
        <MobileSection />
        <TestimonialsSection />
        <CtaSection />
      </main>
      <FooterSection />
    </div>
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
      ...(locale ? await serverSideTranslations(locale, ['common']) : {}),
    },
  };
};

Home.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export default Home;
