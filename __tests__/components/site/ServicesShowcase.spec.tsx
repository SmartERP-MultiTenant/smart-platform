/**
 * @jest-environment jsdom
 *
 * Activation contract for the "Our Services" showcase (S12).
 *
 * The band used to activate only on click. It now reproduces the reference
 * widget's trigger — `mouseover` on the row, synchronous, no revert — while
 * keeping a click and a focus path so taps and keyboard users are not locked
 * out. `sections.spec.tsx` renders this band but never interacts with it, so
 * before this spec clicked-versus-hovered was untested.
 *
 * Two invariants beyond the trigger are pinned here because they are the ones a
 * future edit silently breaks:
 *
 * 1. **Exactly one row is active, always.** The rows are disclosure buttons
 *    (`aria-expanded`) that drive one shared media panel, and the reference
 *    never reverts to row 0 when the pointer leaves — so "no leave handler"
 *    is part of the contract, not an omission.
 * 2. **Every animated node carries `data-s12-motion`.** That attribute is the
 *    only thing the band's `prefers-reduced-motion` block targets, so an
 *    element that gains a transition without the attribute becomes the one
 *    place the page ignores reduced motion.
 */
import { act, fireEvent, render } from '@testing-library/react';
import '@testing-library/jest-dom';

import ServicesShowcase from '@/components/site/sections/ServicesShowcase';

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

const ROWS = 5;

interface Band {
  container: HTMLElement;
  /** The five row buttons, in render order. */
  buttons: HTMLButtonElement[];
  /** The five `<li>` rows. */
  rows: HTMLLIElement[];
}

const renderBand = (): Band => {
  const { container } = render(<ServicesShowcase />);

  const rows = Array.from(
    container.querySelectorAll<HTMLLIElement>('#services ul > li')
  );

  return {
    container,
    rows,
    buttons: rows.map(
      (row) => row.querySelector('button') as HTMLButtonElement
    ),
  };
};

/** The active marker the whole band is driven by, read off the ARIA state. */
const expansion = (buttons: HTMLButtonElement[]): string[] =>
  buttons.map((button) => button.getAttribute('aria-expanded') as string);

/** `true` for the rows the band currently has active. */
const activeRows = (buttons: HTMLButtonElement[]): boolean[] =>
  buttons.map((button) => button.getAttribute('aria-expanded') === 'true');

const activeIndex = (buttons: HTMLButtonElement[]): number =>
  activeRows(buttons).indexOf(true);

const classesOf = (element: Element | null): string =>
  element === null ? '' : (element.getAttribute('class') ?? '');

