import { type ReactElement, useRef } from 'react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import { HOVER_TRANSITION, Reveal } from '@/components/site/motion';

/**
 * S09 / S10 / S11 — the "SaaS Tools" band (reference section 5fc5290: 1398x719 at
 * (21, 2157) on the 1440x8970 capture; nested S10 is the intro row, S11 the card
 * slider). Values below come from `spec-desktop.json.sec_5fc5290`,
 * `spec-mobile.json.sec_5fc5290`, `css/post-53.css` and the band screenshot.
 *
 *   band surface   linear-gradient(rgba(0,37,233,.14) 0%, #ABBBF2 100%),
 *                  radius 24px, 1px solid rgba(171,187,242,.46), inset 20px from
 *                  the page edges. One of only three coloured surfaces on the
 *                  page — it floats on white and must never be full-bleed.
 *   white glows    five soft rgba(255,255,255,.8) radial gradients (812x520,
 *                  455x244, 428x220 ...). Without them the gradient reads flat.
 *   intro row      2 columns 455/883, no gap, 100px top padding; eyebrow + H2 on
 *                  the left with the CTA (260x55, radius 15px) 60px under it, the
 *                  icon marquee on the right, both columns centred on each other.
 *   icon marquee   two rows of 140x140 tiles (120x120 at <=767), radius 24px,
 *                  rgba(255,255,255,.6) fill, 30px padding, 30px gaps, scrolling
 *                  in opposite directions (row tops at y=2272 and y=2442).
 *   card slider    426x271 cards, radius 24px, rgba(0,37,233,.02) fill, 1px
 *                  rgba(217,217,217,.5) hairline, 36.94px padding, 30px gap
 *                  (20px and full-width at <=767); H4 clamp title at 28.17px.
 *   overhang       the card row runs 2697->2968 while the band ends at 2876, so
 *                  the cards hang 92px below the band onto white, and the pair of
 *                  45x45 blue arrows (y=2998, 10px apart) sits entirely on white.
 *                  That is why the band clips nothing and its trailing row is
 *                  pulled 167px below the surface.
 *
 * Deviations: the reference fills the tiles and cards with third-party brand
 * logos — these are the platform's own module marks drawn inline. Heading, CTA
 * and card copy are our own English marketing copy.
 *
 * Entrance (reference entrance probe §3.4): the band reveals as one unit — the whole
 * `5fc5290` section on `slideInUp`, 750ms `ease`, from 20% of its own 721.5px box
 * (144.3px at 1440), fired once when its top crosses the fold. Nothing inside is
 * revealed separately (the H2 carries no entrance class, the icon marquee simply rides
 * the slide), so the section itself is the reveal target.
 *
 * Hover (reference hover probe §5): every control in the band reacts.
 *   card      `:hover` scales the mark image to `scale(1.07)` on `all 0.2s ease-in-out`
 *             and takes the card title to its primary colour on `all 0.3s linear`.
 *   arrow     the 45x45 blue controls swing to `#000` on `all 0.3s linear` (they stay
 *             click-driven: the reference's own arrows advance the carousel on click).
 *   CTA       the shared `.wdt-button` hover — gradient to `background-position:
 *             100% center`, `all 0.35s ease-in-out`.
 *   tile      each 140px marquee tile lifts `translate(0, -5px)` to a solid white on
 *             `0 0 17px -10px rgba(0,0,0,.81)`, and the row it belongs to pauses
 *             (`animation-play-state: paused` on the wrapper's `:hover`).
 */

const EYEBROW_CLS =
  'inline-flex items-center rounded-xl border-2 border-[#0025E9]/20 bg-[linear-gradient(150deg,#0025E9_0%,#0025E9_10%,#ABBBF2_35%,#ABBBF2_0%,#ABBBF2_0%,#0025E9_100%)] bg-clip-text px-3 py-2 text-[15px] font-semibold leading-none text-transparent shadow-[0_0_20px_rgba(0,0,0,0.15),inset_0_0_20px_rgba(255,255,255,0.5)]';

const H2_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(1.75rem,_1.4992rem_+_1.1465vw,_2.875rem)] font-semibold leading-[1.2] text-black";

const H4_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(1.5rem,_1.4164rem_+_0.3822vw,_1.875rem)] font-semibold leading-[1.2] text-black";

const BODY_CLS =
  "font-['Golos_Text',Almarai,sans-serif] text-base leading-6 text-[#5A5A5A]";

