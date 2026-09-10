import { type ReactNode } from 'react';
import { Cairo, Almarai } from 'next/font/google';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import useTheme from 'hooks/useTheme';
import env from '@/lib/env';
import FenoiseHeader from '@/components/defaultLanding/fenoise/FenoiseHeader';
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

interface PublicLayoutProps {
  children: ReactNode;
  /** Compact header (brand + language + theme only) for focused status pages. */
  compact?: boolean;
}

export default function PublicLayout({
  children,
  compact = false,
}: PublicLayoutProps) {
  const { t } = useTranslation(['marketing', 'common']);
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
      <FenoiseHeader
        compact={compact}
        darkModeEnabled={env.darkModeEnabled}
        toggleTheme={toggleTheme}
        selectedThemeIcon={selectedTheme.icon}
        joinLabel={t('landing-start-now')}
        loginLabel={t('landing-login')}
      />
      <main>{children}</main>
      <FooterSection />
    </div>
  );
}
