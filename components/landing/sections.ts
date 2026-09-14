import type { ComponentType } from 'react';

import AlternatingSection from './AlternatingSection';
import CtaSection from './CtaSection';
import FeaturesSection from './FeaturesSection';
import HeroSection from './HeroSection';
import MobileSection from './MobileSection';
import TestimonialsSection from './TestimonialsSection';
import TrustSection from './TrustSection';

/**
 * The landing page's section registry — the single source of truth for
 * *which* sections the public landing renders and in *what order* (P4.25).
 *
 * Before this file existed the order was implicit in `pages/index.tsx`, so the
 * only way to learn the funnel was to read that page plus all ten component
 * files. `pages/index.tsx` now renders `landingSections.map(...)`, which means:
 *
 * - reordering the funnel is a one-line move in this array;
 * - adding a section means adding a component file, an entry here, and (if the
 *   copy is new) the matching `landing-*` keys in `locales/{ar,en}/marketing.json`.
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
   * The in-page anchor the section renders as `id="<anchor>"`, when it has one.
   * These are the targets of the header nav (`/ #home`, `/ #about`, …).
   */
  anchor?: string;
  /**
   * Prefix every copy string in the section is namespaced under, in the
   * `marketing` i18n namespace (e.g. `landing-hero-title-1`).
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

export default landingSections;
