import Image from 'next/image';
import { useTranslation } from 'next-i18next';

import {
  HOVER_TRANSITION,
  MotionStyles,
  REVEAL_DELAY_MS,
  useReveal,
} from '@/components/site/motion';

/**
 * S04 — hero band; also renders the S05 dashboard visual (reference sections
 * `c09c781` + `7b55ebc`).
 *
 * Reference facts (post-53.css, spec-desktop.json, 1440px render):
 * - the surface is an inset, fully rounded rectangle floating on white:
 *   `radial-gradient(at top center, #0025E924 0%, #ABBBF2 100%)`, `border: 2px solid
 *   #ABB0F226`, radius 24px, 20px of white page on all four sides. It is NOT full-bleed.
 * - section padding `240px 20px 150px` at >=1541px and `200px 20px 0` at <=1540px. This
 *   band starts at page top because the header (S01) is absolutely positioned over it.
 * - a 773x512 white blob (`radial-gradient(rgba(255,255,255,0.8) 9%, transparent 62%)`)
 *   sits at x=-74 / y=27; without it the gradient reads as a flat wash.
 * - the iridescent wave (`hero-01-bg.jpg`, opacity 0.2, centre/cover) crosses the band at
 *   about 50% height and is reproduced here as inline SVG ribbons over CSS gradients.
 * - the dashboard visual carries `margin-bottom: -300px`, so it hangs ~300px below the
 *   band edge onto white. Measured on the reference render, the gap between the terms row
 *   bottom (574) and the glassy frame top (696) is 122px, so the visual is placed 120px
 *   below the terms row rather than at the raw 70px Elementor margin; every other measured
 *   text row lands within 1px of the reference. This band is NOT clipped (unlike S08): the
 *   visual is a sibling of the 24px clip layer that holds the gradient, the glow, the wave.
 * - the dashboard frame is the glassy screenshot frame (`radius 48px`, `padding 20px`,
 *   white gradient `rgba(255,255,255,0.5) -> 0.3`, `backdrop-filter: blur(5px)`,
 *   shadow `0 0 60px -15px rgba(0,0,0,0.3)`), and two floating 250px cards overlap it.
 * - the page's only h1 lives in this band. The reference renders an h2 at the same clamp
 *   (40.4968px @1440, 28.4585px @390); we keep that size because there is no type-scale
 *   hierarchy between the hero and any section — the page is airy by design.
 *
 * Geometry measured at 1440: band 1396x1079 at x=20, eyebrow text rows 234-243, h1 lines
 * 279-316 / 328-356, paragraph 394-429, input 540x56 at 466, terms row 552-574, glassy
 * frame 1096x688 starting at y=696, dashboard bottom at y=1400 (300px below the band).
 *
 * Motion — entrance (reference entrance probe §3.2, ids: `74c1856` heading widget, `3791cfd`
 * email widget, `7b55ebc` dashboard group, `73806cb` dashboard frame, `668992a` /
 * `6749d2e` floating panels). Read from the reference markup, each measured box maps to
 * one element here: `74c1856` is the heading widget that holds the eyebrow, the heading and
 * the paragraph (so all three slide together), and `3791cfd` is the mailchimp widget that
 * holds the input, the Subscribe button **and** the terms row (so both of our elements take
 * its 150ms delay). Both are `slideInUp` 750ms `ease` from 20% of their own box; the
 * dashboard group is `slideInUp` with the frame `fadeIn` inside it; the two floating panels
 * are `fadeIn` at **200ms** (inline start) and **400ms** (inline end) — the only three
 * delays anywhere on the reference page (probe §2). Everything comes from the shared
 * primitive; this band only decides which element carries which effect.
 *
 * Motion — hover (reference hover probe §3): the email input's border goes
 * `rgba(171,187,242,0.5)` → `#0025E9` over `0.3s linear`, and the Subscribe button swings
 * its 450%-wide gradient to `background-position: 100% 50%` over `0.35s ease-in-out`.
 * The reference has no hover state on the eyebrow, the heading, the terms checkbox or the
 * dashboard visuals, so none was added here. The floating panels and the dashboard are
 * `aria-hidden` decoration: `visibility: hidden` while armed keeps their boxes at the
 * measured offsets (`end-[-112px] top-[29px]`, `start-[-115px] bottom-[64px]`), and the
 * overhang (`VISUAL_PULL` / `OVERHANG_RESERVE`) is untouched — every effect is a
 * transform or an opacity, never a layout property.
 *
 * Width model (reference width probe §c): the coloured surface is the band *shell* — it
 * spans the 20px-gutter strip uncapped (`x20/w1880` at 1920, `x20/w2520` at 2560). The
 * boxed container inside it is capped at 1700px (`x110/w1700` at 1920, `x42/w1356` at
 * 1440), and the dashboard frame is 80% of that container (1085 = 0.8 × 1356 at 1440),
 * i.e. 1360px once the 1700px cap binds.
 */

