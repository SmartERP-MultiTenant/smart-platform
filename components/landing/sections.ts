import type { ComponentType } from 'react';

import AlternatingSection from './AlternatingSection';
import CtaSection from './CtaSection';
import FeaturesSection from './FeaturesSection';
import HeroSection from './HeroSection';
import MobileSection from './MobileSection';
import TestimonialsSection from './TestimonialsSection';
import TrustSection from './TrustSection';

/**
 * The landing page's section registry — the single source of truth for the
 * **set and order** of the sections the public landing renders (P4.25).
 *
 * Before this file existed the order was implicit in `pages/index.tsx`, so the
 * only way to learn the funnel was to read that page plus all ten component
 * files. `pages/index.tsx` now renders `landingSections.map(...)`, which means:
 *
 * - reordering the funnel is a one-line move in this array;
 * - adding a section means adding a component file, an entry here, and (if the
 *   copy is new) the matching `landing-*` keys in `locales/{ar,en}/marketing.json`.
 *
 * **Scope of "source of truth":** the set and the order are genuinely driven by
 * this array. The per-section metadata (`anchor`, `i18nKey`) is **not** — it is
 * mirrored documentation of what each component already does, kept honest by
 * `__tests__/components/landing/sections.spec.tsx`. See those fields' comments.
 *
 * See `components/landing/README.md` for the full procedure.
 *
 * The header and footer are deliberately **not** in this list: they are chrome
 * owned by `components/layouts/PublicLayout.tsx`, not page sections. `TrustStrip`
 * is chrome too — `FooterSection` renders it.
 */
export interface LandingSection {
  /** Stable React key and the section's identity in the funnel order. */
  id: string;
  /**
   * The in-page anchor the section renders as `id="<anchor>"`, when it has one —
   * the target of the matching `/#<anchor>` link in `LandingHeader`'s nav.
   *
   * **Documentation only — NOT read at render time.** This value is *mirrored*
   * from a hardcoded `id="…"` inside the section component, so editing it here
   * changes nothing on the page. `__tests__/components/landing/sections.spec.tsx`
   * fails if this field and the component's rendered `id` ever disagree, which
   * is what keeps the mirror honest.
   *
   * To rename an anchor, change all three in one commit: this field, the
   * component's `id`, and the `/#…` href in `LandingHeader.tsx`.
   */
  anchor?: string;
  /**
   * The `marketing`-namespace key prefix every `t()` call in the section uses
   * (e.g. `landing-hero` covering `landing-hero-title-1`).
   *
   * **Documentation only — NOT read at render time.** Mirrored from the
   * component's own `t()` calls and verified by the spec named above.
   */
  i18nKey: string;
  Component: ComponentType;
}

export const landingSections: LandingSection[] = [
  {
    id: 'hero',
    anchor: 'home',
    i18nKey: 'landing-hero',
    Component: HeroSection,
  },
  {
    id: 'trust',
    anchor: 'about',
    i18nKey: 'landing-trust',
    Component: TrustSection,
  },
  {
    id: 'features',
    anchor: 'features',
    i18nKey: 'landing-feat',
    Component: FeaturesSection,
  },
  { id: 'alternating', i18nKey: 'landing-alt', Component: AlternatingSection },
  { id: 'mobile', i18nKey: 'landing-mobile', Component: MobileSection },
  {
    id: 'testimonials',
    anchor: 'testimonials',
    i18nKey: 'landing-test',
    Component: TestimonialsSection,
  },
  {
    id: 'cta',
    anchor: 'pricing',
    i18nKey: 'landing-cta',
    Component: CtaSection,
  },
];