const PRIMARY_BTN_CLS = `inline-flex items-center justify-center rounded-[15px] border-0 bg-[#0025E9] bg-[linear-gradient(150deg,#0025E9_0%,#0025E9_10%,#ABBBF2_35%,#ABBBF2_0%,#ABBBF2_0%,#0025E9_100%)] bg-[length:450%_100%] px-[30px] py-[20px] font-['DM_Sans',Almarai,sans-serif] text-[clamp(1rem,_0.9583rem_+_0.1389vw,_1.125rem)] font-medium capitalize leading-none text-white shadow-[inset_0_0_0_2px_rgba(0,0,0,0.1),0_0_50px_-5px_rgba(0,0,0,0.45)] ${HOVER_TRANSITION.button} hover:bg-[position:right_center]`;

/** `me-` rather than a track gap: every tile carries its own 30px trailing
 *  margin, so duplicating the row and translating -50% lands seamlessly.
 *  The hover is the reference's (`.wdt-home1-img-animation1 ... :hover`): solid white,
 *  a soft drop shadow and a 5px lift. All three are paint/transform properties, so the
 *  row's tile pitch — and the -50% seam — is untouched. */
const TILE_CLS = `me-[30px] grid h-[120px] w-[120px] shrink-0 place-items-center rounded-3xl bg-[rgba(255,255,255,0.6)] p-[26px] md:h-[140px] md:w-[140px] md:p-[30px] ${HOVER_TRANSITION.base} hover:-translate-y-[5px] hover:bg-white hover:shadow-[0_0_17px_-10px_rgba(0,0,0,0.81)]`;

/**
 * `group` carries the card's two hover reactions: the mark image scales and the title
 * takes the primary colour, both as selectors hanging off `.wdt-content-item:hover` in
 * the reference. Neither state touches a box.
 */
const CARD_CLS = `group w-full shrink-0 snap-start rounded-3xl border border-[rgba(217,217,217,0.5)] bg-[rgba(0,37,233,0.02)] p-[20px] md:w-[426px] md:p-[36.9426px]`;

/** The reference card mark: `transition: all 0.2s ease-in-out`, `transform: scale(1.07)`. */
const CARD_MARK_CLS = `h-16 w-16 ${HOVER_TRANSITION.image} group-hover:scale-[1.07]`;

/** The reference card title: `all 0.3s linear` to `var(--e-global-color-primary)`. */
const CARD_TITLE_CLS = `${H4_CLS} mt-[30px] ${HOVER_TRANSITION.base} group-hover:text-[#0025E9]`;

/**
 * The pair of 45x45 carousel controls. Hover recolours them (`#0025E9` -> `#000` on
 * `all 0.3s linear`, probe §5.2); the click handler below is unchanged, because the
 * reference's arrows also advance their carousel on click — this is a click control
 * with a hover skin, not a click control replacing a hover one.
 */
const ARROW_BTN_CLS = `grid h-[45px] w-[45px] shrink-0 place-items-center rounded-xl bg-[#0025E9] text-white ${HOVER_TRANSITION.base} hover:bg-black`;

/**
 * The five measured white glows. Their geometry is the reference's own declared CSS
 * (`post-53.css`, section `5fc5290`), kept verbatim and resolved against the band's
 * 30px-padded content box — the same containing block the reference uses, because the
 * tools container is the one band Elementor never caps (reference width probe §c:
 * container `51/1818` at 1920, `51/2458` at 2560, i.e. fluid at every width):
 *   1 `ea9b935` 812x520 @ left 20px     4 `44afef0` 120px tall, 20% wide @ left 0
 *   2 `9a4f961` 812x520 @ right -100px  5 `30053c5` 220px tall, 32% wide @ right 0
 *   3 `f98306e` 455x244 @ left -9px, measured against the intro row's 455/883 grid
 *              (its column starts at 34% of the container), so left -9px = `calc(34% - 9px)`.
 * The two 812px and the 455px glows are fixed px in the reference: at 1920 a percentage
 * would grow them to 1090px and push 1 and 2 into each other's half of the band.
 * Written as complete class strings so Tailwind can see them.
 */
