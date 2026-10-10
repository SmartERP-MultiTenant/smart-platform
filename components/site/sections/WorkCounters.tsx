import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import {
  HOVER_TRANSITION,
  MotionStyles,
  Reveal,
  useReveal,
} from '@/components/site/motion';

/**
 * S13 — "Our Work" counter band (reference section 100ae22).
 *
 * From `css/post-53.css`: section padding 0 0 150px (<=1540px: 0 0 100px),
 * heading widget centred with 70px bottom padding, counter columns separated by
 * 30px (element 2fab506 uses a -15px margin / 15px padding column gap),
 * counter item centred.
 *
 * Content container capped at 1700px, centred (Elementor kit `css/post-15.css`); the
 * band surface itself is uncapped, so the section's 20px gutter (`px-5`) is the whole
 * inset and grows with the viewport.
 *
 * Card surface measured at 447x458 with 47.77px padding, `#F3F6FE` fill and a
 * 1px `#D9D9D9` hairline — no shadow. The numerals render as a black digit run
 * with a blue suffix glyph ("4k", "193%", "15+"), which is how the reference
 * renders its counter suffix element.
 *
 * Entrance (reference entrance probe §3.6) — three separate one-shot reveals, all
 * `750ms ease` from 20% of their own box, no stagger: the heading widget `f379461`
 * (31.7px) and the counter widget `2fab506` (103.5px) on `slideInUp`, then the CTA
 * pair on opposite sides — `e6fce3c` `slideInLeft` (-38.4px of its 192px width) and
 * `7e072dd` `slideInRight` (+36.5px of its 182px), fired 2ms apart.
 *
 * Hover (reference hover probe §6) — the stat card is measured, not inert: hovering
 * anywhere on it raises `box-shadow: 0 0 60px -10px rgba(0,0,0,.21)`, takes the card
 * surface to white and swings the gradient-clipped numeral to its blue end, all on
 * the reference's `all 0.3s linear`. The buttons take the shared `.wdt-button`
 * treatment: gradient swing to `background-position: 100% center`, 0.35s ease-in-out.
 * The entrance's two x offsets are mirrored under RTL (that one *is* an inline edge);
 * the numeral's gradient window is not — see `NUMBER_FILL_CLS`.
 */

const EYEBROW_CLS =
  'inline-flex items-center rounded-xl border-2 border-[#0025E9]/20 bg-[linear-gradient(150deg,#0025E9_0%,#0025E9_30%,#1234E8_55%,#0025E9_100%)] bg-clip-text px-3 py-2 text-[15px] font-semibold leading-none text-transparent shadow-[0_0_20px_rgba(0,0,0,0.15),inset_0_0_20px_rgba(255,255,255,0.5)]';

const H2_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(1.75rem,_1.4992rem_+_1.1465vw,_2.875rem)] font-semibold leading-[1.2] text-black";

const H5_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(1.5rem,_1.228rem_+_1.1162vw,_2.2325rem)] font-semibold leading-[1.2] text-black";

const BODY_CLS =
  "font-['Golos_Text',Almarai,sans-serif] text-base leading-6 text-[#5A5A5A]";

const NUMBER_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(3.75rem,_2.9032rem_+_3.871vw,_7.5rem)] font-semibold leading-none";

/**
 * The digit run's own fill, exactly as the reference declares it
 * (`css/additional.css:176`): `linear-gradient(150deg, secondary, secondary, primary,
 * quaternary)` clipped to the text at `background-size: 350% 100%`, i.e.
 * `#000 #000 #0025E9 #ABBBF2`. The 350% window parked at the gradient's start is
 * dominated by the two `#000` stops, which is why the idle digits read black and the
 * blue suffix still reads blue; hover swings the window to the other end
 * (`background-position: 0% 0% -> 100% 50%`, probe §6), putting the
 * primary/quaternary colours under the same glyphs.
 *
 * This is the one position pair in the band that is deliberately **not** mirrored
 * under RTL: it selects a window along the gradient, not an inline edge, so mirroring
 * it would paint the Arabic digits blue at rest and black on hover. The reference's
 * own declaration is physical (`background-position: right center` on `:hover`) and
 * carries no RTL override either. It is a class pair rather than inline style so a
 * hover state cannot outrank it.
 */
const NUMBER_FILL_CLS = `bg-[linear-gradient(150deg,#000_0%,#000_33.333%,#0025E9_66.667%,#ABBBF2_100%)] bg-[length:350%_100%] bg-[position:left_center] bg-clip-text text-transparent group-hover:bg-[position:right_center] ${HOVER_TRANSITION.base}`;

/**
 * The stat card. `group` exists so the numeral can follow the card's own hover, as it
 * does in the reference (`:hover .wdt-content-counter span`). Nothing here changes a
 * box: the white surface and the shadow are the two properties the probe measured.
 */
const CARD_CLS = `group flex flex-col items-center rounded-3xl border border-[#D9D9D9] bg-[#F3F6FE] p-[30px] text-center md:p-[47.77px] ${HOVER_TRANSITION.base} hover:bg-white hover:shadow-[0_0_60px_-10px_rgba(0,0,0,0.21)]`;

