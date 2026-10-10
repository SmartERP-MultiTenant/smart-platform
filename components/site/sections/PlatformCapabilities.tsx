import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import {
  HOVER_TRANSITION,
  MotionStyles,
  useReveal,
} from '@/components/site/motion';

/**
 * S06 — the "SaaS Feature" band; also renders its two nested reference sections, the
 * S07 heading row and the S08 card panel (Elementor ids `f107a07`, `123adfa`, `98c1e95`).
 *
 * Reference facts (css/post-53.css + spec-desktop.json at 1440, spec-mobile.json at 390):
 * - the band is white page; its only surface is the S08 panel: `#F3F6FE`, radius 24px,
 *   1px `rgba(0,37,233,0.08)` hairline, `overflow: hidden` — measured 1400x347 at (20,1709).
 * - the panel is clipped on purpose. Swiper's `slides_to_show` is 3 from 1281-1540px, so at
 *   1440 the four 466x345 cards leave the fourth card exactly at x=1421, outside the panel.
 *   Reflowing four cards to fit would destroy the band, so the cards stay 466 wide at 1440.
 *   Slides per view by breakpoint: 1 (<768), 2 (768-1280), 3 (>=1281).
 * - card geometry: 466x345, padding 40 (30 at 390), transparent fill and transparent 1px
 *   border, radius 24. On screen only the media group, the title, the copy and the text
 *   link are visible — drawing a card box here changes the band's character.
 * - the media group is the numeral (85.16px clamp, gradient-clipped so only its
 *   1px `rgba(0,37,233,0.2)` outline reads on the tint), a hairline rule at the numeral's
 *   baseline spanning the card's content width, and a 102x102 icon tile flush to the
 *   content's right edge. The separator box measures 79px tall, which is the reason the
 *   numeral uses `leading-[0.93]`, and the tile deliberately overhangs the rule by 23px.
 * - measured vertical rhythm inside a card: rule 1829 -> title box 1871 (42px), title box
 *   33.8 -> copy box (14px), copy 48px, link box 24px ending flush with the content's
 *   bottom edge (24px of clear space above it) = 265px of content in a 345px card.
 * - the S07 heading row is two 700px columns: eyebrow + h2 on the left (x=20), the lead
 *   paragraph in the right column (x=791, 70px of padding) bottom-aligned with the h2 at
 *   >=1024px, stacked in reference order below it.
 * - the section carries no `margin-top`: the reference's 300px top margin reserves the
 *   300px the hero dashboard overhangs its own band by, and S04Hero already reserves that
 *   overhang inside its own wrapper (`OVERHANG_RESERVE`).
 * - the reference swiper ships with `arrows: ""` and `pagination: ""`, and neither breakpoint
 *   shows arrows or dots, so the track is a swipe/scroll region with no controls.
 *
 * Motion — entrance (reference entrance probe §3.3): this is the band whose animation was
 * missing. The reference animates its **two heading halves in opposite directions on the
 * theme's 380ms override** — `68b7729` (the h2 widget, which also holds the eyebrow in the
 * reference markup) `adFadeInLeft` from `translateX(-100px)` at
 * `cubic-bezier(0.7, 0, 0.3, 1)`, `3d83195` (the lead) `adFadeInRight` from
 * `translateX(+100px)`, neither with a delay — and then the whole cards row `123adfa`
 * (the tinted panel itself) `slideInUp` 750ms `ease` from 20% of its own 347px height.
 * That is exactly the pair the shared `fadeInStart` / `fadeInEnd` and `slideUp` effects
 * reproduce; the reference gives the four cards inside the row no per-card animation.
 *
 * Motion — hover (reference hover probe §4): the card itself is the trigger
 * (`.wdt-content-item:hover`), with the reference's own `0.375s cubic-bezier(0.7,0,0.3,1)`
 * — its only use of that curve on the page. On hover the card takes
 * `box-shadow: 0 0 20px -10px rgba(0,0,0,0.21)` and its `::before` plate turns white at
 * `scale(1.01)`; a 2px gradient bar sweeps the media group's rule from 0 to 98% with the
 * 10px triangle 1px outside the tile's inline-start edge (both instant — the reference's
 * `--wdt-Ad-Transition` resolves to `transition: all` with no duration, measured `0s`);
 * the icon tile's border goes `rgba(0,0,0,0.12)` → `rgba(0,37,233,0.3)` over 350ms linear;
 * and the "Read More" link fills black over 300ms linear while its underline wipes shut.
 * Keyboard parity: every card-level reaction also fires on `focus-within`, and the link's
 * own reactions on `focus-visible`, so nothing here is mouse-only.
 *
 * Not ported, deliberately: the reference's icon tile swings `background-position` to
 * `100% 50%` and its glyph turns white (measured) — but our tile already renders the
 * *hovered* treatment (a blue gradient fill behind a white mark), and the swing needs a
 * `background-size` the probe never measured on this element, while the glyph's fill would
 * have to become white on a white-detail SVG. Changing either would move the band's
 * approved idle look, which this pass must not do.
 */

