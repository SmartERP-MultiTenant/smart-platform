import { type ReactNode } from 'react';
import { Cairo, Almarai } from 'next/font/google';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import LandingHeader from '@/components/landing/LandingHeader';
import FooterSection from '@/components/landing/FooterSection';

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
  /** Compact header (brand + language only) for focused status pages. */
  compact?: boolean;
}

export default function PublicLayout({
  children,
  compact = false,
}: PublicLayoutProps) {
  const { t } = useTranslation(['marketing', 'common']);
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
      <LandingHeader
        compact={compact}
        joinLabel={t('landing-start-now')}
        loginLabel={t('landing-login')}
      />
      <main>{children}</main>
      <FooterSection />
    </div>
  );
}
