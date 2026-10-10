/**
 * @jest-environment jsdom
 *
 * Contract for the shared marquee primitive (`components/site/motion/Marquee`).
 *
 * The primitive replaces the two rows that animated a physical `translateX` on a
 * `w-max` track — the bug that emptied the tools icon strip in RTL. Seamlessness is
 * arithmetic (`unit >= clip`), and jsdom has no layout, so this spec asserts the
 * structure that makes the arithmetic hold and the CSS that implements it. Every
 * assertion below fails if the mechanism is broken:
 *
 * 1. **Two identical units.** The track is exactly `2 x (items x repeat)` spans, the
 *    second half is a structural copy of the first, and the item order repeats — so
 *    the `50%` translate lands on a frame identical to `t = 0`.
 * 2. **The unit is `items x repeat`,** with `repeat` from the prop, not the old
 *    hard-coded three copies.
 * 3. **A uniform pitch.** Every span — including the last of each unit, which is what
 *    makes one unit exactly `2U/2` — carries the `gap` as a logical trailing margin.
 * 4. **Both directions, mirrored.** `-50%` in LTR, `+50%` under `[dir='rtl']`, as an
 *    `animation-name` override — no JS measurement, so the SSR output is already right.
 * 5. **The hover pause and the reduced-motion kill,** with the reduced-motion rule
 *    outranking the mirror (which is why the mirror rules carry no `!important`).
 * 6. **Assistive tech sees each item once:** the first copy is the real content and
 *    every cloned span (and a decorative row's whole subtree) is `aria-hidden`.
 */
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

import Marquee from '@/components/site/motion/Marquee';

const ITEMS = ['one', 'two', 'three'];

/** The reconstructed CSS of every style tag in the document. */
const renderedCss = (): string =>
  Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n');

/**
 * The block is minified on the way into the document: attribute values come out
 * double-quoted, whitespace is collapsed and declarations lose the space after the
 * colon. Both sides of an assertion are folded through this, so expectations can be
 * written as normal CSS.
 */
