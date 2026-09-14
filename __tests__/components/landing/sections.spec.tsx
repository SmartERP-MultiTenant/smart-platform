/**
 * @jest-environment jsdom
 *
 * Contract tests for the landing section registry (P4.25).
 *
 * ## Why this file exists
 *
 * `components/landing/sections.ts` is the source of truth for the **set and
 * order** of the landing sections, and `pages/index.tsx` genuinely renders from
 * it. But two per-entry fields — `anchor` and `i18nKey` — are **not read at
 * render time**: the real anchor is a hardcoded `id="…"` inside each section
 * component, and the real i18n prefix is whatever that component's `t()`
 * calls use.
 *
 * Without this spec those fields would be inert prose, and editing
 * `anchor: 'home'` would silently do nothing while looking like a funnel change.
 * These tests turn that prose into an enforced mirror, so the registry's
 * metadata cannot quietly drift away from the components it describes.
 *
 * `i18nKey` is checked by scanning the component source rather than the rendered
 * output, because a section may legitimately render a non-key literal; scanning
 * the `t()` call sites is what actually pins the prefix.
 *
 * Assertions aggregate their findings into an object and compare that to the
 * expected shape, so a failure names every offending section at once instead of
 * stopping at the first one.
 */
import fs from 'fs';
import path from 'path';

import type { ComponentType } from 'react';

import { render } from '@testing-library/react';

import { landingSections } from '@/components/landing/sections';

jest.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('next/router', () => ({
  useRouter: () => ({
    locale: 'en',
    asPath: '/',
    pathname: '/',
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    events: { on: jest.fn(), off: jest.fn() },
  }),
}));

const LANDING_DIR = path.join(process.cwd(), 'components', 'landing');

/** The funnel order the landing page is documented to render. */
const DOCUMENTED_ORDER = [
  'hero',
  'trust',
  'features',
  'alternating',
  'mobile',
  'testimonials',
  'cta',
];

/** The two sections documented as plain, non-navigable sections. */
const DOCUMENTED_UNANCHORED = ['alternating', 'mobile'];

/**
 * Resolve a registry entry's component back to its source file. The README
 * mandates the `<Thing>Section.tsx` / `<Thing>Section` naming pair, so a missing
 * file means that convention was broken and the test says so explicitly rather
 * than silently skipping the entry.
 */
const sourceFileFor = (name: string): string => {
  const file = path.join(LANDING_DIR, `${name}.tsx`);

  if (!fs.existsSync(file)) {
    throw new Error(
      `No source file for section component "${name}". Expected ${file}. ` +
        'Landing section components must keep <Thing>Section.tsx / <Thing>Section in sync.'
    );
  }

  return file;
};

/** Collect every match of a global regex, without needing an iterable target. */
const matchAll = (source: string, pattern: RegExp): string[] => {
  const found: string[] = [];
  const re = new RegExp(pattern.source, pattern.flags);
  let match = re.exec(source);

  while (match !== null) {
    found.push(match[1]);
    match = re.exec(source);
  }

  return found;
};

