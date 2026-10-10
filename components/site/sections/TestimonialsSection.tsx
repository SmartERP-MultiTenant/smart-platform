import { useState } from 'react';
import { useTranslation } from 'next-i18next';

import { HOVER_TRANSITION, Marquee, Reveal } from '@/components/site/motion';

/**
 * S21 — "Our Solutions": three pill marquees plus the testimonial slider
 * (reference section 16120b0).
 *
 * From `css/post-53.css`: section padding 150px 0 (<=1540px: 100px 0), heading
 * widget centred with its content wrapper padded 0 30%, marquee wrapper with a
 * 40px bottom margin (49c8a5d).
 *
 * Measured pills: 70px tall on a 110px pitch (40px gaps), radius 12px,
 * `#F3F6FE` fill, 2px `rgba(171,187,242,0.45)` border,
 * `0 3px 20px -10px rgba(0,0,0,0.45)`, 26px DM Sans 600 at 60% black.
 * Rows scroll in alternating directions; the animation duration was not
 * captured, so it uses a slow, readable pace and stops for reduced motion.
 *
 * Width system (measured on the reference): the band shell is viewport - 40 (a
 * 20px gutter, no cap) so the `px-5` section is already exact; the inner
 * content container is the reference's Elementor `max-width:1700px`, i.e.
 * min(band content box, 1700px) centred. 1920 -> 1700 at x=110 (88.5% of the
 * viewport), 2560 -> 1700 at x=430, <=1440 unclamped.
 *
 * Each marquee row is rendered by the shared `Marquee` primitive: one animated unit is
 * the pill list repeated three times (unit = 3 x copy), the track is two of those units,
 * and the animation shifts by exactly one unit (50%). The old three-copy rows shifted by
 * a third of the track, which is only seamless in LTR, and only while the clip stayed
 * narrower than 2 x copy — the measured copies are 1526 / 1380 / 1656px, so at the 1700px
 * cap row 2 had just 1060px of cover. `repeat={3}` gives a unit of 4140px at the
 * narrowest measured copy, so the invariant is `unit >= clip` (unit >= 1700) with a wide
 * margin — including for the Arabic pill copy, whose width lane A could not measure
 * without a dev server, and at every clip width this band can present. Because the mirror
 * is keyed on `[dir='rtl']`, it holds in both locales. The three durations and the
 * alternating directions are unchanged.
 *
 * Motion, measured on the live reference (band `16120b0`):
 *   entrance    five separate `slideInUp` blocks, 750ms `ease`, no delay, each 20% of
 *               its own box - the heading widget (`6968c76`, 45.3px at 1440), the three
 *               marquee rows (`49c8a5d` 22px, `1e3bc87` 22px, `c074a12` 14px) and the
 *               slider (`a2c21ef`, 86.2px).
 *   pills       `color` `rgba(0,0,0,0.6)` -> `#0025E9` and `border-color`
 *               `rgba(171,187,242,0.45)` -> `rgba(0,37,233,0.65)`, `0.3s linear`.
 *   marquee     pauses while the pointer is inside a row - `.wdt-animation-wrapper:hover
 *               [class*="-marqee"] { animation-play-state: paused }`, per row (a
 *               sibling row keeps running). Owned by the shared `Marquee` primitive, so
 *               the track, the two-unit seam and the per-pill trailing gap are untouched.
 *   arrows      `color` and the glyph `fill` `#000` -> `rgba(0,37,233,0.8)`, `0.3s linear`.
 *   card        `.wdt-content-item:hover`: the avatar scales to `0.98` (`0.3s linear`)
 *               and the avatar's resting 2px ring runs `circleround`
 *               (`1.5s cubic-bezier(0.17,0.13,0.28,1)`, `forwards`) with its border
 *               recoloured to the end/bottom edges. Hovering the avatar, the name, the
 *               stars or the quote all produce this one state.
 * Every hover node takes its timing from the shared `HOVER_TRANSITION` strings, which is
 * also what makes them honour `prefers-reduced-motion`; the ring's keyframes and the
 * marquee pause live in the block at the end of this section.
 */

const EYEBROW_CLS =
  'inline-flex items-center rounded-xl border-2 border-[#0025E9]/20 bg-[linear-gradient(150deg,#0025E9_0%,#0025E9_30%,#1234E8_55%,#0025E9_100%)] bg-clip-text px-3 py-2 text-[15px] font-semibold leading-none text-transparent shadow-[0_0_20px_rgba(0,0,0,0.15),inset_0_0_20px_rgba(255,255,255,0.5)]';

