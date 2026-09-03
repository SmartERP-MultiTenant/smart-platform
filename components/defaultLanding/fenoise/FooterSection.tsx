import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from 'next-i18next';
import TrustStrip from './TrustStrip';

export default function FooterSection() {
  const { t } = useTranslation('common');
  const [subscribed, setSubscribed] = useState(false);

  const columns = [
    {
      title: t('landing-footer-col-product'),
      links: [
        { label: t('landing-footer-col-solutions'), href: '#features' },
        { label: t('landing-footer-col-pricing'), href: '#pricing' },
        { label: t('landing-footer-col-customers'), href: '#contact' },
      ],
    },
    {
      title: t('landing-footer-col-company'),
      links: [
        { label: t('landing-footer-col-about'), href: '#about' },
        { label: t('landing-footer-col-partners'), href: '#contact' },
      ],
    },
    {
      title: t('landing-footer-col-support'),
      links: [{ label: t('landing-footer-col-contact'), href: '#contact' }],
    },
  ];

  return (
    <footer
      id="contact"
      className="border-t border-gray-100 bg-white pt-16 pb-8"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr]">
          {/* Brand + tagline */}
          <div>
            <Image
              src="/logo/logo.png"
              alt="SMART PLATFORM"
              width={96}
              height={93}
              className="h-12 w-auto"
            />
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-gray-500">
              {t('landing-footer-tagline')}
            </p>
          </div>

          {/* Link columns */}
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-bold text-[#111827]">{col.title}</p>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-gray-500 transition hover:text-gray-900"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Newsletter */}
          <div>
            <p className="text-base font-bold text-[#111827]">
              {t('landing-footer-newsletter-title')}
            </p>
            <p className="mt-3 text-[13px] text-gray-500">
              {t('landing-footer-newsletter-desc')}
            </p>
            <form
              className="mt-4 flex overflow-hidden rounded-lg border border-gray-200"
              onSubmit={(e) => {
                e.preventDefault();
                setSubscribed(true);
              }}
            >
              <input
                type="email"
                required
                placeholder={t('landing-footer-newsletter-placeholder')}
                aria-label={t('landing-footer-newsletter-placeholder')}
                className="w-full bg-white px-3 py-2 text-[13px] outline-none"
              />
              <button
                type="submit"
                className="shrink-0 bg-[var(--ds-primary-600)] px-4 text-sm font-medium text-white"
              >
                {t('landing-footer-newsletter-subscribe')}
              </button>
            </form>
            {subscribed && (
              <p className="mt-3 text-[13px] font-medium text-green-600">
                {t('landing-footer-newsletter-success')}
              </p>
            )}
          </div>
        </div>

        <div className="mt-12 border-t border-gray-100 pt-6 text-center">
          <p className="text-[13px] text-[#111827]">
            {t('landing-footer-copyright')}
          </p>
        </div>

        <TrustStrip />
      </div>
    </footer>
  );
}