/** Every translation key passed to `t()` in a source file. */
const translationKeysIn = (source: string): string[] =>
  // The lookbehind keeps `format(`, `obj.t(` and `i18n.t(` out of the matches.
  matchAll(source, /(?<![A-Za-z0-9_$.])t\(\s*['"]([^'"]+)['"]/g);

/** Every distinct in-page `/#anchor` target referenced by the landing chrome. */
const chromeNavTargets = (): string[] => {
  // The header owns the nav and the footer owns the secondary link columns; an
  // anchor is reachable if EITHER links to it (`/#testimonials` is footer-only).
  const targets: string[] = [];

  for (const file of ['LandingHeader.tsx', 'FooterSection.tsx']) {
    const source = fs.readFileSync(path.join(LANDING_DIR, file), 'utf8');

    for (const target of matchAll(source, /'\/#([a-z0-9-]+)'/g)) {
      if (targets.indexOf(target) === -1) {
        targets.push(target);
      }
    }
  }

  return targets.sort();
};

const renderAll = (components: ComponentType[]) =>
  render(
    <>
      {components.map((Component, index) => (
        <Component key={index} />
      ))}
    </>
  );

const documentedAnchors = (): string[] =>
  landingSections
    .filter((section) => Boolean(section.anchor))
    .map((section) => section.anchor as string);

describe('landing section registry (P4.25)', () => {
  it('documents the sections in the order the page renders them', () => {
    expect(landingSections.map((section) => section.id)).toEqual(
      DOCUMENTED_ORDER
    );
  });

  it('gives every entry a unique id and an unnamed-component-free list', () => {
    const ids = landingSections.map((section) => section.id);
    const uniqueIds: string[] = [];

    for (const id of ids) {
      if (uniqueIds.indexOf(id) === -1) {
        uniqueIds.push(id);
      }
    }

    expect(uniqueIds).toEqual(ids);
    expect(
      landingSections
        .filter((section) => !section.Component.name)
        .map((section) => section.id)
    ).toEqual([]);
  });

  it('renders each documented anchor exactly once across the whole funnel', () => {
    const { container } = renderAll(
      landingSections.map((section) => section.Component)
    );

    const anchored = landingSections.filter((section) =>
      Boolean(section.anchor)
    );

    // Guard against the assertion below passing vacuously if every anchor were
    // dropped from the registry.
    expect(anchored.length).toBe(
      DOCUMENTED_ORDER.length - DOCUMENTED_UNANCHORED.length
    );

    // `{ id: N }` on both sides means a failure names the offending section and
    // the number of elements that actually carry its anchor.
    expect(
      anchored.map((section) => ({
        id: section.id,
        anchor: section.anchor,
        rendered: container.querySelectorAll(`[id="${section.anchor}"]`).length,
      }))
    ).toEqual(
      anchored.map((section) => ({
        id: section.id,
        anchor: section.anchor,
        rendered: 1,
      }))
    );
  });

  it('renders no registry anchor for entries documented without one', () => {
    const unanchored = landingSections.filter((section) => !section.anchor);

    expect(unanchored.map((section) => section.id)).toEqual(
      DOCUMENTED_UNANCHORED
    );

    const collisions: string[] = [];

    for (const section of unanchored) {
      const { container } = render(<section.Component />);

      for (const anchor of documentedAnchors()) {
        if (container.querySelector(`[id="${anchor}"]`) !== null) {
          collisions.push(`${section.id} renders id="${anchor}"`);
        }
      }
    }

    expect(collisions).toEqual([]);
  });

  it('pins every section component’s t() keys to its documented i18nKey prefix', () => {
    // Keyed by section id so a failure names the section, the prefix it
    // documents, and the keys that escaped it.
    const missingKeys: Record<string, string> = {};
    const strayKeys: Record<string, string[]> = {};

    for (const section of landingSections) {
      const componentName = section.Component.name;
      const keys = translationKeysIn(
        fs.readFileSync(sourceFileFor(componentName), 'utf8')
      );

      if (keys.length === 0) {
        missingKeys[section.id] = componentName;
        continue;
      }

      const stray = keys.filter(
        (key) => key.indexOf(`${section.i18nKey}-`) !== 0
      );

      if (stray.length > 0) {
        strayKeys[`${section.id} (${section.i18nKey})`] = stray;
      }
    }

    expect({
      sectionsWithNoTranslationCalls: missingKeys,
      keysOutsideTheDocumentedPrefix: strayKeys,
    }).toEqual({
      sectionsWithNoTranslationCalls: {},
      keysOutsideTheDocumentedPrefix: {},
    });
  });

  it('keeps the chrome links and the registry anchors in step, both ways', () => {
    const documented = documentedAnchors().sort();
    const linked = chromeNavTargets();

    // Direction 1 — a `/#x` link pointing at an anchor no section owns scrolls
    // nowhere. This is the drift the coupling test exists to prevent.
    const deadLinks = linked.filter(
      (target) => documented.indexOf(target) === -1
    );

    // Direction 2 — a documented anchor nothing links to is unreachable from the
    // page (the header nav is not the only linker: `/#testimonials` is footer-only,
    // which is why this does not compare against the header alone).
    const orphanAnchors = documented.filter(
      (anchor) => linked.indexOf(anchor) === -1
    );

    // Guards both comparisons against passing vacuously.
    expect(documented.length).toBeGreaterThan(0);
    expect(linked.length).toBeGreaterThan(0);

    expect({ deadLinks, orphanAnchors }).toEqual({
      deadLinks: [],
      orphanAnchors: [],
    });
  });
});
