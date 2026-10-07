import { type ReactElement, type ReactNode } from 'react';
import type { NextPageWithLayout } from 'types';
import { GetServerSidePropsContext } from 'next';
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';

import env from '@/lib/env';
import Footer from '@/components/site/Footer';
import Navbar from '@/components/site/Navbar';
import HeroSection from '@/components/site/sections/HeroSection';
import NetworkShowcase from '@/components/site/sections/NetworkShowcase';
import PlatformCapabilities from '@/components/site/sections/PlatformCapabilities';
import RemoteWorkSection from '@/components/site/sections/RemoteWorkSection';
import ServicesShowcase from '@/components/site/sections/ServicesShowcase';
import TestimonialsSection from '@/components/site/sections/TestimonialsSection';
import ToolsShowcase from '@/components/site/sections/ToolsShowcase';
import WorkCounters from '@/components/site/sections/WorkCounters';
import WorkflowHeading from '@/components/site/sections/WorkflowHeading';
// Side-effect import: registers the DM Sans / Golos Text / Almarai `@font-face`
// rules the bands below ask for by name. It is route-scoped by virtue of being
// imported here — no global stylesheet and no other page loads these faces.
import '@/components/site/marketing-fonts.module.css';
import {
  publicFontFamily,
  publicFontVariables,
} from '@/components/layouts/public-fonts';
import SEO from '@/components/shared/SEO';

