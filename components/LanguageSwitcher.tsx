import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

interface LanguageSwitcherProps {
  /** 'pill' renders the compact header pill; 'mobile' renders the full-width row with a locale badge. */
  variant?: 'pill' | 'mobile';
  /** Optional callback fired before the locale switch (e.g. close a mobile menu). */
  onClick?: () => void;
}

function GlobeIcon() {
  return (
    <svg
      className="h-4 w-4 text-gray-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.6"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
      />
    </svg>
  );
}

export default function LanguageSwitcher({
  variant = 'pill',
  onClick,
}: LanguageSwitcherProps) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const currentLocale = router.locale || 'ar';

  const toggleLanguage = () => {
    const nextLocale = currentLocale === 'ar' ? 'en' : 'ar';
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    onClick?.();
    router.push({ pathname: router.pathname, query: router.query }, undefined, {
      locale: nextLocale,
    });
  };

  if (variant === 'mobile') {
    return (
      <button
        type="button"
        onClick={toggleLanguage}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-[15px] font-medium text-gray-700 hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <GlobeIcon />
          <span>{t('switch-lang-label')}</span>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
          {currentLocale === 'ar' ? 'EN' : 'AR'}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className="flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 text-[14px] font-medium text-gray-700 shadow-sm transition hover:border-[var(--ds-primary-600)] hover:text-[var(--ds-primary-600)] hover:shadow"
      aria-label={t('switch-lang-aria')}
      title={t('switch-lang-aria')}
    >
      <GlobeIcon />
      <span>{t('switch-lang-label')}</span>
    </button>
  );
}
