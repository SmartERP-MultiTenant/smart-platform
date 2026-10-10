/**
 * @jest-environment jsdom
 *
 * The hero band's branch chips, pinned in the Arabic locale.
 *
 * `HeroSection` prints an initial for each of the five branches in the floating
 * "Revenue By Branch" panel. One character separated the English names but not
 * the Arabic ones: الرياض and الدمام both open with the Arabic definite article,
 * so `slice(0, 1)` gave them the same chip. `sections.spec.tsx` renders this band
 * against `locales/en/site.json`, where that defect is invisible — this spec
 * renders it against the *real* `locales/ar/site.json` instead.
 *
 * The chip's own geometry is pinned too: the initials have to stay inside the
 * fixed 24px (`h-6 w-6`) chip, because this band's panel is positioned by
 * measurement and its rows must not grow.
 */
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

import HeroSection from '@/components/site/sections/HeroSection';

jest.mock('next-i18next', () => {
  const dictionaries: Record<string, Record<string, unknown>> = {
    site: jest.requireActual('locales/ar/site.json'),
    common: jest.requireActual('locales/ar/common.json'),
  };

  return {
    useTranslation: (namespace = 'common') => ({
      t: (key: string) => {
        const value = dictionaries[namespace]?.[key];
        // i18next echoes the key for a lookup that fails; reproducing that here
        // is what makes a missing Arabic string visible in this spec.
        return value === undefined ? key : value;
      },
    }),
  };
});

const AR_SITE = jest.requireActual('locales/ar/site.json') as Record<
  string,
  unknown
>;

/** The branches the band lists, in its own render order. */
const BRANCH_KEYS = ['riyadh', 'jeddah', 'dammam', 'makkah', 'abha'];

const branchName = (key: string): string =>
  String(AR_SITE[`site.hero.branches.${key}.name`]);

/**
 * The initial chip: the only `h-6 w-6` round span inside a panel row. The row's
 * progress track is a `span` in the same `li`, hence the class filter.
 */
const initialChips = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>('#hero li span')).filter(
    (element) =>
      element.className.includes('h-6 w-6') &&
      element.className.includes('rounded-full')
  );

describe('the hero band’s branch initials', () => {
  it('gives every Arabic branch a distinct initial', () => {
    const { container } = render(<HeroSection />);

    const chips = initialChips(container);
    const initials = chips.map((chip) => chip.textContent ?? '');

    expect(chips).toHaveLength(BRANCH_KEYS.length);
    // The reported collision: الرياض and الدمام both rendered as `ا`.
    expect(new Set(initials).size).toBe(BRANCH_KEYS.length);
    expect(initials).not.toContain('');
  });

  it('takes each initial from its own row, in two characters', () => {
    const { container } = render(<HeroSection />);

    const chips = initialChips(container);

    BRANCH_KEYS.forEach((key, index) => {
      const initial = chips[index].textContent ?? '';

      // A substring of its own branch name: the chip identifies the row it
      // sits in, not just "some branch".
      expect(branchName(key)).toContain(initial);
      expect(initial).toHaveLength(2);
      // The chip is `h-6 w-6` (24px) and must stay that size: the text cannot
      // be what sets the box.
      expect(chips[index].className).toContain('h-6 w-6');
    });
  });
});
