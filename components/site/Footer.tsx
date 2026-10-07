import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import LanguageSwitcher from '@/components/LanguageSwitcher';
import env from '@/lib/env';

// Store URLs are optional and read directly here: the mobile apps are not
// published yet, so when a URL is unset the badge renders as a non-interactive
// "coming soon" chip rather than an anchor with no (or an unrelated) href.
// These keys are not part of `lib/env.ts` yet; they may move there once the
// apps ship.
const appStoreUrl = process.env.NEXT_PUBLIC_APP_STORE_URL;
const playStoreUrl = process.env.NEXT_PUBLIC_PLAY_STORE_URL;

/**
 * Cloned marketing footer (reference: wdtsassy.wpengine.com footer template
 * `footer-379`). Values come from the capture in
 * `/var/tmp/pi-scratch/wdtsassy-clone` (css/post-379.css, sections-desktop.json
 * S22-S32, ref-desktop.png, ref-mobile.png).
 *
 * Reference facts reproduced here:
 * - It is a LIGHT footer, not a dark one: radial-gradient(at top center,
 *   #0025E924 0%, #ABBBF2 100%), 2px solid #ABBBF2, radius 24px, inset 20px
 *   from the page edges, pattern overlay at opacity 0.065, plus a white radial
 *   glow (68% x 512px) near the top-end. The card IS the band shell, so it is
 *   never capped: measured `vw - 40` at x=20 at every width (1880 at 1920,
 *   2520 at 2560) — only the content container inside it caps, at 1700px
 *   (1460px inside the reference's 1501-1540 window, which our 1700px cap
 *   reproduces to within 20px there).
 * - Three rows: brand + "Downloads:" (47% / 53%, 1px #0000001C divider), the
 *   link grid (5 columns of 20%, divider), and the bottom bar (25% / 50% / 25%).
 * - Link item: Golos Text 16px/400, line-height 24px, colour #000, ~30px pitch.
 * - Desktop group titles are plain headings; on mobile every group collapses
 *   into a solid #0025E9 bar, radius 12px, white 20.26px/600 title, "+" at the
 *   end — the accordion is the signature mobile behaviour, so it is a native
 *   `<details>` there.
 * - There is NO newsletter form anywhere in the footer (the reference
 *   `structure-desktop.json` reports `footer.forms = []`); the only email
 *   capture on the page is the hero's.
 *
 * Content deviations: this footer's links are this product's real destinations
 * (`/pricing`, `/register`, `/terms`, `/privacy`, the in-page anchors the
 * public site already uses, and `env.supportUrl`). Groups whose only links
 * need an unconfigured destination are dropped rather than rendered dead, and
 * every in-page anchor names one of the nine band ids the homepage renders
 * (`hero`, `platform`, `tools`, `services`, `results`, `features`, `workflow`,
 * `remote-work`, `testimonials`) — a `/#…` target no band declares scrolls
 * nowhere, which is what `/#about` did before it was retargeted.
 */