const css = (value: string): string =>
  value.replace(/\s+/g, '').replace(/"/g, "'").toLowerCase();

const spansOf = (container: HTMLElement): HTMLSpanElement[] =>
  Array.from(
    container.querySelectorAll<HTMLSpanElement>(
      '[data-ds-marquee-track] > span'
    )
  );

/** Class + inline style, i.e. everything that decides how a span is laid out. */
const shape = (span: HTMLSpanElement): string =>
  `${span.className}|${span.getAttribute('style') ?? ''}`;

describe('the marquee unit arithmetic', () => {
  it('renders exactly two identical units of `items x repeat`', () => {
    const { container } = render(
      <Marquee items={ITEMS} gap={30} duration={12} repeat={5} />
    );

    const spans = spansOf(container);

    // 3 items x 5 repeats x 2 units.
    expect(spans).toHaveLength(30);

    const half = spans.length / 2;
    expect(half).toBe(15);

    // The second unit is the first unit, structurally: same element shape, same
    // inline gap, same order. That identity is what makes `translate(-50%)` a
    // no-op frame at the loop's end.
    expect(spans.slice(0, half).map(shape)).toEqual(
      spans.slice(half).map(shape)
    );
    expect(spans.map((span) => span.textContent)).toEqual(
      Array.from({ length: 10 }, () => ITEMS).flat()
    );
  });

  it('takes the unit width from `repeat`, not from a hard-coded copy count', () => {
    const three = render(
      <Marquee items={ITEMS} gap={30} duration={12} repeat={3} />
    );

    expect(spansOf(three.container)).toHaveLength(18);

    three.unmount();

    const two = render(<Marquee items={ITEMS} gap={30} duration={12} />);

    // The default is 2: 3 items x 2 repeats x 2 units.
    expect(spansOf(two.container)).toHaveLength(12);
  });

  it('puts the same trailing gap on every span, including each unit’s last', () => {
    const { container } = render(
      <Marquee items={ITEMS} gap={30} duration={12} repeat={2} />
    );

    const gaps = spansOf(container).map((span) => span.style.marginInlineEnd);

    expect(gaps).toEqual(Array.from({ length: 12 }, () => '30px'));
  });

  it('renders nothing for an empty item list', () => {
    const { container } = render(<Marquee items={[]} gap={30} duration={12} />);

    expect(container.querySelector('[data-ds-marquee]')).toBeNull();
    expect(spansOf(container)).toHaveLength(0);
  });
});

describe('the marquee CSS', () => {
  it('emits the LTR loop for both directions', () => {
    render(<Marquee items={ITEMS} gap={30} duration={12} />);
    const block = css(renderedCss());

    expect(block).toContain(
      css(
        "[data-ds-marquee-track][data-ds-marquee-direction='left'] { animation-name: ds-marquee-left }"
      )
    );
    expect(block).toContain(
      css(
        "[data-ds-marquee-track][data-ds-marquee-direction='right'] { animation-name: ds-marquee-right }"
      )
    );

    // One unit is exactly half the track, so the travel is exactly 50%.
    expect(block).toContain(
      css(
        '@keyframes ds-marquee-left { from { transform: translateX(0) } to { transform: translateX(-50%) } }'
      )
    );
    expect(block).toContain(
      css(
        '@keyframes ds-marquee-right { from { transform: translateX(-50%) } to { transform: translateX(0) } }'
      )
    );

    // The loop runs forever, linearly.
    expect(block).toContain(css('animation-timing-function: linear'));
    expect(block).toContain(css('animation-iteration-count: infinite'));
  });

  it('mirrors the travel under [dir="rtl"] with an animation-name override', () => {
    render(<Marquee items={ITEMS} gap={30} duration={12} />);
    const block = css(renderedCss());

    expect(block).toContain(
      css(
        "[dir='rtl'] [data-ds-marquee-track][data-ds-marquee-direction='left'] { animation-name: ds-marquee-left-rtl }"
      )
    );
    expect(block).toContain(
      css(
        "[dir='rtl'] [data-ds-marquee-track][data-ds-marquee-direction='right'] { animation-name: ds-marquee-right-rtl }"
      )
    );

    // `+50%` in RTL: the strip's inline-start edge is its right edge, so a positive
    // translate is the only one that advances without exposing that edge.
    expect(block).toContain(
      css(
        '@keyframes ds-marquee-left-rtl { from { transform: translateX(0) } to { transform: translateX(50%) } }'
      )
    );
    expect(block).toContain(
      css(
        '@keyframes ds-marquee-right-rtl { from { transform: translateX(50%) } to { transform: translateX(0) } }'
      )
    );

    // The mirror is selected by a data attribute and nothing measures the DOM: no
    // physical `left`/`margin` property may enter the block, and the direction is
    // read from the document, not from a script.
    expect(block).not.toContain(css('margin-left'));
    expect(block).not.toContain(css('left:'));
  });

  it('pauses the track while the pointer is inside the row', () => {
    render(<Marquee items={ITEMS} gap={30} duration={12} />);
    const block = css(renderedCss());

    expect(block).toContain(
      css(
        '[data-ds-marquee]:hover [data-ds-marquee-track] { animation-play-state: paused }'
      )
    );
  });

  it('kills the animation for reduced motion, outranking the mirror', () => {
    render(<Marquee items={ITEMS} gap={30} duration={12} />);
    const block = css(renderedCss());

    expect(block).toContain(
      css(
        '@media (prefers-reduced-motion: reduce) { [data-ds-marquee-track] { animation: none !important } }'
      )
    );

    // The mirror rules must stay un-important: an important mirror would outrank the
    // important reduced-motion kill and leave the row animating for a visitor who
    // asked it not to. This is the only `!important` in the block.
    const important = renderCssRules().filter((rule) =>
      rule.includes('!important')
    );

    expect(important).toHaveLength(1);
    expect(css(important[0])).toContain(
      css('[data-ds-marquee-track] { animation: none !important }')
    );
  });
});

/** Every declaration block in the emitted CSS, for whole-block assertions. */
const renderCssRules = (): string[] =>
  renderedCss().match(/[^{}]+\{[^{}]*\}/g) ?? [];

describe('what assistive tech sees', () => {
  it('hides the cloned copies but leaves each real item exposed once', () => {
    const { container } = render(
      <Marquee items={ITEMS} gap={30} duration={12} repeat={3} />
    );

    const wrapper = container.querySelector('[data-ds-marquee]');
    const spans = spansOf(container);

    // The wrapper itself is not hidden: the caller's own items are real content.
    expect(wrapper).not.toHaveAttribute('aria-hidden');

    const exposed = spans.filter(
      (span) => span.getAttribute('aria-hidden') === null
    );

    expect(exposed).toHaveLength(ITEMS.length);
    expect(exposed.map((span) => span.textContent)).toEqual(ITEMS);

    // Everything after the caller's list is a visual clone.
    for (const span of spans.slice(ITEMS.length)) {
      expect(span).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('hides a decorative row whole', () => {
    const { container } = render(
      <Marquee items={ITEMS} gap={30} duration={12} decorative />
    );

    expect(container.querySelector('[data-ds-marquee]')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });
});

describe('the caller-facing knobs', () => {
  it('puts the duration on the track and the direction on the data attribute', () => {
    const { container } = render(
      <Marquee
        items={ITEMS}
        gap={30}
        duration={42}
        direction="right"
        className="clip"
      />
    );

    const wrapper = container.querySelector<HTMLElement>('[data-ds-marquee]');
    const track = container.querySelector<HTMLElement>(
      '[data-ds-marquee-track]'
    );

    expect(wrapper).toHaveClass('clip');
    // The track carries an inline duration only — an inline `animation` shorthand (or a
    // name) would be a declaration the direction CSS above could not override.
    expect(track?.style.animationDuration).toBe('42s');
    expect(track?.style.animationName).toBe('');
    expect(track).toHaveAttribute('data-ds-marquee-direction', 'right');
    expect(track).toHaveClass('flex', 'w-max');
  });
});