const HEADING_FONT = "font-['DM_Sans',Almarai,sans-serif]";
const BODY_FONT = "font-['Golos_Text',Almarai,sans-serif]";

/** Same stop-list defect as `ToolsShowcase`: the two `0%` stops clamp up to 35% and leave
 *  a run of `#ABBBF2` glyphs (1.89:1 on this band's `#F3F6FE`/white). Repaired to a
 *  monotonic, legible sheen: `#0025E9` 8.60:1 on white, `#1234E8` 7.83:1. */
const EYEBROW_CLS =
  'inline-flex items-center rounded-xl border-2 border-[#0025E9]/20 bg-[linear-gradient(150deg,#0025E9_0%,#0025E9_30%,#1234E8_55%,#0025E9_100%)] bg-clip-text px-3 py-2 text-[15px] font-semibold leading-none text-transparent shadow-[0_0_20px_rgba(0,0,0,0.15),inset_0_0_20px_rgba(255,255,255,0.5)]';

const H2_CLS = `${HEADING_FONT} text-[clamp(1.75rem,_1.4992rem_+_1.1465vw,_2.875rem)] font-semibold leading-[1.2] text-black`;

/** H4 clamp — the reference card title measures 28.17px at 1440 and 24.15px at 390. */
const CARD_TITLE_CLS = `${HEADING_FONT} text-[clamp(1.5rem,_1.4164rem_+_0.3822vw,_1.875rem)] font-semibold leading-[1.2] text-black`;

const BODY_CLS = `${BODY_FONT} text-base leading-6 text-[#5A5A5A]`;

/**
 * Showcase numeral clamp (85.16px @1440); only the 1px stroke reads on the tint.
 * The 550% gradient's window is parked at the inline start and flips with the
 * writing direction (`rtl:` — the same variant the sibling bands use for
 * direction-dependent geometry), so the highlight starts where the numeral does
 * in both locales instead of always at the physical left.
 */
const NUMERAL_CLS = `${HEADING_FONT} bg-[position:left_center] rtl:bg-[position:right_center] text-[clamp(3.125rem,_2.4194rem_+_3.2258vw,_6.25rem)] font-semibold leading-[0.93]`;

const NUMERAL_STYLE: CSSProperties = {
  backgroundImage: 'linear-gradient(150deg,#F3F6FE,#F3F6FE,#0025E9,#ABBBF2)',
  backgroundSize: '550% 100%',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextStroke: '1px rgba(0,37,233,0.2)',
  color: 'transparent',
};

/**
 * The icon tile takes the reference's measured `all 0.35s linear` (probe §4) for its
 * border-colour hover: `rgba(0,0,0,0.12)` → `rgba(0,37,233,0.3)`. That is a 350ms
 * **linear** value, which `HOVER_TRANSITION` does not carry (its `button` key is 350ms
 * `ease-in-out`), so it is written out here with the same `motion-reduce` guard.
 */
