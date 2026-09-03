import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/router';
import type { LucideIcon } from 'lucide-react';

interface FenoiseHeaderProps {
  darkModeEnabled?: boolean;
  toggleTheme?: () => void;
  selectedThemeIcon?: LucideIcon;
  designSystemLabel?: string;
  joinLabel?: string;
  loginLabel?: string;
}

import { useTranslation } from 'next-i18next';

export default function FenoiseHeader({
  darkModeEnabled,
  toggleTheme,
  selectedThemeIcon: ThemeIcon,
  designSystemLabel,
  joinLabel,
  loginLabel,
}: FenoiseHeaderProps) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const currentLocale = router.locale || 'ar';

  const navItems = [
    { label: t('landing-nav-home'), href: '#home' },
    { label: t('landing-nav-about'), href: '#about' },
    { label: t('landing-nav-features'), href: '#features' },
    { label: t('landing-nav-pricing'), href: '#pricing' },
    { label: t('landing-nav-contact'), href: '#contact' },
  ];

  const resolvedDesignSystem = designSystemLabel || t('landing-design-system');
  const resolvedJoin = joinLabel || t('landing-start-now');
  const resolvedLogin = loginLabel || t('landing-login');

  const toggleLanguage = () => {
    const nextLocale = currentLocale === 'ar' ? 'en' : 'ar';
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    router.push(
      { pathname: router.pathname, query: router.query },
      undefined,
      {
        locale: nextLocale,
      }
    );
  };

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand (leading = right in RTL) */}
        <Link href="#home" className="flex shrink-0 items-center">
          <Image
            src="/logo/logo.png"
            alt="SMART PLATFORM"
            width={120}
            height={116}
            className="h-11 w-auto"
            priority
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 lg:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-[15px] font-normal text-gray-500 transition hover:text-gray-900"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* Language Switcher Pill */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 text-[14px] font-medium text-gray-700 shadow-sm transition hover:border-[var(--ds-primary-600)] hover:text-[var(--ds-primary-600)] hover:shadow"
            aria-label={t('landing-nav-switch-lang-aria')}
            title={t('landing-nav-switch-lang-aria')}
          >
            <svg
              className="h-4 w-4 text-gray-500 transition"
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
            <span>{t('landing-nav-switch-lang-label')}</span>
          </button>

          {darkModeEnabled && toggleTheme && ThemeIcon && (
            <button
              aria-label={t('switch-theme')}
              onClick={toggleTheme}
              className="rounded-lg p-0 text-gray-700"
            >
              <ThemeIcon className="h-5 w-5" />
            </button>
          )}
          <Link
            href="/auth/login"
            className="hidden text-[15px] font-medium text-[#111827] sm:block"
          >
            {resolvedLogin}
          </Link>
          <Link
            href="/design-system"
            className="hidden text-[15px] font-medium text-gray-500 md:block"
          >
            {resolvedDesignSystem}
          </Link>
          <Link
            href="/register"
            className="flex h-11 items-center rounded-full bg-[var(--ds-primary-600)] px-6 text-[15px] font-medium text-white transition hover:bg-[var(--ds-primary-700)]"
          >
            {resolvedJoin}
          </Link>
          {/* Mobile toggle */}
          <button
            aria-label={t('landing-nav-toggle-menu')}
            onClick={() => setOpen(!open)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-700 lg:hidden"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              {open ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-gray-100 bg-white lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col space-y-1 px-4 py-4">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-[15px] text-gray-700 hover:bg-gray-50"
              >
                {item.label}
              </a>
            ))}
            <Link
              href="/auth/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-[15px] text-gray-700 hover:bg-gray-50"
            >
              {resolvedLogin}
            </Link>

            <div className="border-t border-gray-100 pt-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  toggleLanguage();
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-[15px] font-medium text-gray-700 hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
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
                  <span>{t('landing-nav-switch-lang-label')}</span>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                  {currentLocale === 'ar' ? 'EN' : 'AR'}
                </span>
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