describe('the services showcase activation', () => {
  it('renders five rows with the first one active', () => {
    const { buttons } = renderBand();

    expect(buttons).toHaveLength(ROWS);
    expect(expansion(buttons)).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
    ]);
  });

  it('activates a row on hover, with no click', () => {
    const { buttons, rows } = renderBand();

    fireEvent.mouseOver(rows[2]);

    expect(activeIndex(buttons)).toBe(2);
    expect(expansion(buttons)).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
    ]);
  });

  it('keeps the last hovered row active when the pointer leaves', () => {
    const { buttons, rows } = renderBand();

    fireEvent.mouseOver(rows[3]);
    // The reference binds nothing to `mouseout`: there is no revert to row 0.
    fireEvent.mouseOut(rows[3]);
    fireEvent.mouseLeave(rows[3]);

    expect(activeIndex(buttons)).toBe(3);
  });

  it('still activates on click, which is the tap path on touch', () => {
    const { buttons } = renderBand();

    // A tap only ever produces a click when hover is unavailable.
    fireEvent.click(buttons[4]);

    expect(activeIndex(buttons)).toBe(4);
  });

  it('still activates on focus, which is the keyboard path', () => {
    const { buttons } = renderBand();

    // `focus()` is what a Tab stop does; jsdom fires `focusin`, which is what
    // React listens to.
    act(() => {
      buttons[1].focus();
    });

    expect(activeIndex(buttons)).toBe(1);
  });

  it('drives the media panel and the caret from the same active row', () => {
    const { container, rows } = renderBand();

    const panels = Array.from(
      container.querySelectorAll<HTMLImageElement>('#services img')
    );
    const carets = Array.from(container.querySelectorAll('#services svg'));
    const rules = Array.from(
      container.querySelectorAll('#services ul > li > span')
    );

    const panelClasses = () => panels.map(classesOf);
    const caretClasses = () => carets.map(classesOf);
    const ruleClasses = () => rules.map(classesOf);

    // Inactive media panels are hidden and rise 30px in the reference.
    expect(panelClasses()[0]).toContain('opacity-100');
    expect(panelClasses()[0]).toContain('translate-y-0');
    expect(panelClasses()[0]).not.toContain('invisible');
    expect(panelClasses()[1]).toContain('opacity-0');
    expect(panelClasses()[1]).toContain('translate-y-[30px]');
    expect(panelClasses()[1]).toContain('invisible');

    // The caret fades instead of mounting, so it is always in the DOM.
    expect(carets).toHaveLength(ROWS);
    expect(caretClasses()[0]).toContain('opacity-100');
    expect(caretClasses()[1]).toContain('opacity-0');

    // The hairline is a sliding gradient, not a colour swap.
    expect(ruleClasses()[0]).toContain('bg-[position:right_bottom]');
    expect(ruleClasses()[1]).toContain('bg-[position:left_bottom]');

    fireEvent.mouseOver(rows[2]);

    expect(panelClasses()[0]).toContain('invisible');
    expect(panelClasses()[2]).toContain('opacity-100');
    expect(panelClasses()[2]).not.toContain('invisible');
    expect(caretClasses()[0]).toContain('opacity-0');
    expect(caretClasses()[2]).toContain('opacity-100');
    expect(ruleClasses()[2]).toContain('bg-[position:right_bottom]');
  });

  it('carries the reference’s measured timings', () => {
    const { container } = renderBand();

    const numeral = container.querySelector('#services li span[style]');
    const rule = container.querySelector('#services ul > li > span');
    const caret = container.querySelector('#services svg');
    const description = container.querySelector('#services ul > li > div > p');

    // --wdtBaseTransition: background-position, 0.3s linear.
    expect(classesOf(numeral)).toContain('transition-[background-position]');
    expect(classesOf(numeral)).toContain('duration-300');
    expect(classesOf(numeral)).toContain('ease-linear');

    // The hairline is the one 0.6s rule, on the reference's swift curve.
    expect(classesOf(rule)).toContain('duration-[600ms]');
    expect(classesOf(rule)).toContain('ease-[cubic-bezier(0.7,0,0.3,1)]');
    expect(classesOf(rule)).toContain('bg-[length:201%_2px]');

    // The caret: opacity only, 0.375s on the same curve.
    expect(classesOf(caret)).toContain('transition-opacity');
    expect(classesOf(caret)).toContain('duration-[375ms]');
    expect(classesOf(caret)).toContain('ease-[cubic-bezier(0.7,0,0.3,1)]');

    // The description rises 30px and takes its 20px padding-top on the way in.
    expect(classesOf(description)).toContain(
      'transition-[opacity,transform,padding-top]'
    );
    expect(classesOf(description)).toContain('duration-300');
    expect(classesOf(description)).toContain('ease-linear');
    expect(classesOf(description)).toContain('pt-5');
    expect(classesOf(description)).toContain('translate-y-0');
  });

  it('honours prefers-reduced-motion on every node it animates', () => {
    const { container } = renderBand();

    const animated = Array.from(
      container.querySelectorAll('[class*="transition-"]')
    );

    expect(animated.length).toBeGreaterThan(ROWS);
    expect(
      animated.filter((node) => node.getAttribute('data-s12-motion') === null)
    ).toEqual([]);

    const css = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      // styled-jsx minifies in this transform, so compare without whitespace.
      .join('\n')
      .replace(/\s+/g, '');

    expect(css).toContain(
      '@media(prefers-reduced-motion:reduce){[data-s12-motion]{transition:none!important}}'
    );
  });

  it('claims no tab semantics', () => {
    const { container, buttons } = renderBand();

    // The rows are disclosure buttons for their own description, so a tablist
    // role would promise arrow-key/roving-tabindex behaviour this band does not
    // implement. The state is carried by `aria-expanded`, as before the change.
    expect(
      container.querySelectorAll('[role="tab"], [role="tablist"]')
    ).toHaveLength(0);
    expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(0);

    for (const button of buttons) {
      expect(button.getAttribute('type')).toBe('button');
      expect(button).toHaveAttribute('aria-expanded');
    }
  });
});
