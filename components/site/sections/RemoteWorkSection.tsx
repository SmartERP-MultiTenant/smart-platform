import Image from 'next/image';
import { useTranslation } from 'next-i18next';

/**
 * S17 — "Remote Work Enablement" bento grid (reference section f4e6158).
 *
 * Geometry read from `css/post-53.css` and the 1440px reference:
 *   left card 452x773        bg #ABBBF2, border 1px #D9D9D961, radius 24px,
 *                            padding 60px 50px 500px, 15px inline-end margin
 *   right row 1              two cards 422x454 and 467x454
 *   right row 2              card 672x289 and tile 215x289
 *   gaps                     30px between every card
 *   "Help Systems"           40f0977  bg #0025E9, padding 60px 60px 40px, radius 24px
 *   "Our Loyal Customers"    1a9ed8f  bg #ABB0F245, border 1px #D9D9D966, padding 60px 50px
 *   "Time Saving"            5c3b6da  bg #ABB0F2BA, border 1px #D9D9D969, padding 40px 50px 30px
 *   right tile               d0851c3  bg #ABBBF2, border 1px #D9D9D966
 *   glows                    01059df rgba(255,255,255,0.7) 0 -> 0 73%,
 *                            8821d2b rgba(255,255,255,0.61) 0 -> rgba(64,95,255,0) 72%,
 *                            9e88131 rgba(171,176,242,0.42), 84578fe rgba(171,176,242,0.47)
 *
 * Width system (measured on the reference at 390/768/1280/1440/1920/2560): the
 * band shell is viewport - 40 (a 20px gutter, no cap) so the `px-5` section is
 * already exact; the inner content container is the reference's Elementor
 * `max-width:1700px`, i.e. min(band content box, 1700px) centred. 1920 -> 1700
 * at x=110 (88.5% of the viewport), 2560 -> 1700 at x=430, <=1440 unclamped.
 */

const H2_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(1.75rem,_1.4992rem_+_1.1465vw,_2.875rem)] font-semibold leading-[1.2]";

const H4_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(1.5rem,_1.4164rem_+_0.3822vw,_1.875rem)] font-semibold leading-[1.2]";

const COUNTER_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(3.75rem,_2.9032rem_+_3.871vw,_7.5rem)] font-semibold leading-none";

const BODY_CLS = "font-['Golos_Text',Almarai,sans-serif] text-base leading-6";

const CARD_SHELL = 'relative overflow-hidden rounded-3xl border';

const AVATARS = ['NS', 'HK', 'AM', 'RA'] as const;

