/**
 * @jest-environment jsdom
 *
 * Per-band contract tests for the nine homepage bands in
 * `components/site/sections/**`.
 *
 * `pages/index.tsx` is the only consumer of these components and, until this
 * spec, nothing else rendered them in isolation. Two failure modes were
 * therefore invisible:
 *
 * 1. **A band that stops rendering its own copy.** `check-locale` proves a key
 *    exists and is referenced somewhere in the source; it does not prove the
 *    markup still renders it. Each band below declares the keys it is
 *    responsible for, and the resolved English values of those keys must appear
 *    in the band's rendered output.
 * 2. **A key that resolves to nothing.** The `next-i18next` mock is backed by
 *    the real `locales/en/site.json` and returns the key for anything the
 *    locale file does not declare, so the template-literal lookups the locale
 *    gate cannot see (`site.platform.cards.${card.index}.title` and friends)
 *    render `site.something` into the DOM and fail here.
 *
 * The band ids are asserted to be the documented nine, so a band that silently
 * changes its anchor id — which would break the chrome's `/#…` links — fails
 * here as well as in `homepage.spec.tsx`.
 */
import type { ComponentType } from 'react';

import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

import HeroSection from '@/components/site/sections/HeroSection';
import NetworkShowcase from '@/components/site/sections/NetworkShowcase';
import PlatformCapabilities from '@/components/site/sections/PlatformCapabilities';
import RemoteWorkSection from '@/components/site/sections/RemoteWorkSection';
import ServicesShowcase from '@/components/site/sections/ServicesShowcase';
import TestimonialsSection from '@/components/site/sections/TestimonialsSection';
import ToolsShowcase from '@/components/site/sections/ToolsShowcase';
import WorkCounters from '@/components/site/sections/WorkCounters';
import WorkflowHeading from '@/components/site/sections/WorkflowHeading';

jest.mock('next-i18next', () => {
  const dictionaries: Record<string, Record<string, unknown>> = {
    site: jest.requireActual('locales/en/site.json'),
    common: jest.requireActual('locales/en/common.json'),
  };

  return {
    useTranslation: (namespace = 'common') => ({
      t: (key: string) => {
        const value = dictionaries[namespace]?.[key];
        return value === undefined ? key : value;
      },
    }),
  };
});

jest.mock('next/router', () => ({
  useRouter: () => ({
    locale: 'en',
    pathname: '/',
    asPath: '/',
    query: {},
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    events: { on: jest.fn(), off: jest.fn() },
  }),
}));

const SITE = jest.requireActual('locales/en/site.json') as Record<
  string,
  unknown
>;

interface BandCase {
  /** Component file name, so a failure names the band. */
  name: string;
  Component: ComponentType;
  /** The `id` the chrome and the in-page `/#…` links resolve against. */
  id: string;
  /**
   * Keys this band is responsible for. Mixed deliberately: single-quoted
   * literals the locale gate can see, plus the template-literal keys resolved
   * from the band's own data lists (the RT-1 set documented in
   * `pages/index.tsx`), which the gate cannot see at all.
   */
  requiredKeys: string[];
}

const BANDS: BandCase[] = [
  {
    name: 'HeroSection',
    Component: HeroSection,
    id: 'hero',
    requiredKeys: [
      'site.hero.eyebrow',
      'site.hero.title',
      'site.hero.subtitle',
      'site.hero.subscribe',
      'site.hero.emailLabel',
      'site.hero.dashboardAlt',
      'site.hero.panelTitle',
      'site.hero.branches.riyadh.name',
      'site.hero.schedule.labels.invoices',
    ],
  },
  {
    name: 'PlatformCapabilities',
    Component: PlatformCapabilities,
    id: 'platform',
    requiredKeys: [
      'site.platform.eyebrow',
      'site.platform.title',
      'site.platform.lead',
      'site.platform.sliderLabel',
      'site.platform.cards.1.title',
    ],
  },
  {
    name: 'ToolsShowcase',
    Component: ToolsShowcase,
    id: 'tools',
    requiredKeys: [
      'site.tools.label',
      'site.tools.eyebrow',
      'site.tools.title',
      'site.tools.cta',
      'site.tools.next',
      'site.tools.previous',
      'site.tools.cards.ledger.title',
    ],
  },
  {
    name: 'ServicesShowcase',
    Component: ServicesShowcase,
    id: 'services',
    requiredKeys: [
      'site.services.eyebrow',
      'site.services.title',
      'site.services.intro',
      'site.services.slides.ledger.title',
    ],
  },
  {
    name: 'WorkCounters',
    Component: WorkCounters,
    id: 'results',
    requiredKeys: [
      'site.counters.eyebrow',
      'site.counters.title',
      'site.counters.ctaPrimary',
      'site.counters.ctaSecondary',
      'site.counters.cards.companies.title',
    ],
  },
  {
    name: 'NetworkShowcase',
    Component: NetworkShowcase,
    id: 'features',
    requiredKeys: [
      'site.network.eyebrow',
      'site.network.title',
      'site.network.intro',
      'site.network.seeAllFeatures',
      'site.network.features.operations.title',
      'site.network.slides.dashboard',
    ],
  },
  {
    name: 'WorkflowHeading',
    Component: WorkflowHeading,
    id: 'workflow',
    requiredKeys: ['site.workflow.eyebrow', 'site.workflow.title'],
  },
  {
    name: 'RemoteWorkSection',
    Component: RemoteWorkSection,
    id: 'remote-work',
    requiredKeys: [
      'site.remote.title',
      'site.remote.watermark',
      'site.remote.help.title',
      'site.remote.saving.title',
      'site.remote.customers.title',
      'site.remote.rating',
    ],
  },
  {
    name: 'TestimonialsSection',
    Component: TestimonialsSection,
    id: 'testimonials',
    requiredKeys: [
      'site.testimonials.label',
      'site.testimonials.eyebrow',
      'site.testimonials.title',
      'site.testimonials.intro',
      'site.testimonials.next',
      'site.testimonials.previous',
      'site.testimonials.t1.name',
    ],
  },
];