const ICON_TILE_CLS =
  'absolute end-0 top-0 grid h-[95px] w-[95px] shrink-0 place-items-center rounded-2xl border border-black/[0.12] bg-white bg-[linear-gradient(150deg,#fff,#fff,#0025E9,#ABBBF2)] p-[5px] shadow-[0_0_30px_rgba(0,0,0,0.1)] transition-all duration-[350ms] ease-linear motion-reduce:transition-none group-hover:border-[#0025E9]/30 group-focus-within:border-[#0025E9]/30 md:h-[102px] md:w-[102px]';

/**
 * The card, with the reference's hover state on the card itself (probe §4): the trigger
 * is the whole card, the shadow is `0 0 20px -10px rgba(0,0,0,0.21)`, and the `::before`
 * plate behind the content goes white at `scale(1.01)` on the reference's
 * `0.375s cubic-bezier(0.7, 0, 0.3, 1)` — the curve `HOVER_TRANSITION.card` carries, on
 * the card and on the plate (a pseudo-element does not inherit `transition`). `isolate`
 * keeps the plate's `-z-10` inside the card's own stacking context, so it paints above the
 * tinted panel but behind the card's text without needing a wrapper element. Nothing here
 * is a layout property: the plate is `inset-0` and its 1% growth is a transform.
 */
const CARD_CLS = `group relative isolate flex h-full min-h-[338px] flex-col p-[30px] text-start before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-3xl before:bg-transparent before:content-[''] before:transition-all before:duration-[375ms] before:ease-[cubic-bezier(0.7,0,0.3,1)] before:motion-reduce:transition-none md:min-h-[345px] md:p-[40px] ${HOVER_TRANSITION.card} hover:shadow-[0_0_20px_-10px_rgba(0,0,0,0.21)] hover:before:bg-white hover:before:scale-[1.01] focus-within:shadow-[0_0_20px_-10px_rgba(0,0,0,0.21)] focus-within:before:bg-white focus-within:before:scale-[1.01]`;

/**
 * The reference's hover sweep along the media group's rule (probe §4): a 2px
 * `linear-gradient(150deg, #0025E9 0%, #0025E9 10%, #ABBBF2 35%, #ABBBF2 100%)` bar at the
 * author CSS's own `background-size: 450% 100%`, growing from 0 to 98% of the group
 * (`376.312px` of the reference's 384px wrapper). It sits on the measured hairline, whose
 * own 1px is left in place. Instant in the reference and instant here.
 */
const MEDIA_BAR_CLS =
  'pointer-events-none absolute bottom-[-1px] start-0 h-[2px] w-0 bg-[linear-gradient(150deg,#0025E9_0%,#0025E9_10%,#ABBBF2_35%,#ABBBF2_100%)] bg-[length:450%_100%] group-hover:w-[98%] group-focus-within:w-[98%]';

/**
 * The reference's 10px triangle (`clip-path: polygon(0% 0%, 100% 50%, 0% 100%)`,
 * `transform: translateY(50%)`) appears on hover 1px outside the inline-start edge of its
 * icon tile — 102px wide at `md`, 95px below it. `end-[…]` mirrors with the writing
 * direction the way the tile's own `end-0` does, and `rtl:-scale-x-100` points the apex at
 * the tile again in Arabic.
 */
const MEDIA_ARROW_CLS =
  'pointer-events-none absolute bottom-[-1px] end-[96px] h-[10px] w-[10px] translate-y-1/2 bg-[#0025E9] opacity-0 [clip-path:polygon(0%_0%,100%_50%,0%_100%)] group-hover:opacity-100 group-focus-within:opacity-100 rtl:-scale-x-100 md:end-[103px]';

