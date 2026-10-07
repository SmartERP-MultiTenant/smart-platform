import Link from 'next/link';
import { useTranslation } from 'next-i18next';

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
 */

const EYEBROW_CLS =
  'inline-flex items-center rounded-xl border-2 border-[#0025E9]/20 bg-[linear-gradient(150deg,#0025E9_0%,#0025E9_10%,#ABBBF2_35%,#ABBBF2_0%,#ABBBF2_0%,#0025E9_100%)] bg-clip-text px-3 py-2 text-[15px] font-semibold leading-none text-transparent shadow-[0_0_20px_rgba(0,0,0,0.15),inset_0_0_20px_rgba(255,255,255,0.5)]';

const H2_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(1.75rem,_1.4992rem_+_1.1465vw,_2.875rem)] font-semibold leading-[1.2] text-black";

const H5_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(1.5rem,_1.228rem_+_1.1162vw,_2.2325rem)] font-semibold leading-[1.2] text-black";

const BODY_CLS =
  "font-['Golos_Text',Almarai,sans-serif] text-base leading-6 text-[#5A5A5A]";

const NUMBER_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(3.75rem,_2.9032rem_+_3.871vw,_7.5rem)] font-semibold leading-none";

const PRIMARY_BTN_CLS =
  "inline-flex items-center justify-center rounded-[15px] border-0 bg-[#0025E9] bg-[linear-gradient(150deg,#0025E9_0%,#0025E9_10%,#ABBBF2_35%,#ABBBF2_0%,#ABBBF2_0%,#0025E9_100%)] bg-[length:450%_100%] px-[30px] py-[20px] font-['DM_Sans',Almarai,sans-serif] text-[clamp(1rem,_0.9583rem_+_0.1389vw,_1.125rem)] font-medium capitalize leading-none text-white shadow-[inset_0_0_0_2px_rgba(0,0,0,0.1),0_0_50px_-5px_rgba(0,0,0,0.45)] transition-all duration-[350ms] ease-in-out hover:bg-[position:right_center]";

const OUTLINE_BTN_CLS =
  "inline-flex items-center justify-center rounded-[15px] bg-[#0025E9] bg-[linear-gradient(150deg,#fff_0%,#fff_10%,#0025E9_35%,#ABBBF2_100%)] bg-[length:450%_100%] px-[30px] py-[20px] font-['DM_Sans',Almarai,sans-serif] text-[clamp(1rem,_0.9583rem_+_0.1389vw,_1.125rem)] font-medium capitalize leading-none text-[#0025E9] shadow-[inset_0_0_0_2px_#0025E9,0_0_50px_-5px_rgba(0,0,0,0.25)] transition-all duration-[350ms] ease-in-out";

const STATS = [
  { key: 'companies', value: '4', suffix: 'k' },
  { key: 'close', value: '193', suffix: '%' },
  { key: 'modules', value: '15', suffix: '+' },
] as const;

export default function WorkCounters() {
  const { t } = useTranslation('site');

  return (
    <section id="results" className="px-5">
      <div className="mx-auto w-full max-w-[1700px] pb-[60px] md:pb-[100px] xl:pb-[150px]">
        <div className="pb-[70px] text-center">
          <span className={EYEBROW_CLS}>{t('site.counters.eyebrow')}</span>
          <h2 className={`${H2_CLS} mt-[15px]`}>{t('site.counters.title')}</h2>
        </div>

        <ul className="grid gap-[30px] md:grid-cols-3">
          {STATS.map((stat) => (
            <li
              key={stat.key}
              className="flex flex-col items-center rounded-3xl border border-[#D9D9D9] bg-[#F3F6FE] p-[30px] text-center md:p-[47.77px]"
            >
              <p className={`${NUMBER_CLS} text-black`}>
                {stat.value}
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
          <Link href="/pricing" className={OUTLINE_BTN_CLS}>
            {t('site.counters.ctaSecondary')}
          </Link>
          <Link href="/register" className={PRIMARY_BTN_CLS}>
            {t('site.counters.ctaPrimary')}
          </Link>
        </div>
      </div>
    </section>
  );
}