/**
 * `/` — the SMART PLATFORM public homepage.
 *
 * The render order below is the reference's own 11-band map
 * (`wdtsassy-spec.md` §0): header · hero (+ dashboard visual) · SaaS feature
 * (+ heading row + card panel) · SaaS tools (+ intro row + slider) · our
 * services · our work counters · SaaS network (+ features) · optimize your
 * workflow · remote work bento · our solutions · footer. Each entry is one band
 * component in `components/site/sections/**`; the nested reference sections live
 * inside the band that owns them. Component names are semantic — the reference
 * band ids (S04, S12, S16 …) survive only in those components' own doc comments,
 * where they name the reference sections the geometry was measured from.
 *
 * Four composition facts this route is responsible for:
 *
 * 1. **The header is an overlay.** The hero band starts at the top of the
 *    document (`HeroSection`'s own note: "this band starts at page top because
 *    the header is absolutely positioned over it"), so `Navbar` is mounted inside
 *    an `absolute inset-x-0 top-0` box. The reference reaches the same geometry
 *    from the opposite direction — an in-flow header plus `margin-top:-265px` on
 *    the hero — and the overlay is that same geometry without a magic number.
 *    Every other public page renders the same `Navbar` in flow instead, because
 *    it is `PublicLayout` that mounts the shared chrome for them.
 * 2. **Exactly one header and one footer.** `Navbar`/`Footer` are the pair this
 *    page uses: `Navbar` is the header band (S01-S03) — it owns the offcanvas
 *    drawer (focus trap, Escape, scroll lock), the current-page state and the
 *    `env.supportUrl` contact slot — and `Footer` covers the whole footer band
 *    (S22-S32). A second header component for the same band must not come back.
 * 3. **`PublicLayout` is not the homepage shell.** It exists for the other seven
 *    public pages and mounts this same `Navbar`/`Footer` (in flow, because they
 *    have no hero to overlay); using it here would render the chrome twice. The
 *    `_app` default (`AccountLayout`) is the signed-in app shell. So the shell is
 *    declared here: document direction, the public font stack, and the white
 *    page the bands float on.
 * 4. **The shell owns the public font stack.** `Navbar`/`Footer` inherit the
 *    font of whatever shell mounts them, so this one takes the same faces from
 *    `components/layouts/public-fonts.ts` that `PublicLayout` uses. Without it
 *    the homepage's nav/footer rendered their Arabic copy in the UA fallback
 *    while the identical components rendered in Almarai on the other public
 *    pages. `components/site/marketing-fonts.module.css` above is a different
 *    concern: it registers the bands' own DM Sans / Golos Text / Almarai
 *    `@font-face` rules, which the bands address by family name.
 *
 * RT-1 · Runtime-only i18n keys.
 *
 * `scripts/check-locale.js` finds a used key only when it appears in a file as a
 * single-quoted literal — `t('site.hero.title')` — and then fails the build for
 * any key in `locales/**` it cannot see used. Several band components also
 * resolve keys they assemble from template literals, e.g.
 * `t(`site.platform.cards.${card.index}.title`)` in `PlatformCapabilities.tsx`,
 * which the gate cannot see. The keys those lookups expand to are listed
 * verbatim below so the gate can see them; nothing in this comment is executed.
 * They must stay in step with the data lists in the band components that produce
 * them (`BRANCHES`, `PERIODS` and `SCHEDULE_ROWS` in HeroSection; `CARDS` in
 * PlatformCapabilities and ToolsShowcase; `SLIDES` in ServicesShowcase and
 * NetworkShowcase; `STATS` in WorkCounters; `FEATURES` in NetworkShowcase;
 * `MARQUEE_ROWS` and `TESTIMONIALS` in TestimonialsSection).
 *
 *   t('site.hero.branches.abha.amount') t('site.hero.branches.abha.name')
 *   t('site.hero.branches.dammam.amount') t('site.hero.branches.dammam.name')
 *   t('site.hero.branches.jeddah.amount') t('site.hero.branches.jeddah.name')
 *   t('site.hero.branches.makkah.amount') t('site.hero.branches.makkah.name')
 *   t('site.hero.branches.riyadh.amount') t('site.hero.branches.riyadh.name')
 *   t('site.hero.schedule.daily') t('site.hero.schedule.labels.invoices')
 *   t('site.hero.schedule.labels.payroll') t('site.hero.schedule.labels.stock')
 *   t('site.hero.schedule.monthly') t('site.hero.schedule.yearly') t('site.platform.cards.1.desc')
 *   t('site.platform.cards.1.link') t('site.platform.cards.1.title') t('site.platform.cards.2.desc')
 *   t('site.platform.cards.2.link') t('site.platform.cards.2.title') t('site.platform.cards.3.desc')
 *   t('site.platform.cards.3.link') t('site.platform.cards.3.title') t('site.platform.cards.4.desc')
 *   t('site.platform.cards.4.link') t('site.platform.cards.4.title')
 *   t('site.tools.cards.inventory.description') t('site.tools.cards.inventory.title')
 *   t('site.tools.cards.ledger.description') t('site.tools.cards.ledger.title')
 *   t('site.tools.cards.reporting.description') t('site.tools.cards.reporting.title')
 *   t('site.tools.cards.workforce.description') t('site.tools.cards.workforce.title')
 *   t('site.services.slides.inventory.description') t('site.services.slides.inventory.title')
 *   t('site.services.slides.ledger.description') t('site.services.slides.ledger.title')
 *   t('site.services.slides.payroll.description') t('site.services.slides.payroll.title')
 *   t('site.services.slides.reporting.description') t('site.services.slides.reporting.title')
 *   t('site.services.slides.tenants.description') t('site.services.slides.tenants.title')
 *   t('site.counters.cards.close.description') t('site.counters.cards.close.tag')
 *   t('site.counters.cards.close.title') t('site.counters.cards.companies.description')
 *   t('site.counters.cards.companies.tag') t('site.counters.cards.companies.title')
 *   t('site.counters.cards.modules.description') t('site.counters.cards.modules.tag')
 *   t('site.counters.cards.modules.title') t('site.network.features.operations.description')
 *   t('site.network.features.operations.title') t('site.network.features.reporting.description')
 *   t('site.network.features.reporting.title') t('site.network.features.scale.description')
 *   t('site.network.features.scale.title') t('site.network.slides.dashboard')
 *   t('site.network.slides.inventory') t('site.network.slides.reports')
 *   t('site.testimonials.rows.row1') t('site.testimonials.rows.row2') t('site.testimonials.rows.row3')
 *   t('site.testimonials.t1.initials') t('site.testimonials.t1.name') t('site.testimonials.t1.quote')
 *   t('site.testimonials.t1.role') t('site.testimonials.t2.initials') t('site.testimonials.t2.name')
 *   t('site.testimonials.t2.quote') t('site.testimonials.t2.role') t('site.testimonials.t3.initials')
 *   t('site.testimonials.t3.name') t('site.testimonials.t3.quote') t('site.testimonials.t3.role')
 */

function SiteShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const locale = router.locale || 'ar';

  // `_app` also syncs <html lang/dir> on locale change; this shell owns the
  // page's own direction so the bands mirror correctly on a client-side switch.
  // The font variables/stack are `PublicLayout`'s, imported rather than copied:
  // both shells mount the same `Navbar`/`Footer`, which inherit what the shell
  // declares.
  return (
    <div
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      lang={locale}
      className={`min-h-screen overflow-x-hidden bg-white text-black ${publicFontVariables}`}
      style={{ fontFamily: publicFontFamily }}
    >
      {children}
    </div>
  );
}

const Home: NextPageWithLayout = () => {
  const { t } = useTranslation('site');

  // Structured data for the public homepage. Only verifiable handles may appear
  // here: the previously listed LinkedIn URL (linkedin.com/company/smartapro)
  // returns HTTP 404 — LinkedIn serves 200 for real companies — so it was
  // removed rather than advertised as a dead profile. `offers` is absent on
  // purpose: plan prices are not available to this statically-rendered landing
  // page (they come from the ERP at request time via `erp.getPackages()`, as
  // used by `pages/pricing.tsx`, which owns the real AggregateOffer). Inventing
  // lowPrice/offerCount here would be fabricated pricing data.
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'SMART PLATFORM',
      alternateName: 'SmartERP',
      url: 'https://platform.smartapro.com',
      logo: 'https://platform.smartapro.com/logo/logo.png',
      description:
        'منصة ERP سعودية سحابية متكاملة تجمع المحاسبة والمخزون والموارد البشرية والمبيعات والفوترة الإلكترونية المتوافقة مع هيئة الزكاة والضريبة والجمارك (ZATCA).',
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        areaServed: 'SA',
        availableLanguage: ['Arabic', 'English'],
      },
      sameAs: ['https://twitter.com/smartapro'],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'SMART PLATFORM',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'نظام ERP سحابي وإداري متكامل للمنشآت في المملكة العربية السعودية.',
    },
  ];

  return (
    <>
      <SEO
        title={t('site.page.title')}
        description={t('site.page.description')}
        ogType="website"
        jsonLd={jsonLd}
      />

      <div className="relative">
        {/* The header floats over the hero band; it is not part of the flow. */}
        <div className="absolute inset-x-0 top-0 z-40">
          <Navbar />
        </div>

        <main>
          <HeroSection />
          <PlatformCapabilities />
          <ToolsShowcase />
          <ServicesShowcase />
          <WorkCounters />
          <NetworkShowcase />
          <WorkflowHeading />
          <RemoteWorkSection />
          <TestimonialsSection />
        </main>

        <Footer />
      </div>
    </>
  );
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  // Redirect to login page if landing page is disabled
  if (env.hideLandingPage) {
    return {
      redirect: {
        destination: '/auth/login',
        permanent: true,
      },
    };
  }

  const { locale } = context;

  return {
    props: {
      ...(locale
        ? await serverSideTranslations(locale, ['site', 'common'])
        : await serverSideTranslations('ar', ['site', 'common'])),
    },
  };
};

Home.getLayout = function getLayout(page: ReactElement) {
  return <SiteShell>{page}</SiteShell>;
};

export default Home;
