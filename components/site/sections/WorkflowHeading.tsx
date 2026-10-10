import { useTranslation } from 'next-i18next';

import { Reveal } from '@/components/site/motion';

/**
 * S16 — the thin centred heading band that separates the SaaS Network block from
 * the Remote Work bento grid (reference section with `padding: 0`).
 *
 * The neighbouring bands own the vertical rhythm, so this band contributes no
 * padding of its own; it renders a 159px-tall heading only.
 *
 * The content container is capped at 1700px, centred (Elementor kit `css/post-15.css`),
 * and the band surface itself is uncapped — the section's 20px gutter (`px-5`) is the
 * whole inset and grows with the viewport. The heading stays `text-center`, so a wider
 * container only changes the wrap point of a long title, never its alignment.
 *
 * Entrance (reference entrance probe §3.8): the heading widget `3660b10` reveals with
 * `slideInUp` — 750ms `ease`, from 20% of its own 1400x158.6 box (31.7px at 1440), fired
 * once when its top crosses the fold. That is the shared primitive's default effect, so
 * `<Reveal>` is all this band needs; the band has no interactive element of any kind
 * (probe §10), therefore no hover state.
 */

const EYEBROW_CLS =
  'inline-flex items-center rounded-xl border-2 border-[#0025E9]/20 bg-[linear-gradient(150deg,#0025E9_0%,#0025E9_10%,#ABBBF2_35%,#ABBBF2_0%,#ABBBF2_0%,#0025E9_100%)] bg-clip-text px-3 py-2 text-[15px] font-semibold leading-none text-transparent shadow-[0_0_20px_rgba(0,0,0,0.15),inset_0_0_20px_rgba(255,255,255,0.5)]';

const H2_CLS =
  "font-['DM_Sans',Almarai,sans-serif] text-[clamp(1.75rem,_1.4992rem_+_1.1465vw,_2.875rem)] font-semibold leading-[1.2] text-black";

export default function WorkflowHeading() {
  const { t } = useTranslation('site');

  return (
    <section id="workflow" className="px-5">
      <Reveal as="div" className="mx-auto w-full max-w-[1700px] text-center">
        <span className={EYEBROW_CLS}>{t('site.workflow.eyebrow')}</span>
        <h2 className={`${H2_CLS} mt-[15px]`}>{t('site.workflow.title')}</h2>
      </Reveal>
    </section>
  );
}
