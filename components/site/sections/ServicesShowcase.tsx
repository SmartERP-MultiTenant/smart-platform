import { useState } from 'react';
import Image from 'next/image';
import { useTranslation } from 'next-i18next';

/**
 * S12 — "Our Services" interactive showcase (reference band 3329456 / element 824caca).
 *
 * Layout values taken from the reference stylesheet (`css/post-53.css`):
 *   section padding       290px 0 150px  (<=1540px: 254px 0 100px)
 *   heading widget        max-width 630px, centred, padding-bottom 70px
 *   media wrapper         radial-gradient(#ABBBF2 44%, #0025E9CF 100%), radius 24px,
 *                         padding 70px at 1440 (105px 135px >= 1541)
 *   list column           text-align: start, inner gutter 70px
 *   content container     max-width 1700px, centred (Elementor kit `css/post-15.css`,
 *                         `.elementor-section-boxed > .elementor-container`). The band
 *                         surface itself is uncapped, so the section's own 20px gutter
 *                         (`px-5`) is the whole inset and grows with the viewport.
 *   number glyph          DM Sans 600 clamp(3.125rem, 2.4194rem + 3.2258vw, 6.25rem),
 *                         -webkit-text-stroke 1px rgba(0,37,233,0.10), gradient-clipped
 *
 * Interaction, measured off the live reference with CDP input events:
 *   The widget binds a bubbling `mouseover` to each `<li>` and nothing else.
 *   Activation is synchronous (the class flips on the first frame, <=26ms), has no
 *   delay, no debounce, no timer and **no revert on pointer-leave** — the last row
 *   entered stays active indefinitely. A tap activates the row through Chrome's
 *   synthesized `mouseover`, so there is no separate touch path in the reference.
 *   `onMouseEnter` on the `<li>` is React's equivalent of that trigger (the reference's
 *   handler early-returns when the row is already active, which `setActive` does for us).
 *   `onClick` and `onFocus` on the row button are kept on top of it so a tap and a
 *   keyboard Tab stop still activate when hover is unavailable.
 *
 * Motion, from the reference's own CSS (`css/additional.css`) and confirmed by a
 * per-frame trace of the incoming row:
 *   numeral            background-position                 0.30s linear
 *   hairline rule      background-position                 0.60s cubic-bezier(0.7,0,0.3,1)
 *   caret              opacity                             0.375s cubic-bezier(0.7,0,0.3,1)
 *   description        opacity, transform, padding-top      0.30s linear
 *   media panel        opacity, transform, visibility       0.30s linear
 *   row label          nothing — `rgb(0,0,0)` in both states, no transition
 * `0.3s linear` is the reference's `--wdtBaseTransition`, the `cubic-bezier(.7,0,.3,1)`
 * is its `--wdtAd_Transition`. Every animated node carries `data-s12-motion`, which the
 * reduced-motion block at the end of the section neutralises.
 */

const EYEBROW_CLS =
  'inline-flex items-center rounded-xl border-2 border-[#0025E9]/20 bg-[linear-gradient(150deg,#0025E9_0%,#0025E9_10%,#ABBBF2_35%,#ABBBF2_0%,#ABBBF2_0%,#0025E9_100%)] bg-clip-text px-3 py-2 text-[15px] font-semibold leading-none text-transparent shadow-[0_0_20px_rgba(0,0,0,0.15),inset_0_0_20px_rgba(255,255,255,0.5)]';

const H2_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(1.75rem,_1.4992rem_+_1.1465vw,_2.875rem)] font-semibold leading-[1.2] text-black";

const BODY_CLS =
  "font-['Golos_Text',Almarai,sans-serif] text-base leading-6 text-[#5A5A5A]";

const NUMBER_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(3.125rem,_2.4194rem_+_3.2258vw,_6.25rem)] font-semibold leading-[68px]";

/**
 * The reference never recolours the label: `.wdt-content-title` computes to
 * `rgb(0,0,0)` at 34.5px/600 in both states and declares no transition, so the whole
 * active signal is the numeral gradient, the hairline sweep, the caret and the
 * description — the label is deliberately not part of the active/inactive delta.
 */