export default function Footer() {
  const { t } = useTranslation('site');

  const contactHref = env.supportUrl;

  type FooterLink = { label: string; href: string; external?: boolean };
  type FooterGroup = { key: string; title: string; links: FooterLink[] };

  const allGroups: FooterGroup[] = [
    {
      key: 'platform',
      title: t('site.footer.group-platform'),
      links: [
        { label: t('site.footer.link-features'), href: '/#features' },
        { label: t('site.footer.link-pricing'), href: '/pricing' },
        { label: t('site.footer.link-customers'), href: '/#testimonials' },
        // "About Us" points at the "Our Work" band: on this page it is the only
        // company-level band (who runs on the platform, what the numbers are),
        // and the design has no about band of its own.
        { label: t('site.footer.link-about'), href: '/#results' },
      ],
    },
    {
      key: 'modules',
      title: t('site.footer.group-modules'),
      links: [
        { label: t('site.footer.link-accounting'), href: '/#features' },
        { label: t('site.footer.link-inventory'), href: '/#features' },
        { label: t('site.footer.link-hr'), href: '/#features' },
      ],
    },
    {
      key: 'resources',
      title: t('site.footer.group-resources'),
      links: [
        { label: t('site.footer.link-get-started'), href: '/register' },
        { label: t('site.footer.link-sign-in'), href: '/auth/login' },
        ...(contactHref
          ? [
              {
                label: t('site.footer.link-help'),
                href: contactHref,
                external: true,
              },
            ]
          : []),
      ],
    },
    {
      key: 'legal',
      title: t('site.footer.group-legal'),
      links: [
        { label: t('site.footer.link-terms'), href: '/terms' },
        { label: t('site.footer.link-privacy'), href: '/privacy' },
      ],
    },
    {
      key: 'company',
      title: t('site.footer.group-company'),
      links: [
        { label: t('site.footer.link-about'), href: '/#results' },
        { label: t('site.footer.link-customers'), href: '/#testimonials' },
        { label: t('site.footer.link-pricing'), href: '/pricing' },
      ],
    },
    {
      key: 'contact',
      title: t('site.footer.group-contact'),
      links: contactHref
        ? [
            {
              label: t('site.footer.link-contact-sales'),
              href: contactHref,
              external: true,
            },
            {
              label: t('site.footer.link-live-chat'),
              href: contactHref,
              external: true,
            },
          ]
        : [{ label: t('site.footer.link-sign-in'), href: '/auth/login' }],
    },
  ];

  const groups = allGroups.filter((group) => group.links.length > 0);

  // Desktop column layout: 5 columns of 20% — Resources and Legal stack in the
  // third column, exactly as the reference stacks them.
  const columns: FooterGroup[][] = [
    groups.slice(0, 1),
    groups.slice(1, 2),
    groups.slice(2, 4),
    groups.slice(4, 5),
    groups.slice(5, 6),
  ];

  const linkClass =
    'block py-[3px] text-[16px] leading-6 text-black transition-colors hover:text-[#0025E9]';

  const renderLink = (link: FooterLink) => (
    <li key={link.label}>
      {link.external ? (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {link.label}
        </a>
      ) : (
        <Link href={link.href} className={linkClass}>
          {link.label}
        </Link>
      )}
    </li>
  );

  const storeBadges = [
    {
      key: 'app-store',
      url: appStoreUrl,
      label: t('site.footer.badge-app-store'),
      icon: (
        <svg
          aria-hidden="true"
          width="20"
          height="24"
          viewBox="0 0 20 24"
          fill="#000000"
          className="shrink-0"
        >
          <path d="M16.36 12.72c.02-2.1 1.71-3.11 1.79-3.16-.98-1.43-2.5-1.63-3.04-1.65-1.3-.13-2.53.76-3.19.76-.66 0-1.67-.74-2.75-.72-1.41.02-2.72.82-3.44 2.09-1.47 2.55-.38 6.32 1.05 8.39.7 1.01 1.53 2.15 2.62 2.11 1.05-.04 1.45-.68 2.72-.68 1.27 0 1.63.68 2.74.66 1.13-.02 1.85-1.03 2.54-2.05.8-1.17 1.13-2.3 1.15-2.36-.03-.01-2.2-.85-2.19-3.39ZM14.3 5.6c.58-.7.97-1.68.86-2.66-.83.03-1.84.55-2.44 1.25-.53.62-1 1.61-.87 2.56.93.07 1.87-.47 2.45-1.15Z" />
        </svg>
      ),
    },
    {
      key: 'play-store',
      url: playStoreUrl,
      label: t('site.footer.badge-google-play'),
      icon: (
        <svg
          aria-hidden="true"
          width="20"
          height="22"
          viewBox="0 0 20 22"
          fill="none"
          className="shrink-0"
        >
          <path
            d="M1.6 1.2 11 11 1.6 20.8A1.7 1.7 0 0 1 1.2 19.6V2.4c0-.5.15-.9.4-1.2Z"
            fill="#00C4FF"
          />
          <path
            d="M14.4 8.1 3.4.6c-.4-.25-.9-.35-1.3-.25l9.3 9.3 3-1.55Z"
            fill="#00E676"
          />
          <path
            d="M14.4 13.9 11.4 12l-9.3 9.3c.4.1.9 0 1.3-.25l11-7.5Z"
            fill="#FF3A44"
          />
          <path
            d="m18.3 10-3.9-1.9-3 2.9 3 2.9 3.9-1.9c.9-.5.9-1.7 0-2Z"
            fill="#FFC107"
          />
        </svg>
      ),
    },
  ].map((badge) => ({
    ...badge,
    content: (
      <>
        {badge.icon}
        <span className="text-[15px] font-semibold leading-none text-black">
          {badge.label}
        </span>
      </>
    ),
  }));

  const badgeClass =
    'flex items-center gap-2 rounded-xl border border-white bg-white px-3.5 py-3 shadow-[0_0_30px_rgba(0,0,0,0.1)]';

  return (
    <footer className="w-full px-5 pb-5 pt-5">
      {/* The gutter is the band shell (reference `#smooth-content.inner-wrapper`:
          20px, no cap). The card below fills it edge to edge; the 40px the inner
          container sits in comes from the card's own `px-5` plus its 2px border. */}
      <div className="relative mx-auto w-full overflow-hidden rounded-3xl border-2 border-[#ABBBF2] bg-[radial-gradient(at_top_center,#0025E924_0%,#ABBBF2_100%)] px-5 pb-[30px] pt-[50px] xl:pt-[70px]">
        {/* Decorative white glow, top-end (reference spacer `4e585af`). */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute end-8 top-[122px] h-[512px] w-[68%] max-xl:top-[360px] max-xl:h-[546px] max-xl:w-full"
          style={{
            backgroundImage:
              'radial-gradient(at center center,rgba(255,255,255,0.62) 9%,rgba(255,255,255,0) 57%)',
          }}
        />

        <div className="relative z-[1] mx-auto w-full max-w-[1700px]">
          {/* Row 1 — brand + downloads */}
          <div className="flex flex-col items-center gap-8 border-b border-[#0000001C] pb-10 min-[480px]:flex-row min-[480px]:items-center min-[480px]:gap-0 xl:pb-[60px]">
            <div className="flex w-full items-center justify-center gap-4 min-[480px]:w-[47%] min-[480px]:justify-start min-[480px]:pe-5">
              <Link href="/" className="flex shrink-0 items-center gap-2.5">
                <Image
                  src="/logo/logo-mark.svg"
                  alt=""
                  width={40}
                  height={40}
                  className="h-9 w-auto xl:h-11"
                />
                <span
                  dir="ltr"
                  className="font-en text-[20px] font-extrabold leading-none tracking-wide text-black"
                >
                  {t('site.footer.brand-wordmark')}
                </span>
              </Link>
              <p className="w-[68%] text-start text-[16px] leading-6 text-black">
                {t('site.footer.tagline')}
              </p>
            </div>

            <div className="flex w-full flex-col items-center gap-4 min-[480px]:w-[53%] min-[480px]:items-end min-[480px]:ps-[30px] min-[480px]:text-end">
              <h2 className="text-[24px] font-semibold leading-tight text-black xl:text-[28px]">
                {t('site.footer.downloads')}
              </h2>
              <div className="flex flex-wrap items-center justify-center gap-2.5 min-[480px]:justify-end">
                {storeBadges.map((badge) =>
                  badge.url ? (
                    <a
                      key={badge.key}
                      href={badge.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${badgeClass} transition hover:shadow-[0_0_30px_rgba(0,0,0,0.2)]`}
                    >
                      {badge.content}
                    </a>
                  ) : (
                    // Not published yet: non-interactive, so the chip cannot
                    // promise a download that does not exist.
                    <span
                      key={badge.key}
                      aria-disabled="true"
                      className={`${badgeClass} cursor-not-allowed opacity-70`}
                    >
                      {badge.content}
                      <span className="sr-only">
                        {t('site.footer.badge-coming-soon')}
                      </span>
                    </span>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Row 2 — link grid: 5 columns on desktop, blue accordion bars on mobile */}
          <div className="border-b border-[#0000001C] py-10 xl:py-[60px] 2xl:py-[80px]">
            <div className="hidden xl:flex">
              {columns.map((column, columnIndex) => (
                <div
                  key={`column-${columnIndex}`}
                  className="w-1/5 pe-2.5 last:pe-0"
                >
                  {column.map((group, groupIndex) => (
                    <div
                      key={group.key}
                      className={groupIndex > 0 ? 'mt-[50px]' : undefined}
                    >
                      <h2 className="text-[27px] font-semibold leading-tight text-black">
                        {group.title}
                      </h2>
                      <ul className="mt-4">{group.links.map(renderLink)}</ul>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-4 xl:hidden">
              {groups.map((group) => (
                <details key={group.key} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl bg-[#0025E9] px-5 py-[18px] text-[20px] font-semibold leading-tight text-white marker:content-none">
                    {group.title}
                    <svg
                      aria-hidden="true"
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      className="shrink-0 transition-transform group-open:rotate-45"
                    >
                      <path
                        d="M9 1v16M1 9h16"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </summary>
                  <ul className="flex flex-col gap-1 pt-4 ps-2">
                    {group.links.map(renderLink)}
                  </ul>
                </details>
              ))}
            </div>
          </div>

          {/* Row 3 — bottom bar */}
          <div className="mt-[30px] flex flex-col items-center gap-5 text-center xl:flex-row xl:items-center xl:gap-0 xl:text-start">
            <div className="flex w-full justify-center xl:w-1/4 xl:justify-start">
              <LanguageSwitcher variant="pill" />
            </div>
            <div className="flex w-full flex-wrap items-center justify-center gap-x-6 gap-y-2 xl:w-1/2">
              <Link
                href="/privacy"
                className="text-[16px] text-black transition-colors hover:text-[#0025E9]"
              >
                {t('site.footer.link-privacy')}
              </Link>
              <Link
                href="/terms"
                className="text-[16px] text-black transition-colors hover:text-[#0025E9]"
              >
                {t('site.footer.link-terms')}
              </Link>
              {contactHref && (
                <a
                  href={contactHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[16px] text-black transition-colors hover:text-[#0025E9]"
                >
                  {t('site.footer.link-help')}
                </a>
              )}
            </div>
            <p className="w-full text-[16px] text-black xl:w-1/4 xl:text-end">
              {t('site.footer.copyright')}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
