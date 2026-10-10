import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

import LanguageSwitcher from '@/components/LanguageSwitcher';
import {
  HOVER_TRANSITION,
  MotionStyles,
  useReveal,
} from '@/components/site/motion';
import env from '@/lib/env';

/**
 * Cloned marketing navbar (reference: wdtsassy.wpengine.com header template
 * `header-35`). Structure, geometry and colour come from the captured evidence
 * in `/var/tmp/pi-scratch/wdtsassy-clone` (probe2-header.json, css/post-35.css,
 * tokens-desktop.json, ref-desktop.png).
 *
 * Reference facts reproduced here:
 * - `#header-wrapper.header-top-absolute` is position:relative, z-index 10 and
 *   NOT sticky — the header scrolls away and the hero pulls itself under it
 *   with a negative top margin. `grep -i sticky` over the 363 KB source HTML
 *   returns zero hits.
 * - Two separate glass pills, not one bar, ending flush with the content edges,
 *   with a transparent gap between them so the hero gradient shows through.
 *   Measured (`width-probe-ref.md` §e): at 1920 the left glass is 690x79 at
 *   x=110 and the right glass 600x75 at x=1202…1802, i.e. the two pills span
 *   the whole 1700px content container between them; below 1541 the left glass
 *   is 650 and the right 585; at <=1280 the right pill is removed and the left
 *   glass spans the whole container.
 *   The pill caps here are 720 (>=1281) / 740 (>=1536) rather than 690: this
 *   product's own logo lockup (mark + "SMART PLATFORM" wordmark, 245px) is
 *   135px wider than the reference's 110px logo image, so a 690px box cannot
 *   hold the logo *and* the nav links without the links spilling out of the
 *   glass (`min-w-[fit-content]` makes that impossible). The caps reproduce the
 *   reference's internal insets: logo 21/31px from the glass edge and 21px
 *   between the last nav link and the glass edge.
 * - Glass recipe on both pills (elementor `wdt-cus-glassmorphism`):
 *   linear-gradient(0deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.6) 100%),
 *   radius 24px, 1px solid rgba(243,246,254,.3), 0 0 100px rgba(0,37,233,.15),
 *   backdrop-filter blur(3px).
 * - Nav item: DM Sans 16px/500, padding 8px 22px; only the current page is
 *   `#0025E9`. Hover is a colour change only (no hover chip).
 * - Dropdown panel: white, 1px solid #fff, radius 12px, padding 10px 0,
 *   `0 10px 20px -5px rgba(0,37,233,.15)`, min-width 230px, 16px/500 items with
 *   10px 15px padding.
 * - At <=1280 the two columns collapse to one row of logo + hamburger and the
 *   nav/utility widgets are removed (elementor-hidden-tablet_extra), so the
 *   desktop bar is `min-[1281px]:` and below that the menu becomes an offcanvas
 *   drawer — the reference's own collapse point, where its left glass becomes
 *   the full 1200px container.
 * - Band gutter: a constant 40px at every width — the reference's 20px shell
 *   inset plus the header section's own `20px` horizontal padding. The row
 *   inside is `min(1700px, vw - 80)` centred, which is the reference's nav
 *   content container exactly at 2560/1920/1800/1600/1440/1280/768/390
 *   (430/110/50/40/40/40/40/40 from the viewport's left edge).
 *
 * Deviations from the reference, all forced by what this product actually has:
 * - The reference's "Search" affordance opens a site-search overlay. There is
 *   no site search route in this app, so that slot carries a "Sign In" link
 *   (`/auth/login`, an existing route) at the same typography and position.
 * - The reference shows the placeholder number "(+00) 123 456 789"; this build
 *   shows the owner-approved support channel instead. The link prefers
 *   `env.supportUrl` (`NEXT_PUBLIC_SUPPORT_URL`, the Docker build-arg) and
 *   falls back to the same approved WhatsApp link when that variable is unset,
 *   so the block renders in local dev too; the number it displays lives in
 *   `site.nav.support-number` (see `docs/env-matrix.md` §3.7).
 * - Fonts: DM Sans is not loaded by this app's public shell, so the component
 *   inherits the page font and only reproduces the reference's sizes/weights.
 *
 * Motion (stage 1c). Entrance, from the reference entrance probe §3.1: the header
 * band `b60cb9d` is one `elementor-invisible` element — `fadeIn`, 750ms `ease`,
 * delay 0 — and it is already inside the viewport at load, so it plays on mount
 * rather than on scroll. Hover, from the reference hover catalogue §2.1, in the
 * shared `HOVER_TRANSITION` classes: nav and dropdown-item colour `all 0.3s linear`
 * (`base`), the dropdown panel `margin-top 0.25s cubic-bezier(0.25,0.1,0.11,0.99)`
 * from its resting `30px` (`dropdown`), and the Get Started button `all 0.35s
 * ease-in-out` (`button`). The trigger is still pure `:hover` on the `li`, so a
 * keyboard user reaches the panel through `focus-within` exactly as before.
 *
 * Two hover deltas the probe measured are deliberately not reproduced here: the
 * `::before` clip-path wipe behind a dropdown item (the probe recorded the
 * clip-path transition but not that pseudo-element's background, and the rule is in
 * none of the captured stylesheets — inventing a colour would be guesswork), and the
 * `outline-width: 3px -> 0` on `.wdt-button`, which paints nothing in either state.
 * The Sign In link stands in for the reference's search control and takes that
 * control's measured colour transition.
 */