const GLOWS = [
  'absolute start-[4%] top-[10px] h-[240px] w-[70%] bg-[radial-gradient(rgba(255,255,255,0.8)_1%,rgba(242,41,91,0)_75%)] md:start-[20px] md:h-[520px] md:w-[812px]',
  'absolute start-[47%] top-[292px] h-[240px] w-[70%] bg-[radial-gradient(rgba(255,255,255,0.8)_1%,rgba(242,41,91,0)_75%)] md:start-auto md:end-[-100px] md:h-[520px] md:w-[812px]',
  'absolute start-[34%] top-[100px] h-[180px] w-[46%] bg-[radial-gradient(rgba(255,255,255,0.8)_-36%,rgba(242,41,91,0)_68%)] md:start-[calc(34%_-_9px)] md:h-[244px] md:w-[455px]',
  'absolute start-[2%] top-[540px] h-[120px] w-[30%] bg-[radial-gradient(rgba(255,255,255,0.8)_1%,rgba(242,41,91,0)_75%)] md:start-0 md:w-[20%]',
  'absolute start-[67%] top-[510px] h-[220px] w-[40%] bg-[radial-gradient(rgba(255,255,255,0.8)_1%,rgba(242,41,91,0)_33%)] md:start-auto md:end-0 md:w-[32%]',
];

/**
 * Two rows of module marks for the marquee. These are our own abstract marks, not
 * third-party logos: the reference band shows brand logos it has no licence to
 * ship here.
 */
const MARQUEE_ROW_ONE = [
  <svg key="a" viewBox="0 0 80 80" className="h-full w-full">
    <circle cx="40" cy="40" r="30" fill="#F2545B" />
    <path d="M40 22 54 38 40 58 26 38z" fill="#fff" />
  </svg>,
  <svg key="b" viewBox="0 0 80 80" className="h-full w-full">
    <rect x="8" y="28" width="20" height="24" rx="6" fill="#0A62FF" />
    <rect x="34" y="14" width="20" height="20" rx="6" fill="#2E9BFF" />
    <rect x="34" y="46" width="20" height="20" rx="6" fill="#0A62FF" />
    <rect x="60" y="30" width="14" height="14" rx="4" fill="#2E9BFF" />
  </svg>,
  <svg key="c" viewBox="0 0 80 80" className="h-full w-full">
    <circle cx="30" cy="46" r="20" fill="#FFC12B" />
    <path
      d="M28 30a22 22 0 1 1 26 26"
      stroke="#16233A"
      strokeWidth="9"
      fill="none"
      strokeLinecap="round"
    />
  </svg>,
  <svg key="d" viewBox="0 0 80 80" className="h-full w-full">
    <path d="M40 8 70 24v32L40 72 10 56V24z" fill="#5878F0" />
    <path d="M40 30 56 38v14L40 60 24 52V38z" fill="#EDF1FF" />
  </svg>,
  <svg key="e" viewBox="0 0 80 80" className="h-full w-full">
    <circle cx="40" cy="40" r="30" fill="#8B5CF6" />
    <path
      d="M24 40c8-16 16-16 24 0S58 56 62 40"
      stroke="#fff"
      strokeWidth="7"
      fill="none"
      strokeLinecap="round"
    />
  </svg>,
  <svg key="f" viewBox="0 0 80 80" className="h-full w-full">
    <path d="M12 24h34l22 16-22 16H12z" fill="#1E63E9" />
    <circle cx="20" cy="40" r="5" fill="#fff" />
    <circle cx="34" cy="40" r="5" fill="#fff" />
  </svg>,
];

const MARQUEE_ROW_TWO = [
  <svg key="g" viewBox="0 0 80 80" className="h-full w-full">
    <path d="M40 6 68 22v36L40 74 12 58V22z" fill="#D62828" />
    <path d="M40 24 56 33v16L40 58 24 49V33z" fill="#fff" />
  </svg>,
  <svg key="h" viewBox="0 0 80 80" className="h-full w-full">
    <circle cx="40" cy="40" r="30" fill="#1B7BEF" />
    <path d="M40 16a24 24 0 0 1 0 48z" fill="#63D2F5" />
    <circle cx="40" cy="40" r="10" fill="#fff" />
  </svg>,
  <svg key="i" viewBox="0 0 80 80" className="h-full w-full">
    <path
      d="M18 56c0-16 12-28 28-28 10 0 16 6 16 14s-6 14-16 14H28"
      fill="#7C4DFF"
    />
    <path
      d="M30 66h20"
      stroke="#7C4DFF"
      strokeWidth="9"
      strokeLinecap="round"
    />
  </svg>,
  <svg key="j" viewBox="0 0 80 80" className="h-full w-full">
    <circle cx="40" cy="40" r="30" fill="#7C3AED" />
    <path
      d="M52 28c-14-6-26 2-26 12s12 18 26 12"
      stroke="#3ED6C6"
      strokeWidth="8"
      fill="none"
      strokeLinecap="round"
    />
  </svg>,
  <svg key="k" viewBox="0 0 80 80" className="h-full w-full">
    <rect x="10" y="10" width="60" height="60" rx="18" fill="#F2545B" />
    <circle cx="40" cy="40" r="16" fill="none" stroke="#fff" strokeWidth="7" />
    <path
      d="M40 24v16l12 10"
      stroke="#fff"
      strokeWidth="7"
      strokeLinecap="round"
      fill="none"
    />
  </svg>,
  <svg key="l" viewBox="0 0 80 80" className="h-full w-full">
    <path d="M14 30h22v20H14z" fill="#2E9BFF" />
    <path d="M36 22h30v36H36z" fill="#0A62FF" />
    <circle cx="51" cy="40" r="8" fill="#fff" />
  </svg>,
];