const PRIMARY_BTN_CLS = `inline-flex items-center justify-center rounded-[15px] border-0 bg-[#0025E9] bg-[linear-gradient(150deg,#0025E9_0%,#0025E9_30%,#1234E8_55%,#0025E9_100%)] bg-[length:450%_100%] px-[30px] py-[20px] font-['DM_Sans',Almarai,sans-serif] text-[clamp(1rem,_0.9583rem_+_0.1389vw,_1.125rem)] font-medium capitalize leading-none text-white shadow-[inset_0_0_0_2px_rgba(0,0,0,0.1),0_0_50px_-5px_rgba(0,0,0,0.45)] ${HOVER_TRANSITION.button} hover:bg-[position:right_center]`;

/**
 * The band's dark/outline button. Its idle declaration was already the reference's, but
 * it had no hover of its own — the reference swings the gradient to
 * `background-position: 100% center` and takes the label to `--wdtAccentTxtColor`
 * (white) over the same 0.35s ease-in-out, which is what the probe measured on
 * `e6fce3c` (probe §6).
 */
const OUTLINE_BTN_CLS = `inline-flex items-center justify-center rounded-[15px] bg-[#0025E9] bg-[linear-gradient(150deg,#fff_0%,#fff_10%,#0025E9_35%,#ABBBF2_100%)] bg-[length:450%_100%] px-[30px] py-[20px] font-['DM_Sans',Almarai,sans-serif] text-[clamp(1rem,_0.9583rem_+_0.1389vw,_1.125rem)] font-medium capitalize leading-none text-[#0025E9] shadow-[inset_0_0_0_2px_#0025E9,0_0_50px_-5px_rgba(0,0,0,0.25)] ${HOVER_TRANSITION.button} hover:bg-[position:right_center] hover:text-white`;

const STATS = [
  { key: 'companies', value: '4', suffix: 'k' },
  { key: 'close', value: '193', suffix: '%' },
  { key: 'modules', value: '15', suffix: '+' },
] as const;

export default function WorkCounters() {
  const { t } = useTranslation('site');

  // `Reveal` has no `<a>` in its tag union (anchors need `Link`'s own props), so the
  // two CTAs take the hook. They slide out of opposite inline edges, as the reference
  // does, which `slideInStart` / `slideInEnd` mirror under `[dir='rtl']`.
  const statRow = useReveal<HTMLUListElement>({ effect: 'slideUp' });
  const outlineCta = useReveal<HTMLAnchorElement>({ effect: 'slideInStart' });
  const filledCta = useReveal<HTMLAnchorElement>({ effect: 'slideInEnd' });

  return (
    <section id="results" className="px-5">
      {/* The hook callers below cannot render the reveal CSS themselves. */}
      <MotionStyles />
      <div className="mx-auto w-full max-w-[1700px] pb-[60px] md:pb-[100px] xl:pb-[150px]">
        <Reveal as="div" className="pb-[70px] text-center">
          <span className={EYEBROW_CLS}>{t('site.counters.eyebrow')}</span>
          <h2 className={`${H2_CLS} mt-[15px]`}>{t('site.counters.title')}</h2>
        </Reveal>

        <ul {...statRow.motionProps} className="grid gap-[30px] md:grid-cols-3">
          {STATS.map((stat) => (
            <li key={stat.key} className={CARD_CLS}>
              <p className={NUMBER_CLS}>
                <span className={NUMBER_FILL_CLS}>{stat.value}</span>
                <span className="text-[#0025E9]">{stat.suffix}</span>
              </p>
              <h3 className={`${H5_CLS} mt-[10px]`}>
                {t(`site.counters.cards.${stat.key}.title`)}
              </h3>
              <p className={`${BODY_CLS} mt-[20px]`}>
                {t(`site.counters.cards.${stat.key}.description`)}
              </p>
              {/* Reference renders partner wordmarks here; these are our module
                  wordmarks so no third-party brand is implied. */}
              <span className="mt-auto inline-flex items-center gap-2 pt-[40px]">
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 place-items-center rounded-lg bg-[#0025E9] font-['DM_Sans',Almarai,sans-serif] text-[15px] font-semibold text-white"
                >
                  {t(`site.counters.cards.${stat.key}.tag`).slice(0, 1)}
                </span>
                <span className="font-['DM_Sans',Almarai,sans-serif] text-[17px] font-semibold tracking-tight text-black/80">
                  {t(`site.counters.cards.${stat.key}.tag`)}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-[60px] flex flex-col items-center justify-center gap-[10px] md:flex-row">
          <Link
            href="/pricing"
            className={OUTLINE_BTN_CLS}
            {...outlineCta.motionProps}
          >
            {t('site.counters.ctaSecondary')}
          </Link>
          <Link
            href="/register"
            className={PRIMARY_BTN_CLS}
            {...filledCta.motionProps}
          >
            {t('site.counters.ctaPrimary')}
          </Link>
        </div>
      </div>
    </section>
  );
}