const H2_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(1.75rem,_1.4992rem_+_1.1465vw,_2.875rem)] font-semibold leading-[1.2] text-black";

const BODY_CLS =
  "font-['Golos_Text',Almarai,sans-serif] text-base leading-6 text-[#5A5A5A]";

const PILL_CLS =
  "whitespace-nowrap rounded-xl border-2 border-[rgba(171,187,242,0.45)] bg-[#F3F6FE] px-[30px] py-[20px] font-['DM_Sans',Almarai,sans-serif] text-[26px] font-semibold leading-none text-[rgba(0,0,0,0.6)] shadow-[0_3px_20px_-10px_rgba(0,0,0,0.45)] " +
  `${HOVER_TRANSITION.base} hover:border-[rgba(0,37,233,0.65)] hover:text-[#0025E9]`;

const ARROW_CLS = `grid h-[45px] w-[45px] shrink-0 place-items-center rounded-full border border-black bg-transparent text-black ${HOVER_TRANSITION.base} hover:border-[rgba(0,37,233,0.8)] hover:text-[rgba(0,37,233,0.8)] md:absolute md:top-1/2 md:-translate-y-1/2`;

const TESTIMONIALS = ['t1', 't2', 't3'] as const;
const MARQUEE_ROWS = ['row1', 'row2', 'row3'] as const;