/** Inline marks for the three + one card of the S11 slider. */
const CARD_MARKS: Record<string, ReactElement> = {
  ledger: (
    <svg viewBox="0 0 64 64" className={CARD_MARK_CLS} aria-hidden="true">
      <rect x="4" y="10" width="40" height="30" rx="9" fill="#ABBBF2" />
      <rect x="14" y="22" width="42" height="28" rx="9" fill="#405FFF" />
      <rect x="22" y="31" width="26" height="3" rx="1.5" fill="#fff" />
      <rect
        x="22"
        y="39"
        width="16"
        height="3"
        rx="1.5"
        fill="#fff"
        opacity="0.75"
      />
    </svg>
  ),
  inventory: (
    <svg viewBox="0 0 64 64" className={CARD_MARK_CLS} aria-hidden="true">
      <rect x="6" y="6" width="52" height="52" rx="16" fill="#F2545B" />
      <path d="M22 26 32 20l10 6v12l-10 6-10-6z" fill="#fff" />
      <path
        d="M32 32v12"
        stroke="#F2545B"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  ),
  workforce: (
    <svg viewBox="0 0 64 64" className={CARD_MARK_CLS} aria-hidden="true">
      <circle cx="24" cy="40" r="9" fill="#C026D3" />
      <circle cx="38" cy="24" r="7" fill="#7C3AED" />
      <circle cx="48" cy="40" r="5" fill="#F2545B" />
      <circle cx="18" cy="20" r="4" fill="#C026D3" />
      <circle cx="34" cy="48" r="3.5" fill="#7C3AED" />
    </svg>
  ),
  reporting: (
    <svg viewBox="0 0 64 64" className={CARD_MARK_CLS} aria-hidden="true">
      <rect x="6" y="6" width="52" height="52" rx="16" fill="#EF4A23" />
      <circle
        cx="32"
        cy="32"
        r="14"
        fill="none"
        stroke="#fff"
        strokeWidth="6"
      />
      <path d="M32 18v14" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
    </svg>
  ),
};

const CARDS = ['ledger', 'inventory', 'workforce', 'reporting'] as const;

