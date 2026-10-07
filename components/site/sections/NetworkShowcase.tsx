import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from 'next-i18next';

/**
 * S14 — "SaaS Network" split band (reference section 780fae9, heading group 5927dfa).
 *
 * From `css/post-53.css`:
 *   section padding            0 0 150px (<=1540px: 0 0 100px)
 *   heading group 5927dfa      margin-bottom -250px (<=1024px: +40px, <=767px: +30px),
 *                              which is what lifts the blue panel level with the eyebrow
 *   text column 9d28d86        padding-right 50px
 *   heading widget c0e8620     start-aligned, content wrapper padded 15% on the right
 *   media panel                radial-gradient(at 0% 0%, #ABBBF2 20%, #0025E9 100%),
 *                              radius 24px, padding 100px 30px
 *   content container          max-width 1700px, centred (Elementor kit `css/post-15.css`).
 *                              The band surface is uncapped, so the section's 20px gutter
 *                              (`px-5`) is the whole inset and grows with the viewport.
 */

const EYEBROW_CLS =
  'inline-flex items-center rounded-xl border-2 border-[#0025E9]/20 bg-[linear-gradient(150deg,#0025E9_0%,#0025E9_10%,#ABBBF2_35%,#ABBBF2_0%,#ABBBF2_0%,#0025E9_100%)] bg-clip-text px-3 py-2 text-[15px] font-semibold leading-none text-transparent shadow-[0_0_20px_rgba(0,0,0,0.15),inset_0_0_20px_rgba(255,255,255,0.5)]';

const H2_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(1.75rem,_1.4992rem_+_1.1465vw,_2.875rem)] font-semibold leading-[1.2] text-black";

const H3_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[22px] font-semibold leading-[1.2] text-black md:text-[26px]";

const BODY_CLS =
  "font-['Golos_Text',Almarai,sans-serif] text-base leading-6 text-[#5A5A5A]";

/** Blue duotone marks, the shape language the reference uses for its feature icons. */
const ICONS = {
  operations: (
    <svg viewBox="0 0 44 44" className="h-10 w-10" aria-hidden="true">
      <rect x="4" y="22" width="8" height="18" rx="3" fill="#0025E9" />
      <rect x="18" y="12" width="8" height="28" rx="3" fill="#405FFF" />
      <rect x="32" y="4" width="8" height="36" rx="3" fill="#ABBBF2" />
    </svg>
  ),
  reporting: (
    <svg viewBox="0 0 44 44" className="h-10 w-10" aria-hidden="true">
      <rect x="3" y="7" width="30" height="30" rx="6" fill="#ABBBF2" />
      <rect x="11" y="15" width="30" height="22" rx="6" fill="#0025E9" />
      <rect x="17" y="21" width="18" height="3" rx="1.5" fill="#fff" />
      <rect
        x="17"
        y="28"
        width="11"
        height="3"
        rx="1.5"
        fill="#fff"
        opacity="0.7"
      />
    </svg>
  ),
  scale: (
    <svg viewBox="0 0 44 44" className="h-10 w-10" aria-hidden="true">
      <circle cx="12" cy="32" r="9" fill="#ABBBF2" />
      <circle cx="26" cy="20" r="9" fill="#405FFF" />
      <circle cx="37" cy="9" r="6" fill="#0025E9" />
    </svg>
  ),
} as const;

const FEATURES = ['operations', 'reporting', 'scale'] as const;
const SLIDES = ['dashboard', 'inventory', 'reports'] as const;

const SLIDE_MEDIA: Record<(typeof SLIDES)[number], string> = {
  dashboard: '/site/dashboard.webp',
  inventory: '/site/inventory.webp',
  reports: '/site/reports.webp',
};

export default function NetworkShowcase() {
  const { t } = useTranslation('site');
  const [slide, setSlide] = useState(0);

  return (
    <section id="features" className="px-5">
      <div className="mx-auto w-full max-w-[1700px] pb-[60px] md:pb-[100px] xl:pb-[150px]">
        <div className="grid items-start gap-[30px] lg:grid-cols-2">
          {/* Copy + stepper */}
          <div className="lg:pe-[50px]">
            <span className={EYEBROW_CLS}>{t('site.network.eyebrow')}</span>
            <h2 className={`${H2_CLS} mt-[15px] max-w-[560px]`}>
              {t('site.network.title')}
            </h2>
            <p className={`${BODY_CLS} mt-5 max-w-[560px]`}>
              {t('site.network.intro')}
            </p>

            <ul className="mt-[60px]">
              {FEATURES.map((item) => (
                <li
                  key={item}
                  className="relative ps-[38px] pb-[45px] last:pb-0"
                >
                  {/* Stepper rule with its end cap, as measured on both breakpoints. */}
                  <span
                    aria-hidden="true"
                    className="absolute start-0 top-0 h-full w-px bg-[#0025E9]"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute start-0 top-0 h-px w-[26px] bg-[#0025E9]"
                  />
                  <span className="mb-[15px] inline-flex">{ICONS[item]}</span>
                  <h3 className={H3_CLS}>
                    {t(`site.network.features.${item}.title`)}
                  </h3>
                  <p className={`${BODY_CLS} mt-[15px] max-w-[600px]`}>
                    {t(`site.network.features.${item}.description`)}
                  </p>
                  <Link
                    href="/pricing"
                    className="mt-[15px] inline-block border-b border-[#0025E9]/60 pb-[2px] font-['Golos_Text',Almarai,sans-serif] text-base font-medium leading-[1.8] text-[#0025E9] transition-colors hover:border-[#0025E9]"
                  >
                    {t('site.network.seeAllFeatures')}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Media panel */}
          <div className="relative rounded-3xl bg-[radial-gradient(at_0%_0%,#ABBBF2_20%,#0025E9_100%)] px-[30px] py-[50px] md:py-[100px]">
            <div className="relative mx-auto aspect-[520/680] w-full max-w-[520px] rounded-[36px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.65),rgba(255,255,255,0.35))] p-[10px] shadow-[0_0_60px_-15px_rgba(0,0,0,0.3)] backdrop-blur-[5px]">
              <div className="relative h-full w-full overflow-hidden rounded-[28px] bg-white">
                {SLIDES.map((key, index) => (
                  <Image
                    key={key}
                    src={SLIDE_MEDIA[key]}
                    alt={index === slide ? t(`site.network.slides.${key}`) : ''}
                    fill
                    sizes="(max-width: 1024px) 80vw, 480px"
                    className={`object-cover object-top transition-opacity duration-300 ${
                      index === slide ? 'opacity-100' : 'opacity-0'
                    }`}
                    aria-hidden={index !== slide}
                  />
                ))}
              </div>
            </div>

            {/* Vertical three-dot indicator */}
            <div className="absolute end-[10px] top-1/2 flex -translate-y-1/2 flex-col items-center gap-[10px] lg:end-[14px]">
              {SLIDES.map((key, index) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSlide(index)}
                  aria-label={t(`site.network.slides.${key}`)}
                  aria-current={index === slide}
                  className={`h-[9px] w-[9px] rounded-full border border-white/70 transition-colors ${
                    index === slide
                      ? 'bg-white'
                      : 'bg-white/30 hover:bg-white/60'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