export default function TestimonialsSection() {
  const { t } = useTranslation('site');
  const [slide, setSlide] = useState(0);

  // `returnObjects` makes i18next return the locale array; guard the shape here so a
  // malformed locale entry degrades to an empty row instead of crashing the render.
  const pillsFor = (row: string): string[] => {
    const value = t(`site.testimonials.rows.${row}`, { returnObjects: true });
    return Array.isArray(value) ? value.map(String) : [];
  };

  const go = (step: number) =>
    setSlide(
      (current) => (current + step + TESTIMONIALS.length) % TESTIMONIALS.length
    );

  return (
    <section id="testimonials" className="overflow-hidden px-5">
      <div className="mx-auto w-full max-w-[1700px] py-[60px] md:py-[100px] xl:py-[150px]">
        <Reveal
          as="div"
          effect="slideUp"
          className="mx-auto max-w-[690px] pb-[70px] text-center"
        >
          <span className={EYEBROW_CLS}>{t('site.testimonials.eyebrow')}</span>
          <h2 className={`${H2_CLS} mt-[15px]`}>
            {t('site.testimonials.title')}
          </h2>
          <p className={`${BODY_CLS} mt-5`}>{t('site.testimonials.intro')}</p>
        </Reveal>

        {/* Pill marquees — one animated unit per direction, two units per track, so the
            50% loop is seamless at every clip width up to the 1700px cap and in either
            locale. Below md the rows break out of the page gutter so the pills run past both
            viewport edges, as the reference does on mobile. */}
        <div className="flex flex-col gap-[40px]">
          {MARQUEE_ROWS.map((row, rowIndex) => {
            const pills = pillsFor(row);
            return (
              <Reveal key={row} as="div" effect="slideUp">
                <Marquee
                  items={pills}
                  gap={40}
                  duration={44 + rowIndex * 6}
                  direction={rowIndex % 2 === 0 ? 'left' : 'right'}
                  repeat={3}
                  itemClassName={PILL_CLS}
                />
              </Reveal>
            );
          })}
        </div>

        {/* Testimonial slider */}
        <Reveal
          as="div"
          effect="slideUp"
          className="relative mx-auto mt-[100px] max-w-[1122px]"
          aria-roledescription="carousel"
          aria-label={t('site.testimonials.label')}
        >
          <div aria-live="polite" data-s21-card="">
            {/* The reference's avatar link: a 120px `rgba(171,187,242,0.5)` circle over
                which a 2px `circleround` ring sits. The ring is at rest in the idle state
                and re-draws once the card is hovered - see the block at the end of the
                section. `absolute inset-0` keeps both the ring and the scale out of the
                grid's flow, so neither can move the band's geometry. */}
            <div className="relative mx-auto grid h-[120px] w-[120px] place-items-center rounded-full bg-[rgba(171,187,242,0.5)] font-['DM_Sans',Almarai,sans-serif] text-[40px] font-semibold text-[#0025E9]">
              <span
                aria-hidden="true"
                data-s21-avatar=""
                className={HOVER_TRANSITION.base}
              >
                {t(`site.testimonials.${TESTIMONIALS[slide]}.initials`)}
              </span>
              <span
                aria-hidden="true"
                data-s21-ring=""
                className="pointer-events-none absolute inset-0 rounded-full border-2 border-[rgba(171,187,242,0.8)]"
              />
            </div>

            <p className="mt-[30px] text-center font-['Golos_Text',Almarai,sans-serif] text-base leading-6">
              <span className="font-['DM_Sans',Almarai,sans-serif] text-[18px] font-semibold text-black">
                {t(`site.testimonials.${TESTIMONIALS[slide]}.name`)},
              </span>{' '}
              <span className="tracking-[0.8px] text-[#5A5A5A]">
                {t(`site.testimonials.${TESTIMONIALS[slide]}.role`)}
              </span>
            </p>

            {/* The star gradient is declared once per document, outside the star
                row: all five stars below paint with `url(#s21-star)`, and
                declaring it inside the loop repeated that id five times — every
                reference then resolved to the first declaration. `absolute h-0
                w-0` keeps this definition out of the row's flex flow (a
                `gap-[6px]` row would space it) while leaving it painted, which
                `display:none` does not guarantee for paint servers. */}
            <svg aria-hidden="true" className="absolute h-0 w-0">
              <defs>
                <linearGradient id="s21-star" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FFEEA9" />
                  <stop offset="30%" stopColor="#FFE982" />
                  <stop offset="55%" stopColor="#FFD700" />
                  <stop offset="80%" stopColor="#FFC107" />
                  <stop offset="100%" stopColor="#FFB300" />
                </linearGradient>
              </defs>
            </svg>

            <div className="mt-[15px] flex items-center justify-center gap-[6px]">
              <span className="sr-only">
                {t('site.testimonials.ratingLabel')}
              </span>
              {[0, 1, 2, 3, 4].map((star) => (
                <svg
                  key={star}
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  aria-hidden="true"
                >
                  <path
                    fill="url(#s21-star)"
                    d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6l-5.9 3.1 1.2-6.6L2.5 9.5l6.6-.9z"
                  />
                </svg>
              ))}
            </div>

            <blockquote className="mx-auto mt-[25px] max-w-[780px] text-center font-['DM_Sans',Almarai,sans-serif] text-[20px] font-normal italic leading-[1.2] text-black md:text-[26.6666px] md:leading-[32px]">
              {t(`site.testimonials.${TESTIMONIALS[slide]}.quote`)}
            </blockquote>
          </div>

          <div className="mt-[30px] flex items-center justify-center gap-[10px] md:mt-0 md:block">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={t('site.testimonials.previous')}
              className={`${ARROW_CLS} md:start-0`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 rtl:rotate-180"
                aria-hidden="true"
              >
                <path
                  d="M14.5 5.5 8 12l6.5 6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={t('site.testimonials.next')}
              className={`${ARROW_CLS} md:end-0`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 rtl:rotate-180"
                aria-hidden="true"
              >
                <path
                  d="M9.5 5.5 16 12l-6.5 6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </Reveal>
      </div>

      <style jsx global>{`
        @keyframes s21-circleround {
          0% {
            opacity: 1;
            transform: rotate(-90deg);
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: rotate(360deg);
          }
        }

        /* The avatar's resting ring, and its one-shot re-draw while the card is
           hovered. background-color is the only property the reference transitions
           here; the ring's 0.5s is its own value, not the shared 0.3s one. */
        [data-s21-ring] {
          transition: background-color 500ms linear;
        }

        [data-s21-card]:hover [data-s21-avatar] {
          transform: scale(0.98);
        }

        [data-s21-card]:hover [data-s21-ring] {
          animation: s21-circleround 1.5s cubic-bezier(0.17, 0.13, 0.28, 1)
            forwards;
          background-color: transparent;
          border-color: transparent;
          border-inline-end-color: rgba(171, 187, 242, 1);
          border-bottom-color: rgba(171, 187, 242, 1);
        }

        @media (prefers-reduced-motion: reduce) {
          [data-s21-ring] {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
