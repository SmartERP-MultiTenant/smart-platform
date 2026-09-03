import { type ReactElement } from 'react';
import type { NextPageWithLayout } from 'types';
import { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { Cairo, Almarai } from 'next/font/google';
import { useRouter } from 'next/router';
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
  const { t } = useTranslation('marketing');
  const { toggleTheme, selectedTheme } = useTheme();
  const router = useRouter();
  const currentLocale = router.locale || 'ar';
  const isRtl = currentLocale === 'ar';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      lang={currentLocale}
      className={`min-h-screen bg-white text-[var(--ds-text)] ${cairo.variable} ${almarai.variable}`}
      style={{
        fontFamily: 'var(--font-almarai), var(--font-cairo), sans-serif',
      }}
    >
      <Head>
        <title>{t('landing-page-title')}</title>
      </Head>

      <FenoiseHeader
        darkModeEnabled={env.darkModeEnabled}
        toggleTheme={toggleTheme}
        selectedThemeIcon={selectedTheme.icon}
        designSystemLabel={t('landing-design-system')}
        joinLabel={t('landing-start-now')}
        loginLabel={t('landing-login')}
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
      ...(locale
        ? await serverSideTranslations(locale, ['marketing', 'common'])
        : await serverSideTranslations('ar', ['marketing', 'common'])),
    },
  };
};

Home.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export default Home;