const HEADING_FONT = "font-['DM_Sans',Almarai,sans-serif]";
const BODY_FONT = "font-['Golos_Text',Almarai,sans-serif]";

/** Reference hero padding: 150 mobile, 200 <=1540, 240 >=1541. */
const BAND_PADDING = 'px-5 pt-[150px] md:pt-[200px] 2xl:pt-[240px]';

/**
 * The dashboard visual hangs past the band edge by the negative margin below. The same
 * value is reserved by the section wrapper, so the overhang stays inside this component
 * and never covers the next band.
 */
const VISUAL_PULL = '-mb-[40px] md:-mb-[120px] lg:-mb-[180px] xl:-mb-[300px]';
const OVERHANG_RESERVE = 'pb-[40px] md:pb-[120px] lg:pb-[180px] xl:pb-[300px]';

const EYEBROW_CLS =
  'inline-flex items-center rounded-xl border-2 border-[#0025E9]/20 bg-[linear-gradient(150deg,#0025E9_0%,#0025E9_10%,#ABBBF2_35%,#ABBBF2_0%,#ABBBF2_0%,#0025E9_100%)] bg-clip-text px-3 py-2 text-[15px] font-semibold leading-none text-transparent shadow-[0_0_20px_rgba(0,0,0,0.15),inset_0_0_20px_rgba(255,255,255,0.5)]';

const H1_CLS = `${HEADING_FONT} text-[clamp(1.75rem,_1.4992rem_+_1.1465vw,_2.875rem)] font-semibold leading-[1.2] text-black`;

const BODY_CLS = `${BODY_FONT} text-base leading-6 text-[#5A5A5A]`;

const SUBSCRIBE_BTN_CLS = `${HEADING_FONT} inline-flex h-[56px] items-center justify-center rounded-xl border-0 bg-[#0025E9] bg-[linear-gradient(150deg,#0025E9_0%,#0025E9_10%,#ABBBF2_35%,#ABBBF2_0%,#ABBBF2_0%,#0025E9_100%)] bg-[length:450%_100%] px-[26px] text-[clamp(1rem,_0.9583rem_+_0.1389vw,_1.125rem)] font-medium leading-none text-white shadow-[inset_0_0_0_2px_rgba(0,0,0,0.1),0_0_50px_-5px_rgba(0,0,0,0.45)] ${HOVER_TRANSITION.button} hover:bg-[position:right_center]`;

/** Same glassy frame the reference wraps its screenshots in (S12 reuses the recipe). */
const GLASS_FRAME_CLS =
  'rounded-[48px] border border-white bg-[linear-gradient(90deg,rgba(255,255,255,0.5),rgba(255,255,255,0.3))] p-5 shadow-[0_0_60px_-15px_rgba(0,0,0,0.3)] backdrop-blur-[5px]';

const FLOATING_CARD_CLS =
  'absolute hidden w-[250px] rounded-3xl bg-white p-5 shadow-[0_0_60px_-15px_rgba(0,0,0,0.3)] xl:block';

/** Branch share of revenue, drawn as the filled bar in the floating panel. */
const BRANCHES = [
  { key: 'riyadh', share: 88 },
  { key: 'jeddah', share: 72 },
  { key: 'dammam', share: 58 },
  { key: 'makkah', share: 44 },
  { key: 'abha', share: 30 },
] as const;

const SCHEDULE_ROWS = [
  { key: 'invoices', share: 70, tinted: true },
  { key: 'stock', share: 45, tinted: false },
  { key: 'payroll', share: 30, tinted: true },
] as const;

const PERIODS = ['daily', 'monthly', 'yearly'] as const;