export default function ToolsShowcase() {
  const { t } = useTranslation('site');
  const trackRef = useRef<HTMLDivElement>(null);

  /** One card plus the track's own gap, so a click advances exactly one card. */
  const step = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;

    const card = track.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const distance = ((card?.offsetWidth ?? 426) + gap) * direction;
    // In RTL the track starts at scrollLeft 0 on the right and counts down, so
    // "next" has to subtract to move toward the later cards.
    const isRtl = getComputedStyle(track).direction === 'rtl';

    track.scrollBy({ left: isRtl ? -distance : distance, behavior: 'smooth' });
  };

  const marqueeRow = (
    row: 'row1' | 'row2',
    marks: ReactElement[],
    duration: number
  ) => (
    <div data-s09-marquee="" className="-mx-[20px] overflow-hidden md:mx-0">
      <div
        data-s09-track=""
        className="flex w-max"
        style={{
          animation: `${row === 'row1' ? 's09-marquee-start' : 's09-marquee-end'} ${duration}s linear infinite`,
        }}
      >
        {/* Two copies so the -50% loop is seamless. */}
        {[...marks, ...marks].map((mark, index) => (
          <span key={`${row}-${index}`} className={TILE_CLS}>
            {mark}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <Reveal
      as="section"
      id="tools"
      aria-label={t('site.tools.label')}
      className="px-5"
    >
      {/* Band width model (reference width probe §c): section `5fc5290` is one of the two
          bands whose Elementor container is never capped — its coloured card is the shell
          itself (`x20/w1880` at 1920, `x20/w2520` at 2560), and the content inside it is
          inset 30px from that shell (`x51` at every width). So the wrapper loses its cap
          and only the surface keeps the 24px radius / border / gradient. */}
      <div className="relative w-full">
        {/* Band surface. It stops 167px short of the trailing group's bottom edge
            (221px at <=767) so the card row hangs over it instead of being
            clipped — the reference overhang is 92px of card on white. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[221px] overflow-hidden rounded-3xl border border-[rgba(171,187,242,0.46)] bg-[linear-gradient(rgba(0,37,233,0.14)_0%,#ABBBF2_100%)] md:bottom-[167px]">
          {/* The glows' containing block is the band's content box, as in the reference;
              the surface's own 1px border + this 30px inset reproduce the reference's
              container exactly (x51 / w1338 at 1440, x51 / w1818 at 1920). */}
          <div className="absolute inset-y-0 start-0 end-0 md:start-[30px] md:end-[30px]">
            {GLOWS.map((glow) => (
              <span key={glow} aria-hidden="true" className={glow} />
            ))}
          </div>
        </div>

        <div className="relative px-5 pt-[50px] md:px-[30px] md:pt-[115px]">
          {/* S10 — intro copy + icon marquee */}
          <div className="grid items-center gap-[65px] lg:grid-cols-[455fr_883fr] lg:gap-0">
            <div>
              <span className={EYEBROW_CLS}>{t('site.tools.eyebrow')}</span>
              <h2 className={`${H2_CLS} mt-[15px]`}>{t('site.tools.title')}</h2>
              <div className="mt-[30px] md:mt-[60px]">
                <Link href="/#features" className={PRIMARY_BTN_CLS}>
                  {t('site.tools.cta')}
                </Link>
              </div>
            </div>

            {/* `min-w-0` keeps the 455/883 split: the marquee row is `w-max`, so without it the
                column's min-content (12 tiles = 2040px at >=768) wins over the `fr` track and
                squeezes the copy column to 208px — measured at 1920 where the reference's
                left column is 0.34 x 1818 = 618px. The row below still clips the track. */}
            <div
              aria-hidden="true"
              className="flex min-w-0 flex-col gap-[30px]"
            >
              {marqueeRow('row1', MARQUEE_ROW_ONE, 34)}
              {marqueeRow('row2', MARQUEE_ROW_TWO, 42)}
            </div>
          </div>

          {/* S11 — card slider. Deliberately below the band's bottom edge. */}
          <div className="mt-[65px] md:mt-[115px]">
            <div
              ref={trackRef}
              className="flex snap-x gap-[20px] overflow-x-auto [scrollbar-width:none] md:gap-[30px] [&::-webkit-scrollbar]:hidden"
            >
              {CARDS.map((card) => (
                <article key={card} className={CARD_CLS}>
                  {CARD_MARKS[card]}
                  <h3 className={CARD_TITLE_CLS}>
                    {t(`site.tools.cards.${card}.title`)}
                  </h3>
                  <p className={`${BODY_CLS} mt-[15px]`}>
                    {t(`site.tools.cards.${card}.description`)}
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-[20px] flex justify-center gap-[10px] md:mt-[30px]">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={t('site.tools.previous')}
                className={ARROW_BTN_CLS}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 rtl:rotate-180"
                  aria-hidden="true"
                >
                  <path
                    d="M20 10.5h-9.5v-5L4 12l6.5 6.5v-5H20z"
                    fill="currentColor"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label={t('site.tools.next')}
                className={ARROW_BTN_CLS}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 rtl:rotate-180"
                  aria-hidden="true"
                >
                  <path
                    d="M4 10.5h9.5v-5L20 12l-6.5 6.5v-5H4z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes s09-marquee-start {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
        @keyframes s09-marquee-end {
          from {
            transform: translateX(-50%);
          }
          to {
            transform: translateX(0);
          }
        }
        /* The reference pauses a marquee while the pointer is anywhere inside its
           wrapper (.wdt-animation-wrapper:hover div[class*="-marqee"]), per row and
           instantly — no transition. The track's animation is an inline shorthand,
           which a class cannot override, so this declaration has to win as
           !important; under reduced motion the track's own animation: none !important
           below makes it moot. */
        [data-s09-marquee]:hover [data-s09-track] {
          animation-play-state: paused !important;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-s09-track] {
            animation: none !important;
          }
        }
      `}</style>
    </Reveal>
  );
}