export default function RemoteWorkSection() {
  const { t } = useTranslation('site');

  return (
    <section id="remote-work" className="px-5">
      <div className="mx-auto w-full max-w-[1700px]">
        <div className="grid gap-[30px] lg:grid-cols-[467fr_933fr]">
          {/* ---------------------------------------------------------- left card */}
          <div
            className={`${CARD_SHELL} border-[#D9D9D9]/40 bg-[#ABB0F2] px-[30px] pt-[50px] lg:me-[15px] lg:px-[50px] lg:pt-[60px]`}
          >
            {/* 692be3a: a white-to-transparent wash across the card head. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[250px] bg-[linear-gradient(180deg,rgba(255,255,255,0.8)_0%,rgba(255,255,255,0)_100%)]"
            />
            <div className="relative">
              <h2 className={`${H2_CLS} max-w-[416px] pb-[50px] text-black`}>
                {t('site.remote.title')}
              </h2>
              <p className="inline-flex items-center gap-[10px] font-['Golos_Text',Almarai,sans-serif] text-[17px] font-medium leading-[1.2] text-black">
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6 shrink-0"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="s17-star" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#FFEEA9" />
                      <stop offset="30%" stopColor="#FFE982" />
                      <stop offset="55%" stopColor="#FFD700" />
                      <stop offset="80%" stopColor="#FFC107" />
                      <stop offset="100%" stopColor="#FFB300" />
                    </linearGradient>
                  </defs>
                  <path
                    fill="url(#s17-star)"
                    d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6l-5.9 3.1 1.2-6.6L2.5 9.5l6.6-.9z"
                  />
                </svg>
                {t('site.remote.rating')}
              </p>
            </div>

            {/* ccfda97: the mirrored "We're loved" watermark along the start edge. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[60px] start-[15px] select-none bg-[linear-gradient(90deg,#0025E9_0%,#fff_40%,#D9D9D9_60%,#0025E9_100%)] bg-clip-text font-['DM_Sans',Almarai,sans-serif] text-[40px] font-semibold text-transparent lg:bottom-[175px] lg:start-0 lg:[writing-mode:vertical-rl] lg:rotate-180"
            >
              {t('site.remote.watermark')}
            </span>

            {/* 0a2ef3c: phone mockup, clipped by the card the way the reference clips it. */}
            <div
              aria-hidden="true"
              className="absolute end-0 bottom-[-170px] w-[45%] max-w-[240px] rounded-t-[34px] border-[6px] border-b-0 border-black/85 bg-black/85 p-[3px]"
            >
              <div className="relative aspect-[9/19] overflow-hidden rounded-t-[28px] bg-white">
                <Image
                  src="/site/pos.webp"
                  alt=""
                  fill
                  sizes="240px"
                  className="object-cover object-top"
                />
              </div>
            </div>
          </div>

          {/* --------------------------------------------------------- right block */}
          <div className="flex flex-col gap-[30px]">
            {/* row 1 */}
            <div className="grid gap-[30px] md:grid-cols-[422fr_467fr]">
              {/* Help Systems — solid primary card */}
              <div
                className={`${CARD_SHELL} flex min-h-[400px] flex-col border-[#D9D9D9]/40 bg-[#0025E9] px-[30px] pt-[50px] pb-[30px] text-center md:min-h-[454px] md:px-[60px] md:pt-[60px] md:pb-[40px] md:text-start`}
              >
                <h3 className={`${H2_CLS} text-white`}>
                  {t('site.remote.help.title')}
                </h3>

                {/* Gauge riding a white arc (the reference "dummy image" slot). */}
                <svg
                  viewBox="0 0 240 130"
                  className="mx-auto mt-[30px] w-full max-w-[240px]"
                  aria-hidden="true"
                >
                  <path
                    d="M15 120 A105 105 0 0 1 225 120"
                    fill="none"
                    stroke="rgba(255,255,255,0.35)"
                    strokeWidth="10"
                    strokeLinecap="round"
                  />
                  <path
                    d="M15 120 A105 105 0 0 1 183 27"
                    fill="none"
                    stroke="rgba(255,255,255,0.9)"
                    strokeWidth="10"
                    strokeLinecap="round"
                  />
                  <g transform="translate(183 27) rotate(48)">
                    <rect
                      x="-9"
                      y="-26"
                      width="18"
                      height="40"
                      rx="9"
                      fill="#fff"
                    />
                    <path d="M-9 6 L-20 22 L-6 18 Z" fill="#ABBBF2" />
                    <path d="M9 6 L20 22 L6 18 Z" fill="#ABBBF2" />
                    <circle cx="0" cy="-10" r="4.5" fill="#0025E9" />
                  </g>
                </svg>

                <p
                  className={`${COUNTER_CLS} -mt-[70px] text-center text-white md:-mt-[100px]`}
                >
                  {t('site.remote.help.value')}
                </p>
                <p
                  className={`${BODY_CLS} mt-[15px] text-center text-[rgba(255,255,255,0.7)] md:px-[70px]`}
                >
                  {t('site.remote.help.description')}
                </p>
              </div>

              {/* Our Loyal Customers — tinted card */}
              <div
                className={`${CARD_SHELL} flex min-h-[400px] flex-col border-[#D9D9D9]/40 bg-[rgba(171,176,242,0.27)] px-[30px] pt-[50px] pb-[30px] text-center md:min-h-[454px] md:px-[50px] md:pt-[60px] md:text-start`}
              >
                <p className={`${COUNTER_CLS} text-black`}>
                  {t('site.remote.customers.value').replace(/\+$/, '')}
                  <span className="text-[#0025E9]">+</span>
                </p>
                <p className={`${BODY_CLS} mt-[15px] mb-[30px] text-black`}>
                  {t('site.remote.customers.description')}
                </p>
                <h3 className={`${H4_CLS} max-w-[416px] pb-[15px] text-black`}>
                  {t('site.remote.customers.title')}
                </h3>

                <div className="mt-auto flex flex-wrap items-center justify-center gap-[8px] md:justify-start">
                  <span className="sr-only">
                    {t('site.remote.customers.avatarsLabel')}
                  </span>
                  {AVATARS.map((initials) => (
                    <span
                      key={initials}
                      aria-hidden="true"
                      className="grid h-[60px] w-[60px] place-items-center rounded-full bg-[rgba(171,187,242,0.5)] font-['DM_Sans',Almarai,sans-serif] text-[15px] font-semibold text-[#0025E9] md:h-[76px] md:w-[76px] md:text-[18px]"
                    >
                      {initials}
                    </span>
                  ))}
                  <button
                    type="button"
                    aria-label={t('site.remote.customers.action')}
                    className="grid h-[60px] w-[60px] place-items-center rounded-full bg-[#0025E9] text-white transition-transform hover:scale-105 md:h-[76px] md:w-[76px]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-6 w-6"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 5v14M5 12h14"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* row 2 */}
            <div className="grid gap-[30px] md:grid-cols-[672fr_215fr]">
              {/* Up to / Hours Saved */}
              <div
                className={`${CARD_SHELL} flex min-h-[260px] flex-col justify-center gap-[20px] border-[#D9D9D9]/40 bg-[rgba(171,176,242,0.73)] px-[30px] pt-[40px] pb-[30px] text-center md:flex-row md:items-center md:gap-[30px] md:px-[50px] md:text-start`}
              >
                {/* 01059df: white wash behind the wave. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(at_center_center,rgba(255,255,255,0.7)_0%,rgba(255,255,255,0)_73%)]"
                />
                <svg
                  viewBox="0 0 192 200"
                  className="relative mx-auto w-[110px] shrink-0 md:mx-0 md:w-[150px]"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="s17-wave" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#ABBBF2" />
                      <stop offset="55%" stopColor="#405FFF" />
                      <stop offset="100%" stopColor="#0025E9" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M28 30 L92 96 M92 96 L28 162 M100 30 L164 96 M100 96 L164 162"
                    fill="none"
                    stroke="url(#s17-wave)"
                    strokeWidth="34"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>

                <div className="relative">
                  <p className={`${H4_CLS} text-[rgba(0,0,0,0.6)]`}>
                    {t('site.remote.saving.label')}
                  </p>
                  <h3 className={`${H2_CLS} mt-[10px] pb-[30px] text-black`}>
                    {t('site.remote.saving.title')}
                  </h3>
                  <p className={`${BODY_CLS} max-w-[370px] text-black md:mx-0`}>
                    {t('site.remote.saving.description')}
                  </p>
                </div>
              </div>

              {/* Decorative shard tile */}
              <div
                className={`${CARD_SHELL} grid min-h-[260px] place-items-center border-[#D9D9D9]/40 bg-[#ABBBF2]`}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-[4%] bottom-[8px] h-[80%] bg-[radial-gradient(at_center_center,rgba(255,255,255,0.61)_0%,rgba(64,95,255,0)_72%)]"
                />
                <svg
                  viewBox="0 0 117 183"
                  className="relative w-[80px]"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="s17-shard" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#8E5CE6" />
                      <stop offset="100%" stopColor="#0025E9" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M20 0 L97 40 L58 183 L30 120 Z"
                    fill="url(#s17-shard)"
                    opacity="0.95"
                  />
                  <path
                    d="M20 0 L58 183 L30 120 Z"
                    fill="rgba(255,255,255,0.35)"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