const LABEL_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(1.375rem,_1.1242rem_+_1.1465vw,_2.5rem)] font-semibold leading-[1.2] text-black";

/** The reference's `::before` hairline: a fixed 2px rule painted by a 201%-wide
 *  gradient that slides instead of changing colour. `270deg` puts the strong end
 *  (`rgba(0,37,233,.7)`) on the inline end, where the caret sits; the `rtl:` copy is
 *  the same rule mirrored through the `rtl:` variant the sibling bands use, so the
 *  sweep still arrives from the end in the Arabic locale. */
const RULE_CLS =
  'bg-[linear-gradient(270deg,rgba(0,37,233,0.7)_50%,rgba(0,37,233,0.1)_50%)] rtl:bg-[linear-gradient(90deg,rgba(0,37,233,0.7)_50%,rgba(0,37,233,0.1)_50%)] bg-[length:201%_2px] bg-no-repeat transition-[background-position] duration-[600ms] ease-[cubic-bezier(0.7,0,0.3,1)]';

/** `background-position: bottom left` → `bottom right` in the reference, mirrored for RTL. */
const RULE_IDLE_POS =
  'bg-[position:left_bottom] rtl:bg-[position:right_bottom]';
const RULE_ACTIVE_POS =
  'bg-[position:right_bottom] rtl:bg-[position:left_bottom]';

/** One showcase slide: a media panel + the five numbered entries that drive it. */
const SLIDES = [
  {
    key: 'ledger',
    number: '01',
    media: '/site/dashboard.webp',
    mediaAlt: '',
  },
  {
    key: 'inventory',
    number: '02',
    media: '/site/inventory.webp',
    mediaAlt: '',
  },
  {
    key: 'payroll',
    number: '03',
    media: '/site/reports.webp',
    mediaAlt: '',
  },
  {
    key: 'tenants',
    number: '04',
    media: '/site/pos.webp',
    mediaAlt: '',
  },
  {
    key: 'reporting',
    number: '05',
    media: '/site/dashboard.webp',
    mediaAlt: '',
  },
] as const;