/** The nine band anchors the homepage is documented to render. */
const DOCUMENTED_BAND_IDS = [
  'hero',
  'platform',
  'tools',
  'services',
  'results',
  'features',
  'workflow',
  'remote-work',
  'testimonials',
];

const SITE_KEY_PATTERN = /site\.[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*/g;

const READABLE_ATTRS = ['alt', 'aria-label', 'title', 'placeholder'];

/**
 * Every text node under `root`, walked individually rather than read from
 * `textContent`: `textContent` glues adjacent keys together (`site.a.title`
 * next to `site.b.title` becomes one string), which would turn a leaked key
 * into an unreadable blob in the failure message.
 */
const textNodesOf = (root: HTMLElement): string[] => {
  const values: string[] = [];

  const visit = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        values.push(child.textContent ?? '');
      } else {
        visit(child);
      }
    }
  };

  visit(root);

  return values;
};

/** Attribute values a user or a screen reader can read. */
const readableAttributes = (root: HTMLElement): string[] => {
  const values: string[] = [];

  for (const attr of READABLE_ATTRS) {
    for (const element of Array.from(root.querySelectorAll(`[${attr}]`))) {
      values.push(element.getAttribute(attr) ?? '');
    }
  }

  return values;
};

/** Raw translation keys that leaked into the rendered output, sorted and unique. */
const leakedKeys = (root: HTMLElement): string[] => {
  const found: string[] = [];

  for (const value of textNodesOf(root).concat(readableAttributes(root))) {
    for (const match of value.match(SITE_KEY_PATTERN) ?? []) {
      if (found.indexOf(match) === -1) {
        found.push(match);
      }
    }
  }

  return found.sort();
};

describe('the nine homepage bands', () => {
  it('covers the documented band ids exactly once each', () => {
    const ids = BANDS.map((band) => band.id).sort();
    const unique: string[] = [];

    for (const id of ids) {
      if (unique.indexOf(id) === -1) {
        unique.push(id);
      }
    }

    expect(unique).toEqual(ids);
    expect(ids).toEqual([...DOCUMENTED_BAND_IDS].sort());
  });

  it.each(BANDS)(
    '$name renders the copy its keys resolve to, under id="$id"',
    ({ Component, id, requiredKeys }) => {
      const { container } = render(<Component />);

      const sections = Array.from(container.querySelectorAll('section'));

      expect(sections.map((section) => section.id)).toEqual([id]);

      // Every key in the table has to exist in the locale, otherwise the
      // "value is rendered" check below could pass on a `undefined` sample.
      const declared = requiredKeys.filter((key) => SITE[key] === undefined);
      expect(declared).toEqual([]);

      // Attributes are included because some of the keys below render as `alt`
      // text (`site.hero.dashboardAlt`), and the null-join keeps two adjacent
      // values from faking a match across the boundary.
      const rendered = textNodesOf(container)
        .concat(readableAttributes(container))
        .join('\u0000');

      const notRendered = requiredKeys.filter(
        (key) => rendered.indexOf(String(SITE[key])) === -1
      );

      expect(notRendered).toEqual([]);
      expect(leakedKeys(container)).toEqual([]);
    }
  );

  it.each(BANDS)(
    '$name owns no <h1> unless it is the hero band',
    ({ Component, id }) => {
      const { container } = render(<Component />);

      expect(container.querySelectorAll('h1')).toHaveLength(
        id === 'hero' ? 1 : 0
      );
    }
  );
});