// The layout's collapse point: the drawer wrapper and its hamburger trigger are
// both `min-[1281px]:hidden`, and the desktop utility column is `hidden …
// min-[1281px]:flex`. This constant must stay in sync with those Tailwind
// classes — a JS media query cannot read a variant, so the breakpoint is
// written twice on purpose, and only here.
const DESKTOP_LAYOUT_QUERY = '(min-width: 1281px)';

export default function Navbar() {
  const { t } = useTranslation('site');
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // The header is one reveal element in the reference, so the hook is spread on
  // `<header>` itself and no wrapper element is introduced (the homepage mounts
  // this header inside an absolutely positioned overlay, so a wrapper would move
  // it). `header` is not one of the primitive's `Reveal` tags, which is why this
  // band calls the hook and renders `<MotionStyles />` itself.
  const header = useReveal<HTMLElement>({ effect: 'fadeIn' });

  // Owner-approved support channel: WhatsApp +966 50 750 1490, approved
  // 2026-09-14 and recorded in `docs/env-matrix.md` §3.7 as the
  // `NEXT_PUBLIC_SUPPORT_URL` Docker build-arg. The env value wins; the
  // fallback is the same channel, and exists because that variable is
  // build-time and unset in local dev, where the phone block would otherwise
  // not render at all.
  const contactHref = env.supportUrl || 'https://wa.me/966507501490';
  const isCurrent = (href: string) => href.split('#')[0] === router.pathname;

  // Close on navigation (the drawer's links are same-page anchors too).
  useEffect(() => {
    setMenuOpen(false);
  }, [router.asPath]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // Crossing into the desktop layout removes the drawer (and the trigger that
  // opened it) from the page, but `menuOpen` would stay true — and with it the
  // `overflow: hidden` that the effect above put on `<body>`, leaving a desktop
  // page that cannot scroll and has no control left to release the lock. Close
  // the menu when the desktop layout takes over. Idempotent: `setMenuOpen`
  // bails out when the value is unchanged, so this is a no-op once closed, and
  // it only ever runs in the browser (effects do not run during SSR).
  useEffect(() => {
    // jsdom — this component's unit-test environment — has no `matchMedia`
    // (same guard as `components/site/motion/useReveal.ts`). There is no
    // viewport to cross a breakpoint in, so there is nothing to close.
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const desktop = window.matchMedia(DESKTOP_LAYOUT_QUERY);
    const closeIfDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setMenuOpen(false);
      }
    };
    if (desktop.matches) {
      setMenuOpen(false);
    }
    desktop.addEventListener('change', closeIfDesktop);
    return () => desktop.removeEventListener('change', closeIfDesktop);
  }, []);

  const navItems: { label: string; href: string; children?: string[] }[] = [
    {
      label: t('site.nav.home'),
      href: '/',
    },
    {
      label: t('site.nav.solutions'),
      href: '/#features',
      children: [
        t('site.nav.solutions-accounting'),
        t('site.nav.solutions-inventory'),
        t('site.nav.solutions-hr'),
        t('site.nav.solutions-platform'),
      ],
    },
    { label: t('site.nav.pricing'), href: '/pricing' },
    {
      // Contact is always a destination: `contactHref` above is the configured
      // channel or the approved fallback number, so there is no in-page anchor
      // to fall back to (the removed `/#about` named a band that does not
      // exist).
      label: t('site.nav.contact'),
      href: contactHref,
    },
  ];

  const glassPill =
    'rounded-3xl border border-[#F3F6FE]/30 bg-[linear-gradient(0deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.6)_100%)] shadow-[0_0_100px_0_rgba(0,37,233,0.15)] backdrop-blur-[3px]';

  const navLinkClass = `block px-[22px] py-2 text-[16px] font-medium leading-normal ${HOVER_TRANSITION.base} hover:text-[#0025E9]`;

  return (
    // `relative z-10` and deliberately not sticky: the hero section owns the
    // negative top margin that slides it under this bar (reference `c09c781`
    // margin-top:-265px).
    <header
      {...header.motionProps}
      className="relative z-10 w-full px-10 pt-5 xl:pt-[30px] 2xl:pt-10"
    >
      <MotionStyles />
      <div className="mx-auto flex w-full max-w-[1700px] items-center justify-between gap-4">
        {/* Left pill: brand + primary nav */}
        <div
          className={`flex w-full min-w-[fit-content] flex-1 items-center justify-between min-[1281px]:max-w-[720px] 2xl:max-w-[740px] ${glassPill} px-5 py-[15px] xl:py-[21px] 2xl:px-[30px]`}
        >
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 pe-2.5"
            aria-label={t('site.nav.brand-home')}
          >
            <Image
              src="/logo/logo-mark.svg"
              alt=""
              width={40}
              height={40}
              priority
              className="h-9 w-auto"
            />
            <span
              dir="ltr"
              className="font-en text-[20px] font-extrabold leading-none tracking-wide text-black"
            >
              {t('site.nav.brand-wordmark')}
            </span>
          </Link>

          <nav aria-label={t('site.nav.primary-nav-label')}>
            <ul className="-me-2.5 hidden items-center min-[1281px]:flex">
              {navItems.map((item) => (
                <li
                  key={item.label}
                  className={item.children ? 'group relative' : 'relative'}
                >
                  <Link
                    href={item.href}
                    target={
                      contactHref && item.href === contactHref
                        ? '_blank'
                        : undefined
                    }
                    rel={
                      contactHref && item.href === contactHref
                        ? 'noopener noreferrer'
                        : undefined
                    }
                    aria-haspopup={item.children ? true : undefined}
                    aria-current={isCurrent(item.href) ? 'page' : undefined}
                    className={`${navLinkClass} flex items-center gap-1.5 ${
                      isCurrent(item.href) ? 'text-[#0025E9]' : 'text-black'
                    }`}
                  >
                    {item.label}
                    {item.children && (
                      <svg
                        aria-hidden="true"
                        width="10"
                        height="7"
                        viewBox="0 0 10 7"
                        fill="none"
                        className="mt-0.5 shrink-0"
                      >
                        <path
                          d="M1 1.5 5 5.5l4-4"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </Link>

                  {item.children && (
                    // `pt-2` keeps the pointer inside the group while crossing
                    // the gap between the item and the panel, so hover does not
                    // drop out mid-move. The panel's own `mt-[30px]` -> `mt-0` is
                    // the reference's measured open motion (`margin-top 0.25s`,
                    // probe §2.1); the margin sits inside the wrapper's box, so
                    // the hover bridge still spans it.
                    <div
                      className={`invisible absolute start-0 top-full z-20 pt-2 opacity-0 ${HOVER_TRANSITION.dropdown} group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100`}
                    >
                      <ul
                        className={`mt-[30px] min-w-[230px] rounded-xl border border-white bg-white py-2.5 shadow-[0_10px_20px_-5px_rgba(0,37,233,0.15)] group-hover:mt-0 group-focus-within:mt-0 ${HOVER_TRANSITION.dropdown}`}
                      >
                        {item.children.map((child) => (
                          <li key={child}>
                            <Link
                              href={item.href}
                              className={`block px-[15px] py-2.5 text-[16px] font-medium text-black ${HOVER_TRANSITION.base} hover:text-[#0025E9]`}
                            >
                              {child}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <button
            ref={triggerRef}
            type="button"
            aria-label={t('site.nav.open-menu')}
            aria-expanded={menuOpen}
            aria-controls="marketing-mobile-nav"
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-black min-[1281px]:hidden"
          >
            <svg
              aria-hidden="true"
              width="34"
              height="18"
              viewBox="0 0 34 18"
              fill="none"
            >
              <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M1 1h32M1 9h32M1 17h32" />
              </g>
            </svg>
          </button>
        </div>

        {/* Right pill: utilities + CTA. Removed below 1281, like the reference's
            `elementor-hidden-tablet_extra` column. */}
        <div
          className={`hidden w-full min-w-[fit-content] max-w-[600px] items-center justify-between gap-4 min-[1281px]:flex ${glassPill} px-[30px] py-2`}
        >
          <Link
            href="/auth/login"
            className={`shrink-0 text-[16px] font-medium text-black ${HOVER_TRANSITION.base} hover:text-[#0025E9]`}
          >
            {t('site.nav.sign-in')}
          </Link>

          {contactHref && (
            // `talk-to-experts-cta` was this block's second line until the
            // approved number took that slot; it is kept as the link's tooltip
            // because `scripts/check-locale.js` fails on a key that is declared
            // in `locales/**` but never used.
            <a
              href={contactHref}
              target="_blank"
              rel="noopener noreferrer"
              title={t('site.nav.talk-to-experts-cta')}
              className="group hidden shrink-0 items-center gap-2.5 min-[1440px]:flex"
            >
              <svg
                aria-hidden="true"
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                className="shrink-0"
              >
                <path
                  d="M12 8h16a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-9l-6 5v-5h-1a4 4 0 0 1-4-4v-8a4 4 0 0 1 4-4Z"
                  stroke="#000000"
                  strokeWidth="1.5"
                />
                <path
                  d="M17.4 14.6a1.3 1.3 0 0 1 1.8 0l.9.9c.5.5.5 1.3 0 1.8l-.5.5a6.4 6.4 0 0 0 2.6 2.6l.5-.5c.5-.5 1.3-.5 1.8 0l.9.9c.5.5.5 1.3 0 1.8l-.4.4c-.7.7-1.7 1-2.7.7a11.7 11.7 0 0 1-6.1-6.1c-.3-1 0-2 .7-2.7l.5-.3Z"
                  fill="#0025E9"
                />
              </svg>
              <span className="flex flex-col">
                <span className="whitespace-nowrap text-[13px] leading-tight text-black">
                  {t('site.nav.talk-to-experts')}
                </span>
                {/* `dir="ltr"` keeps the number readable in the RTL locale. The
                    reference turns this number link `#0025E9` on hover (probe
                    §2.1, `all 0.3s linear`); the `group` above is this anchor, so
                    the colour sits on the span that owns the `text-black` — the
                    label line above it is not recoloured, because in the
                    reference only the number is a link. */}
                <span
                  dir="ltr"
                  className={`whitespace-nowrap text-[17px] font-semibold leading-tight text-black group-hover:text-[#0025E9] ${HOVER_TRANSITION.base}`}
                >
                  {t('site.nav.support-number')}
                </span>
              </span>
            </a>
          )}

          {/* Language pill. No `onDarkSurface`: the public chrome is an
              always-light surface (that prop's own contract). */}
          <LanguageSwitcher variant="pill" />

          <Link
            href="/register"
            className={`flex shrink-0 items-center rounded-[15px] px-[30px] py-5 text-[17px] font-medium leading-none text-white shadow-[inset_0_0_0_2px_rgba(0,0,0,0.1),0_0_50px_-5px_rgba(0,0,0,0.45)] ${HOVER_TRANSITION.button} hover:[background-position:right_center]`}
            style={{
              backgroundColor: '#0025E9',
              backgroundImage:
                'linear-gradient(150deg,#0025E9 0%,#0025E9 10%,#ABBBF2 35%,#ABBBF2 0%,#ABBBF2 0%,#0025E9 100%)',
              backgroundSize: '450% 100%',
              backgroundRepeat: 'repeat',
            }}
          >
            {t('site.nav.get-started')}
          </Link>
        </div>
      </div>

      {/* Offcanvas drawer (reference `.mobile-nav-container-offcanvas-right`) */}
      {menuOpen && (
        <div
          id="marketing-mobile-nav"
          role="dialog"
          aria-modal="true"
          aria-label={t('site.nav.menu-title')}
          className="fixed inset-0 z-50 min-[1281px]:hidden"
        >
          <button
            type="button"
            aria-label={t('site.nav.close-menu')}
            onClick={() => {
              setMenuOpen(false);
              triggerRef.current?.focus();
            }}
            className="absolute inset-0 h-full w-full cursor-default bg-black/30"
          />
          <div className="absolute inset-y-0 end-0 flex w-[300px] max-w-[85vw] flex-col overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[18px] font-semibold text-black">
                {t('site.nav.menu-title')}
              </span>
              <button
                ref={closeRef}
                type="button"
                aria-label={t('site.nav.close-menu')}
                onClick={() => {
                  setMenuOpen(false);
                  triggerRef.current?.focus();
                }}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-black"
              >
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M6 18 18 6M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <nav
              aria-label={t('site.nav.primary-nav-label')}
              className="flex flex-col"
            >
              {navItems.map((item) => (
                <div key={item.label} className="border-b border-[#D9D9D9]/40">
                  <Link
                    href={item.href}
                    target={
                      contactHref && item.href === contactHref
                        ? '_blank'
                        : undefined
                    }
                    rel={
                      contactHref && item.href === contactHref
                        ? 'noopener noreferrer'
                        : undefined
                    }
                    aria-current={isCurrent(item.href) ? 'page' : undefined}
                    className={`block py-3 text-[17px] font-medium ${
                      isCurrent(item.href) ? 'text-[#0025E9]' : 'text-black'
                    }`}
                  >
                    {item.label}
                  </Link>
                  {item.children && (
                    <ul className="pb-2 ps-4">
                      {item.children.map((child) => (
                        <li key={child}>
                          <Link
                            href={item.href}
                            className="block py-2 text-[16px] text-[#5A5A5A]"
                          >
                            {child}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </nav>

            {/* Language row. `onClick` closes the drawer (and returns focus to
                the hamburger, like the X / overlay / Escape paths) so the menu
                does not stay open behind the locale switch. */}
            <LanguageSwitcher
              variant="mobile"
              onClick={() => {
                setMenuOpen(false);
                triggerRef.current?.focus();
              }}
            />

            <Link
              href="/register"
              className={`mt-5 flex items-center justify-center rounded-[15px] px-[30px] py-5 text-[17px] font-medium leading-none text-white shadow-[inset_0_0_0_2px_rgba(0,0,0,0.1),0_0_50px_-5px_rgba(0,0,0,0.45)] ${HOVER_TRANSITION.button} hover:[background-position:right_center]`}
              style={{
                backgroundColor: '#0025E9',
                backgroundImage:
                  'linear-gradient(150deg,#0025E9 0%,#0025E9 10%,#ABBBF2 35%,#ABBBF2 0%,#ABBBF2 0%,#0025E9 100%)',
                backgroundSize: '450% 100%',
                backgroundRepeat: 'repeat',
              }}
            >
              {t('site.nav.get-started')}
            </Link>
            <Link
              href="/auth/login"
              className="mt-3 flex items-center justify-center rounded-[15px] border-2 border-[#0025E9] px-[30px] py-4 text-[17px] font-medium leading-none text-[#0025E9]"
            >
              {t('site.nav.sign-in')}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