export default function ServicesShowcase() {
  const { t } = useTranslation('site');
  const [active, setActive] = useState(0);

  return (
    <section id="services" className="px-5">
      <div className="mx-auto w-full max-w-[1700px] pt-[270px] pb-[50px] md:pt-[254px] md:pb-[100px]">
        <div className="mx-auto max-w-[630px] pb-[70px] text-center">
          <span className={EYEBROW_CLS}>{t('site.services.eyebrow')}</span>
          <h2 className={`${H2_CLS} mt-[15px]`}>{t('site.services.title')}</h2>
          <p className={`${BODY_CLS} mt-5`}>{t('site.services.intro')}</p>
        </div>

        <div className="grid items-center gap-[30px] lg:grid-cols-2">
          {/* Media panel. Inactive panels are `visibility: hidden` in the reference
              and rise 30px while fading in. */}
          <div className="rounded-3xl bg-[radial-gradient(at_center_center,#ABBBF2_44%,rgba(0,37,233,0.81)_100%)] p-[30px] md:p-[70px]">
            <div className="relative flex aspect-[530/569] items-center justify-center rounded-[48px] border border-white bg-[linear-gradient(90deg,rgba(255,255,255,0.5),rgba(255,255,255,0.3))] p-[25px] shadow-[0_0_60px_-15px_rgba(0,0,0,0.3)] backdrop-blur-[5px]">
              {SLIDES.map((slide, index) => (
                <Image
                  key={slide.key}
                  src={slide.media}
                  alt={
                    index === active
                      ? t(`site.services.slides.${slide.key}.title`)
                      : ''
                  }
                  fill
                  sizes="(max-width: 1024px) 90vw, 530px"
                  data-s12-motion=""
                  className={`rounded-[28px] object-cover object-top transition-[opacity,transform,visibility] duration-300 ease-linear ${
                    index === active
                      ? 'visible translate-y-0 opacity-100'
                      : 'invisible translate-y-[30px] opacity-0'
                  }`}
                  aria-hidden={index !== active}
                />
              ))}
            </div>
          </div>

          {/* Numbered list. The reference activates on `mouseover` on the `<li>` —
              which is the whole row, title and description alike — so the handler sits
              on the `<li>` and not on the button. There is no leave handler: the last
              row entered stays active, exactly like the reference. */}
          <ul className="lg:ps-[70px]">
            {SLIDES.map((slide, index) => {
              const isActive = index === active;
              return (
                <li key={slide.key} onMouseEnter={() => setActive(index)}>
                  <h3>
                    {/* A disclosure button, not a tab: it owns the description it
                        expands (`aria-expanded`), so no `role="tablist"`/`tab` is
                        claimed — a tablist would promise arrow-key/roving-tabindex
                        behaviour that neither this band nor the reference has. */}
                    <button
                      type="button"
                      onClick={() => setActive(index)}
                      onFocus={() => setActive(index)}
                      aria-expanded={isActive}
                      className="flex w-full items-center gap-[15px] text-start"
                    >
                      <span
                        aria-hidden="true"
                        data-s12-motion=""
                        style={{
                          backgroundImage:
                            'linear-gradient(150deg,#F3F6FE,#F3F6FE,#0025E9,#ABBBF2)',
                          backgroundSize: '550% 100%',
                          backgroundPosition: isActive
                            ? 'right center'
                            : 'left center',
                          WebkitBackgroundClip: 'text',
                          backgroundClip: 'text',
                          WebkitTextStroke: '1px rgba(0,37,233,0.10)',
                          color: 'transparent',
                        }}
                        className={`${NUMBER_CLS} w-[95px] shrink-0 transition-[background-position] duration-300 ease-linear`}
                      >
                        {slide.number}
                      </span>
                      <span className={LABEL_CLS}>
                        {t(`site.services.slides.${slide.key}.title`)}
                      </span>
                    </button>
                  </h3>

                  {/* Hairline rule; the active row carries the blue caret at its end.
                      Below lg the reference lets the rule run past the 20px page gutter
                      to the viewport edge, so it drops `w-full` and bleeds both ways.
                      The rule is always rendered: the reference fades the caret in
                      rather than mounting it. */}
                  <span
                    aria-hidden="true"
                    data-s12-motion=""
                    className={`relative block h-[2px] -mx-5 ${RULE_CLS} lg:mx-0 ${
                      isActive ? RULE_ACTIVE_POS : RULE_IDLE_POS
                    }`}
                  >
                    <svg
                      viewBox="0 0 10 10"
                      data-s12-motion=""
                      className={`absolute -top-[4px] end-0 h-[9px] w-[9px] text-[#0025E9] transition-opacity duration-[375ms] ease-[cubic-bezier(0.7,0,0.3,1)] ${
                        isActive ? 'opacity-100' : 'opacity-0'
                      }`}
                      fill="currentColor"
                    >
                      <path d="M1 0 L9 5 L1 10 Z" />
                    </svg>
                  </span>

                  <div
                    data-s12-motion=""
                    className={`grid transition-all duration-300 ease-linear ${
                      isActive ? 'grid-rows-[1fr] pb-8' : 'grid-rows-[0fr]'
                    }`}
                  >
                    <p
                      data-s12-motion=""
                      className={`${BODY_CLS} overflow-hidden transition-[opacity,transform,padding-top] duration-300 ease-linear ${
                        isActive
                          ? 'translate-y-0 pt-5 opacity-100'
                          : 'translate-y-[30px] pt-0 opacity-0'
                      }`}
                    >
                      {t(`site.services.slides.${slide.key}.description`)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* The reference's hover animation is motion-only; the sibling bands disable
          theirs the same way. `!important` is what lets this reach the Tailwind
          transition utilities on `[data-s12-motion]`. */}
      <style jsx global>{`
        @media (prefers-reduced-motion: reduce) {
          [data-s12-motion] {
            transition: none !important;
          }
        }
      `}</style>
    </section>
  );
}