/**
 * `self-start` keeps the hairline under the label instead of across the whole card.
 *
 * The link's two hover reactions are the reference's (probe §4): the anchor fills black at
 * `0.3s linear` while its underline wipes shut (`width: 100%` → `0`, anchored at the
 * inline start), with the text colour unchanged. The underline is an `::after` rather than
 * the 1px border it used to be so that the wipe keeps the border box exactly: the 1px
 * `border-transparent` still occupies the same slot, so this band's measured rhythm — the
 * link box flush with the content's bottom edge and 24px of clear space above it — does
 * not move. The black fill is behind the 18px text box (`pt-[24px]` and `pb-[5px]` are the
 * measured padding, so the fill covers the label, not the padding), and `-z-10` under
 * `isolate` keeps it behind the text.
 */
const CARD_LINK_CLS = `${HEADING_FONT} relative isolate mt-auto inline-flex self-start border-b border-transparent pt-[24px] pb-[5px] text-[18px] font-medium leading-none text-[#0025E9] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-[6px] before:-z-10 before:h-[18px] before:bg-black before:opacity-0 before:content-[''] before:transition-opacity before:duration-300 before:ease-linear before:motion-reduce:transition-none hover:before:opacity-100 focus-visible:before:opacity-100 after:pointer-events-none after:absolute after:bottom-[-1px] after:start-0 after:h-[1px] after:w-full after:bg-[#0025E9] after:content-[''] after:transition-[width] after:duration-300 after:ease-linear after:motion-reduce:transition-none hover:after:w-0 focus-visible:after:w-0`;

const SCROLL_TRACK_CLS =
  'overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0025E9]/40';

/**
 * The four capabilities, in the reference's own order and topics. Link targets are the
 * bands of this same page that detail each capability; the reference uses `href="#"`.
 */
const CARDS = [
  { index: 1, number: '01', glyph: 'accounts', href: '#services' },
  { index: 2, number: '02', glyph: 'inventory', href: '#tools' },
  { index: 3, number: '03', glyph: 'payroll', href: '#workflow' },
  { index: 4, number: '04', glyph: 'bilingual', href: '#features' },
] as const;

type Glyph = (typeof CARDS)[number]['glyph'];

