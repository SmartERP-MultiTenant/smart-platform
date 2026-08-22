import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

interface FenoiseHeaderProps {
  darkModeEnabled?: boolean;
  toggleTheme?: () => void;
  selectedThemeIcon?: LucideIcon;
  designSystemLabel?: string;
  joinLabel?: string;
  loginLabel?: string;
}

const NAV = [
  { label: 'الرئيسية', href: '#home' },
  { label: 'عن المنصة', href: '#about' },
  { label: 'المميزات', href: '#features' },
  { label: 'الأسعار', href: '#pricing' },
  { label: 'تواصل معنا', href: '#contact' },
];

export default function FenoiseHeader({
  darkModeEnabled,
  toggleTheme,
  selectedThemeIcon: ThemeIcon,
  designSystemLabel = 'نظام التصميم',
  joinLabel = 'ابدأ الآن',
  loginLabel = 'تسجيل الدخول',
}: FenoiseHeaderProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand (leading = right in RTL) */}
        <Link href="#home" className="flex shrink-0 items-center">
          <Image
            src="/logo/logo.png"
            alt="SMART ERP"
            width={120}
            height={116}
            className="h-11 w-auto"
            priority
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 lg:flex">
          {NAV.map((item) => (
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
          {darkModeEnabled && toggleTheme && ThemeIcon && (
            <button
              aria-label="تبديل المظهر"
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
            {loginLabel}
          </Link>
          <Link
            href="/design-system"
            className="hidden text-[15px] font-medium text-gray-500 md:block"
          >
            {designSystemLabel}
          </Link>
          <Link
            href="/register"
            className="flex h-11 items-center rounded-full bg-[var(--ds-primary-600)] px-6 text-[15px] font-medium text-white transition hover:bg-[var(--ds-primary-700)]"
          >
            {joinLabel}
          </Link>
          {/* Mobile toggle */}
          <button
            aria-label="القائمة"
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
            {NAV.map((item) => (
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
              {loginLabel}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