/**
 * The chip initials for a branch name: its first two characters, after the
 * Arabic definite article.
 *
 * One character does not separate the branches in Arabic — الرياض and الدمام
 * both open with the definite article `ال`, so their first character is `ا` and
 * their first two would both be `ال`. The article identifies no branch, so it is
 * dropped before the two characters are taken: `ري` / `دم` / `جد` / `مك` / `أب`
 * in Arabic, `Ri` / `Da` / `Je` / `Ma` / `Ab` in English. Two characters still
 * fit the 24px chip at `text-[11px]`, so the row geometry does not change.
 */
const branchInitials = (name: string) => name.replace(/^ال/, '').slice(0, 2);

/**
 * The iridescent ribbon that crosses the band at ~50% height. The reference ships a
 * 2560x1510 photo (`hero-01-bg.jpg`) at opacity 0.2; here the same soft streaking is
 * drawn as blurred gradient strokes so no binary asset is needed.
 */
function WaveRibbon() {
  return (
    <svg
      viewBox="0 0 1200 180"
      preserveAspectRatio="none"
      className="h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="s04-wave-white" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="35%" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="s04-wave-periwinkle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ABBBF2" stopOpacity="0" />
          <stop offset="45%" stopColor="#ABBBF2" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#F3F6FE" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="s04-wave-blue" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0025E9" stopOpacity="0" />
          <stop offset="50%" stopColor="#405FFF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0025E9" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="s04-wave-mint" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#CFF3E4" stopOpacity="0" />
          <stop offset="50%" stopColor="#CFF3E4" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#CFF3E4" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="s04-wave-blush" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFD9F2" stopOpacity="0" />
          <stop offset="50%" stopColor="#FFD9F2" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#FFD9F2" stopOpacity="0" />
        </linearGradient>
        <filter id="s04-wave-soft" x="-10%" y="-40%" width="120%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <g fill="none" strokeLinecap="round" filter="url(#s04-wave-soft)">
        <path
          d="M-40 118 C 140 66, 300 152, 520 112 C 740 72, 900 148, 1240 84"
          stroke="url(#s04-wave-white)"
          strokeWidth="24"
        />
        <path
          d="M-40 130 C 200 86, 380 158, 620 118 C 860 78, 1020 150, 1240 96"
          stroke="url(#s04-wave-periwinkle)"
          strokeWidth="18"
        />
        <path
          d="M-40 98 C 220 50, 400 130, 640 94 C 880 58, 1040 126, 1240 66"
          stroke="url(#s04-wave-mint)"
          strokeWidth="13"
        />
        <path
          d="M-40 108 C 160 62, 360 142, 600 104 C 840 66, 1000 134, 1240 76"
          stroke="url(#s04-wave-blush)"
          strokeWidth="11"
        />
        <path
          d="M-40 142 C 180 102, 420 166, 660 128 C 900 90, 1060 156, 1240 110"
          stroke="url(#s04-wave-blue)"
          strokeWidth="8"
        />
      </g>
    </svg>
  );
}

export default function HeroSection() {
  const { t } = useTranslation('site');

  // Entrance, one hook per reference element (probe §3.2). `useReveal` renders no element
  // of its own, so the band keeps its measured markup; the shared `<MotionStyles />` at the
  // end of the section carries the effects.
  const headingBlock = useReveal<HTMLDivElement>({ effect: 'slideUp' });
  // The reference's mailchimp widget (`3791cfd`) holds the input, the button and the terms
  // row in one box; our markup splits them, so both take that widget's effect and 150ms.
  const emailCapture = useReveal<HTMLFormElement>({
    effect: 'slideUp',
    delayMs: REVEAL_DELAY_MS.heroEmailForm,
  });
  const termsRow = useReveal<HTMLDivElement>({
    effect: 'slideUp',
    delayMs: REVEAL_DELAY_MS.heroEmailForm,
  });
  const dashboardGroup = useReveal<HTMLDivElement>({ effect: 'slideUp' });
  // The frame itself is static in the reference (`7b55ebc` slides as a whole); the
  // `fadeIn` belongs to the image inside it, which is what this inner plate wraps.
  const dashboardImage = useReveal<HTMLDivElement>({ effect: 'fadeIn' });
  // The reference's start-side floating panel is the 200ms one and its end-side panel
  // the 400ms one; the panels they map to here are the schedule card at the inline start
  // and the revenue card at the inline end.
  const schedulePanel = useReveal<HTMLDivElement>({
    effect: 'fadeIn',
    delayMs: REVEAL_DELAY_MS.heroFloatStart,
  });
  const revenuePanel = useReveal<HTMLDivElement>({
    effect: 'fadeIn',
    delayMs: REVEAL_DELAY_MS.heroFloatEnd,
  });

  return (
    <section id="hero" className="px-5">
      {/* Band shell: the full 20px-gutter strip, no cap at any width (§c). The overhang
          reserve still lives here so the dashboard's negative margin stays contained. */}
      <div className={`w-full ${OVERHANG_RESERVE}`}>
        {/* ---------------------------------------------------------- band surface */}
        <div
          className={`relative flex flex-col ${BAND_PADDING} rounded-[24px] border-2 border-[#ABB0F2]/15 text-center`}
        >
          {/* Everything inside this layer is clipped to the 24px corners. The dashboard
              visual deliberately lives outside it so it stays unclipped. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 overflow-hidden rounded-[24px]"
          >
            <span className="absolute inset-0 bg-[radial-gradient(at_top_center,#0025E924_0%,#ABBBF2_100%)]" />
            {/* 773x512 white blob at x=-74 / y=27. */}
            <span className="absolute start-[-74px] top-[27px] h-[512px] w-[773px] bg-[radial-gradient(circle,rgba(255,255,255,0.8)_9%,transparent_62%)]" />
            <span className="absolute inset-x-0 top-[54%] h-[190px] -translate-y-1/2 opacity-[0.6]">
              <WaveRibbon />
            </span>
          </div>

          <div
            {...headingBlock.motionProps}
            className="relative mx-auto w-full max-w-[1700px]"
          >
            <span className={EYEBROW_CLS}>{t('site.hero.eyebrow')}</span>

            <h1 className={`${H1_CLS} mx-auto mt-[15px] max-w-[680px]`}>
              {t('site.hero.title')}
            </h1>

            <p className={`${BODY_CLS} mx-auto mt-[20px] max-w-[540px]`}>
              {t('site.hero.subtitle')}
            </p>
          </div>

          {/* ------------------------------------------------------------ email capture */}
          <form
            {...emailCapture.motionProps}
            action="/register"
            method="get"
            aria-label={t('site.hero.formLabel')}
            className="relative mx-auto mt-[30px] w-full max-w-[540px] text-start"
          >
            <label htmlFor="s04-hero-email" className="sr-only">
              {t('site.hero.emailLabel')}
            </label>
            <input
              id="s04-hero-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder={t('site.hero.emailPlaceholder')}
              className={`${BODY_CLS} h-[56px] w-full rounded-xl border border-[#ABBBF2]/50 bg-white ps-[26.67px] pe-[26.67px] text-black shadow-[0_0_60px_rgba(0,0,0,0.21)] outline-none placeholder:text-[#5A5A5A] focus-visible:ring-2 focus-visible:ring-[#0025E9]/40 md:pe-[152px] ${HOVER_TRANSITION.base} hover:border-[#0025E9]`}
            />
            {/* Reference: Subscribe is 137x56, radius 12, pinned 5px past the input edge.
                Below md it drops to its own centred line under the input. */}
            <div className="mt-[15px] text-center md:absolute md:end-[-5px] md:top-1/2 md:mt-0 md:-translate-y-1/2">
              <button type="submit" className={SUBSCRIBE_BTN_CLS}>
                {t('site.hero.subscribe')}
              </button>
            </div>
          </form>

          {/* --------------------------------------------------------------- terms row */}
          <div {...termsRow.motionProps} className="relative mt-[30px]">
            <label className="inline-flex cursor-pointer items-start gap-[10px] text-start">
              <span className="relative mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  name="terms"
                  value="accepted"
                  required
                  className="peer h-[22px] w-[22px] cursor-pointer appearance-none rounded-full border border-[#D9D9D9] bg-white transition motion-reduce:transition-none checked:border-[#0025E9] checked:bg-[#0025E9]"
                />
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="pointer-events-none absolute h-[12px] w-[12px] text-white opacity-0 transition motion-reduce:transition-none peer-checked:opacity-100"
                >
                  <path
                    d="M4 12.5 9.5 18 20 6.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className={`${BODY_CLS} text-black`}>
                {t('site.hero.terms')}
              </span>
            </label>
          </div>

          {/* ------------------------------------------------- S05 dashboard visual */}
          {/* 1360px = 80% of the 1700px content container, the reference's own ceiling for
              the glassy frame (1085 = 0.8 × 1356 at 1440). Below 1781px the cap never
              binds and `lg:w-[80%]` alone reproduces the measured frame width. */}
          <div
            {...dashboardGroup.motionProps}
            className={`relative z-10 mx-auto mt-[40px] w-full max-w-[1360px] md:mt-[120px] lg:w-[80%] ${VISUAL_PULL}`}
          >
            <div className={GLASS_FRAME_CLS}>
              <div
                {...dashboardImage.motionProps}
                className="overflow-hidden rounded-[24px] bg-white"
              >
                <Image
                  src="/site/dashboard.webp"
                  alt={t('site.hero.dashboardAlt')}
                  width={1440}
                  height={900}
                  priority
                  sizes="(min-width: 1781px) 1360px, (min-width: 1024px) 78vw, 100vw"
                  className="h-auto w-full"
                />
              </div>
            </div>

            {/* Floating revenue panel — reference `dashboard-1.jpg`, 250x360 at the
                frame's end edge, starting 29px below the frame top. Desktop only. */}
            <div
              {...revenuePanel.motionProps}
              className={`${FLOATING_CARD_CLS} end-[-112px] top-[29px]`}
              aria-hidden="true"
            >
              <div className="flex items-center justify-between">
                <p
                  className={`${HEADING_FONT} text-[15px] font-semibold text-black`}
                >
                  {t('site.hero.panelTitle')}
                </p>
                <span className="text-[15px] leading-none text-black/40">
                  ...
                </span>
              </div>
              <ul className="mt-[14px] space-y-[13px]">
                {BRANCHES.map((branch) => (
                  <li key={branch.key}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-[8px]">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#F3F6FE] font-['DM_Sans',Almarai,sans-serif] text-[11px] font-semibold text-[#0025E9]">
                          {branchInitials(
                            t(`site.hero.branches.${branch.key}.name`)
                          )}
                        </span>
                        <span
                          className={`${BODY_FONT} text-[13px] leading-none text-black`}
                        >
                          {t(`site.hero.branches.${branch.key}.name`)}
                        </span>
                      </span>
                      <span
                        className={`${BODY_FONT} text-[12px] leading-none text-[#5A5A5A]`}
                      >
                        {t(`site.hero.branches.${branch.key}.amount`)}
                      </span>
                    </div>
                    <span className="mt-[6px] block h-[3px] w-full overflow-hidden rounded-full bg-[#F3F6FE]">
                      <span
                        className="block h-full rounded-full bg-[#0025E9]"
                        style={{ width: `${branch.share}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Floating period card — reference `dashboard-2.jpg`, 250x290 overlapping
                the frame's bottom-start corner. Desktop only. */}
            <div
              {...schedulePanel.motionProps}
              className={`${FLOATING_CARD_CLS} bottom-[64px] start-[-115px]`}
              aria-hidden="true"
            >
              <div className="flex items-center gap-[4px] rounded-xl bg-[#F3F6FE] p-[4px]">
                {PERIODS.map((period, index) => (
                  <span
                    key={period}
                    className={`${HEADING_FONT} flex-1 rounded-[9px] px-[6px] py-[7px] text-center text-[12px] font-medium leading-none ${
                      index === 0 ? 'bg-[#0025E9] text-white' : 'text-black/70'
                    }`}
                  >
                    {t(`site.hero.schedule.${period}`)}
                  </span>
                ))}
              </div>
              <p
                className={`${HEADING_FONT} mt-[14px] text-[15px] font-semibold text-black`}
              >
                {t('site.hero.schedule.date')}
              </p>
              <ul className="mt-[12px] space-y-[10px]">
                {SCHEDULE_ROWS.map((row) => (
                  <li key={row.key}>
                    <span
                      className={`${BODY_FONT} text-[12px] leading-none text-[#5A5A5A]`}
                    >
                      {t(`site.hero.schedule.labels.${row.key}`)}
                    </span>
                    <span
                      className={`mt-[6px] block h-[10px] overflow-hidden rounded-full ${
                        row.tinted ? 'bg-[#0025E9]/10' : 'bg-[#D9D9D9]/30'
                      }`}
                    >
                      <span
                        className={`block h-full rounded-full ${
                          row.tinted ? 'bg-[#0025E9]/40' : 'bg-black/10'
                        }`}
                        style={{ width: `${row.share}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <MotionStyles />
    </section>
  );
}