/** Gradient-filled duotone glyphs; the reference uses full-colour marks, not line icons. */
function CardGlyph({ id }: { id: Glyph }) {
  const gradientId = `s06-glyph-${id}`;

  return (
    <svg viewBox="0 0 48 48" className="h-[52px] w-[52px]" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0025E9" />
          <stop offset="100%" stopColor="#7D93F5" />
        </linearGradient>
      </defs>
      {id === 'accounts' ? (
        <>
          <rect
            x="5"
            y="7"
            width="38"
            height="34"
            rx="7"
            fill={`url(#${gradientId})`}
          />
          <rect x="12" y="15" width="24" height="3.4" rx="1.7" fill="#fff" />
          <rect
            x="12"
            y="23"
            width="15"
            height="3.4"
            rx="1.7"
            fill="#fff"
            opacity="0.85"
          />
          <rect
            x="12"
            y="31"
            width="20"
            height="3.4"
            rx="1.7"
            fill="#fff"
            opacity="0.7"
          />
        </>
      ) : null}
      {id === 'inventory' ? (
        <>
          <path
            d="M5 15.5 24 6l19 9.5v17L24 42 5 32.5z"
            fill={`url(#${gradientId})`}
          />
          <path
            d="M5 15.5 24 25l19-9.5M24 25v17"
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {id === 'payroll' ? (
        <>
          <circle cx="17" cy="15.5" r="7.5" fill={`url(#${gradientId})`} />
          <path
            d="M4 40.5c0-7.6 5.8-13.7 13-13.7s13 6.1 13 13.7z"
            fill={`url(#${gradientId})`}
          />
          <circle
            cx="35"
            cy="17"
            r="5.5"
            fill={`url(#${gradientId})`}
            opacity="0.55"
          />
          <path
            d="M29.5 40.5c0-5 2.9-9.1 6.4-9.7 5.4.6 8.1 4.7 8.1 9.7z"
            fill={`url(#${gradientId})`}
            opacity="0.55"
          />
        </>
      ) : null}
      {id === 'bilingual' ? (
        <>
          <circle cx="24" cy="24" r="17" fill={`url(#${gradientId})`} />
          <path
            d="M7 24h34M24 7c5.6 6 5.6 28 0 34M24 7c-5.6 6-5.6 28 0 34"
            fill="none"
            stroke="#fff"
            strokeWidth="2.2"
          />
        </>
      ) : null}
    </svg>
  );
}

export default function PlatformCapabilities() {
  const { t } = useTranslation('site');

  // Entrance, one hook per reference element (probe §3.3). `useReveal` adds no element of
  // its own, so the band keeps its measured markup and its `overflow-hidden` clip; the
  // shared `<MotionStyles />` at the end of the section carries the effects. The
  // reference's `68b7729` is the heading *widget*, so the eyebrow travels with the h2 —
  // that is why this hook sits on the column's own wrapper rather than on the h2.
  const heading = useReveal<HTMLDivElement>({ effect: 'fadeInStart' });
  const lead = useReveal<HTMLParagraphElement>({ effect: 'fadeInEnd' });
  const cardsRow = useReveal<HTMLDivElement>({ effect: 'slideUp' });

  return (
    <section id="platform" className="px-5">
      {/* Band width model (reference width probe §c/d): this band's inner container IS the
          visible surface — the `#F3F6FE` card is `x20/w1400` at 1440 and `x110/w1700` at
          1920, i.e. it is capped with the container, never with the band. So the whole
          wrapper takes the reference's 1700px boxed cap, and the 1460px cap that
          `css/grid.css:468` applies for vw 1501-1540. */}
      <div className="mx-auto w-full max-w-[1700px] py-[50px] min-[1501px]:max-[1540px]:max-w-[1460px] md:py-[100px] xl:py-[150px]">
        {/* S07 — eyebrow + h2 left, lead paragraph right and bottom-aligned with the h2. */}
        <div className="grid gap-[15px] pb-[30px] md:pb-[55px] lg:grid-cols-2 lg:items-end lg:gap-[30px]">
          <div {...heading.motionProps}>
            <span className={EYEBROW_CLS}>{t('site.platform.eyebrow')}</span>
            <h2 className={`${H2_CLS} mt-[15px]`}>
              {t('site.platform.title')}
            </h2>
          </div>
          <p {...lead.motionProps} className={`${BODY_CLS} lg:ps-[70px]`}>
            {t('site.platform.lead')}
          </p>
        </div>

        {/* S08 — the tinted panel clips the row: the fourth card sits outside it by design. */}
        <div
          {...cardsRow.motionProps}
          className="overflow-hidden rounded-3xl border border-[#0025E9]/[0.08] bg-[#F3F6FE]"
        >
          <div
            role="region"
            aria-label={t('site.platform.sliderLabel')}
            tabIndex={0}
            className={SCROLL_TRACK_CLS}
          >
            <ul className="flex snap-x snap-mandatory">
              {CARDS.map((card) => (
                <li
                  key={card.number}
                  className="w-full shrink-0 snap-start md:w-1/2 xl:w-1/3"
                >
                  <article className={CARD_CLS}>
                    <div className="relative mb-[42px] border-b border-[#0025E9]/15">
                      <span
                        aria-hidden="true"
                        className={NUMERAL_CLS}
                        style={NUMERAL_STYLE}
                      >
                        {card.number}
                      </span>
                      <span className={ICON_TILE_CLS}>
                        <CardGlyph id={card.glyph} />
                      </span>
                      <span aria-hidden="true" className={MEDIA_BAR_CLS} />
                      <span aria-hidden="true" className={MEDIA_ARROW_CLS} />
                    </div>

                    <h3 className={CARD_TITLE_CLS}>
                      {t(`site.platform.cards.${card.index}.title`)}
                    </h3>
                    <p className={`${BODY_CLS} mt-[14px]`}>
                      {t(`site.platform.cards.${card.index}.desc`)}
                    </p>
                    <Link href={card.href} className={CARD_LINK_CLS}>
                      {t(`site.platform.cards.${card.index}.link`)}
                    </Link>
                  </article>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <MotionStyles />
    </section>
  );
}
