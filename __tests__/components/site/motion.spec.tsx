/**
 * @jest-environment jsdom
 *
 * Contract for the shared motion primitive (`components/site/motion`).
 *
 * The primitive is the one place the nine bands get their entrance reveal, their
 * hover timings and their reduced-motion handling from, so this spec pins the five
 * things a band lane could otherwise break silently:
 *
 * 1. **The no-JS / hydration state.** The element starts — and stays, without JS —
 *    in the visible `idle` state. The server render and the first client render
 *    must agree, because that is the classic failure mode of a reveal component.
 * 2. **The mechanism.** IntersectionObserver, `{rootMargin: '0px', threshold: 0}`,
 *    fire once, unobserve — the reference's own trigger, not a scroll listener.
 * 3. **The measured values**, tied to the exported constants so the CSS and
 *    `values.ts` cannot drift apart.
 * 4. **Reduced motion is on by default**, both through the media query and through
 *    the hook refusing to arm.
 * 5. **The reveal does not own the element's `transition`.** The entrance runs on
 *    keyframes; a `transition` shorthand keyed on `[data-motion='revealed']`
 *    (specificity 0,2,0) would beat every Tailwind `transition-*` utility (0,1,0)
 *    and silently kill the hover transition of any element that is both a reveal
 *    target and a hover node — which is exactly what was measured on the two
 *    WorkCounters CTAs before this contract existed.
 *
 * jsdom has no layout (every `getBoundingClientRect()` is 0x0) and no
 * IntersectionObserver, which is why the box is mocked and the observer stubbed
 * here — the primitive treats both absences as "cannot animate, stay visible",
 * and that behaviour is asserted on its own below.
 */
import { TextEncoder } from 'util';

import { act, render } from '@testing-library/react';
import '@testing-library/jest-dom';

// jsdom resolves `react-dom/server` to its browser build, which reads TextEncoder
// from the global scope; jest's jsdom environment does not provide it.
if (typeof globalThis.TextEncoder === 'undefined') {
  Object.assign(globalThis, { TextEncoder });
}

import {
  DIRECTIONAL_DURATION_MS,
  DIRECTIONAL_EASING,
  DIRECTIONAL_TRAVEL,
  HOVER_TRANSITION,
  LETTER_FLIP_EASING,
  LETTER_FLIP_OPACITY_MS,
  LETTER_FLIP_STAGGER_MS,
  LETTER_FLIP_THRESHOLD,
  LETTER_FLIP_TRANSFORM_MS,
  MotionStyles,
  REVEAL_DELAY_MS,
  REVEAL_DURATION_MS,
  REVEAL_EASING,
  REVEAL_THRESHOLD,
  REVEAL_TRAVEL,
  Reveal,
  useReveal,
  type RevealEffect,
} from '@/components/site/motion';

const BOX = {
  top: 0,
  left: 0,
  right: 600,
  bottom: 200,
  width: 600,
  height: 200,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

const withLayout = (box: DOMRect = BOX) =>
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(box);

interface FakeObserver {
  rootMargin: string;
  thresholds: number[];
  observe: jest.Mock;
  unobserve: jest.Mock;
  disconnect: jest.Mock;
  trigger: (isIntersecting?: boolean) => void;
}

/** Every stub observer created since the last `installObserver()`, in creation order. */
let observers: FakeObserver[] = [];

const installObserver = () => {
  observers = [];

  const stub = class {
    rootMargin: string;
    thresholds: number[];
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();

    constructor(
      private callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit
    ) {
      this.rootMargin = options?.rootMargin ?? '0px';
      this.thresholds =
        typeof options?.threshold === 'number' ? [options.threshold] : [];
      observers.push(this as unknown as FakeObserver);
    }

    trigger(isIntersecting = true) {
      this.callback(
        [{ isIntersecting } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
    }
  };

  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    stub;
};

const requestReducedMotion = (reduce: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
};

/** The reconstructed CSS of every style tag in the document. */
const renderedCss = (): string =>
  Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n');

/**
 * The block is minified on the way into the document: attribute values come out
 * double-quoted, the space after every comma is gone, leading zeros are dropped and
 * transform function names are lower-cased. Both the rendered CSS and the expectations
 * below are folded through this, so the assertions can be written as normal CSS.
 */
const css = (value: string): string =>
  value
    .replace(/\s+/g, '')
    .replace(/"/g, "'")
    .replace(
      /(^|[^\d.])(\.\d)/g,
      (_match, before, number) => `${before}0${number}`
    )
    .toLowerCase();

const revealNode = (container: HTMLElement): HTMLElement =>
  container.firstElementChild as HTMLElement;

/** A heading that uses the primitive the way a band lane would. */
function SplitHeading({
  effect = 'slideUp',
  letters = true,
}: {
  effect?: RevealEffect;
  letters?: boolean;
}) {
  const reveal = useReveal<HTMLHeadingElement>({ effect, letters });

  return (
    <h2 {...reveal.motionProps}>
      {['B', 'i'].map((character, index) => (
        <span key={character} {...reveal.letterProps(index)}>
          {character}
        </span>
      ))}
    </h2>
  );
}

afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver;
  delete (window as { matchMedia?: unknown }).matchMedia;
  jest.restoreAllMocks();
});

describe('the no-JS and hydration state', () => {
  it('renders the element in place, visible and unarmed, with no wrapper', () => {
    const { container } = render(
      <Reveal as="h2" effect="fadeInStart" className="heading">
        {'Visible copy'}
      </Reveal>
    );

    const node = revealNode(container);

    expect(node.tagName).toBe('H2');
    expect(node.getAttribute('class')).toBe('heading');
    expect(node.textContent).toContain('Visible copy');
    // jsdom has no IntersectionObserver at all here, so this is also the
    // "JavaScript never ran" case: nothing may arm, and nothing may hide.
    expect(node.getAttribute('data-motion')).toBe('idle');
    expect(node.getAttribute('data-motion-effect')).toBe('fadeInStart');
    expect(node.getAttribute('data-motion-delay')).toBe('0');
    expect(node.getAttribute('data-motion-letters')).toBeNull();
    expect(container.querySelector('div')).toBeNull();
  });

  it('renders the identical visible state on the server', async () => {
    // Loaded here, not at the top of the file: the browser build reads
    // `TextEncoder` from the global scope at module load, and jsdom does not
    // provide one until the line above has run.
    const { renderToString } = await import('react-dom/server');

    const html = renderToString(
      <Reveal as="p" effect="slideUp">
        {'Server copy'}
      </Reveal>
    );

    // The server never emits `armed`: no rule that hides or offsets content can
    // match before hydration, so there is nothing for the client to mismatch.
    expect(html).toContain('data-motion="idle"');
    expect(html).toContain('data-motion-effect="slideUp"');
    expect(html).toContain('Server copy');
    expect(html).not.toContain('armed');
  });

  it('stays visible when the environment cannot observe intersections', () => {
    withLayout();

    const { container } = render(<Reveal effect="slideUp">{'Copy'}</Reveal>);

    expect(revealNode(container).getAttribute('data-motion')).toBe('idle');
    expect(observers).toHaveLength(0);
  });

  it('stays visible for a zero-area element', () => {
    installObserver();
    withLayout({ ...BOX, width: 0, height: 0 } as DOMRect);

    const { container } = render(<Reveal effect="slideUp">{'Copy'}</Reveal>);

    expect(revealNode(container).getAttribute('data-motion')).toBe('idle');
    expect(observers).toHaveLength(0);
  });
});

describe('the reveal mechanism', () => {
  it('arms on mount and reveals on the first intersection, then unobserves', () => {
    installObserver();
    withLayout();

    const { container } = render(<Reveal effect="slideUp">{'Copy'}</Reveal>);
    const node = revealNode(container);

    expect(node.getAttribute('data-motion')).toBe('armed');
    expect(observers).toHaveLength(1);
    expect(observers[0].rootMargin).toBe('0px');
    expect(observers[0].thresholds).toEqual([REVEAL_THRESHOLD]);
    expect(observers[0].observe).toHaveBeenCalledWith(node);

    act(() => observers[0].trigger());

    expect(node.getAttribute('data-motion')).toBe('revealed');
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);

    // One-shot, like the reference: a second intersection changes nothing and no
    // second observer was ever created.
    act(() => observers[0].trigger());
    expect(node.getAttribute('data-motion')).toBe('revealed');
    expect(observers).toHaveLength(1);
  });

  it('leaves an element alone until it actually intersects', () => {
    installObserver();
    withLayout();

    const { container } = render(<Reveal effect="slideUp">{'Copy'}</Reveal>);

    act(() => observers[0].trigger(false));

    expect(revealNode(container).getAttribute('data-motion')).toBe('armed');
    expect(observers[0].disconnect).not.toHaveBeenCalled();
  });

  it('carries the measured delay on the element instead of an inline style', () => {
    installObserver();
    withLayout();

    const { container } = render(
      <Reveal effect="fadeIn" delayMs={REVEAL_DELAY_MS.heroEmailForm}>
        {'Copy'}
      </Reveal>
    );

    const node = revealNode(container);

    expect(node.getAttribute('data-motion-delay')).toBe('150');
    expect(node.getAttribute('style')).toBeNull();
  });
});

describe('the split-heading flip', () => {
  it('gives every letter its own stagger delay', () => {
    installObserver();
    withLayout();

    const { container } = render(<SplitHeading />);
    const letters = Array.from(container.querySelectorAll('span'));

    expect(letters).toHaveLength(2);

    letters.forEach((letter, index) => {
      expect(letter.getAttribute('data-motion-part')).toBe('letter');
      expect(letter.getAttribute('style')).toContain(
        `--motion-letter-delay: ${index * LETTER_FLIP_STAGGER_MS}ms`
      );
    });
  });

  it('observes the heading twice: at the fold, and again when it is fully visible', () => {
    installObserver();
    withLayout();

    const { container } = render(<SplitHeading letters />);
    const node = revealNode(container);

    expect(observers).toHaveLength(2);
    expect(observers[0].thresholds).toEqual([REVEAL_THRESHOLD]);
    expect(observers[1].thresholds).toEqual([LETTER_FLIP_THRESHOLD]);
    expect(node.getAttribute('data-motion-letters')).toBe('armed');

    // The two systems are independent, as in the reference: the letters can flip
    // while the heading's own entrance animation has not finished.
    act(() => observers[1].trigger());

    expect(node.getAttribute('data-motion-letters')).toBe('revealed');
    expect(node.getAttribute('data-motion')).toBe('armed');
  });

  it('never arms letters behind a threshold the element cannot reach', () => {
    installObserver();
    // Taller than jsdom's 768px viewport, so a ratio of 1 is unreachable. The
    // reference would leave these letters at opacity 0 forever.
    withLayout({ ...BOX, height: 2000, bottom: 2000 } as DOMRect);

    render(<SplitHeading letters />);

    expect(observers[1].thresholds[0]).toBeGreaterThan(0);
    expect(observers[1].thresholds[0]).toBeLessThan(LETTER_FLIP_THRESHOLD);
  });

  it('does not observe letters unless the caller asks for them', () => {
    installObserver();
    withLayout();

    const { container } = render(<SplitHeading letters={false} />);

    expect(observers).toHaveLength(1);
    expect(
      revealNode(container).getAttribute('data-motion-letters')
    ).toBeNull();
  });
});

describe('prefers-reduced-motion', () => {
  it('never arms anything when the visitor asked for reduced motion', () => {
    installObserver();
    withLayout();
    requestReducedMotion(true);

    const { container } = render(
      <Reveal effect="fadeInStart">{'Copy'}</Reveal>
    );

    expect(revealNode(container).getAttribute('data-motion')).toBe('idle');
    expect(observers).toHaveLength(0);
  });

  it('shows the final state immediately and forces the armed state visible', () => {
    render(<MotionStyles />);
    const block = css(renderedCss());

    expect(block).toContain(
      css(
        // The house convention for a motion node: no keyframes, no transition.
        '@media (prefers-reduced-motion: reduce) { [data-motion] { animation: none !important; transition: none !important }'
      )
    );
    expect(block).toContain(
      css(
        "[data-motion='armed'] { opacity: 1 !important; transform: none !important; visibility: visible !important }"
      )
    );
    expect(block).toContain(
      css(
        "[data-motion-letters='armed'] [data-motion-part='letter'] { filter: none !important; opacity: 1 !important; transform: none !important }"
      )
    );
  });
});

describe('the measured reference values', () => {
  it('reproduces the probe’s start states, durations and easings', () => {
    render(<MotionStyles />);
    const block = css(renderedCss());

    // slideInUp / slideInLeft / slideInRight: 20% of the element's own box, 750ms ease.
    expect(block).toContain(css(`translate3d(0, ${REVEAL_TRAVEL}, 0)`));
    // The two directional pairs park at the measured ∓20% / ∓100px. One declaration per
    // effect is the only place those numbers live; the Arabic mirror is asserted below.
    for (const travel of [`-${REVEAL_TRAVEL}`, REVEAL_TRAVEL]) {
      expect(block).toContain(css(`--motion-from-x: ${travel}`));
    }
    for (const travel of [`-${DIRECTIONAL_TRAVEL}`, DIRECTIONAL_TRAVEL]) {
      expect(block).toContain(css(`--motion-from-x: ${travel}`));
    }

    // The reveal is a keyframe animation, not a transition: that is what keeps the
    // element's own `transition` (its hover timings) untouched.
    for (const name of [
      'motion-fade-in',
      'motion-slide-up',
      'motion-slide-in',
    ]) {
      expect(block).toContain(
        css(
          `animation: ${name} ${REVEAL_DURATION_MS}ms ${REVEAL_EASING} var(--motion-delay, 0ms) backwards`
        )
      );
      expect(block).toContain(css(`@keyframes ${name} {`));
    }

    // fadeIn: opacity only, 750ms ease.
    expect(block).toContain(
      css(
        '@keyframes motion-fade-in { from { opacity: 0; visibility: hidden } }'
      )
    );

    // adFadeInLeft / adFadeInRight — the theme override: ∓100px, 380ms, and the
    // curve a naive port gets wrong.
    for (const travel of [`-${DIRECTIONAL_TRAVEL}`, DIRECTIONAL_TRAVEL]) {
      expect(block).toContain(css(`--motion-from-x: ${travel}`));
    }
    expect(block).toContain(
      css(
        `animation: motion-fade-in-x ${DIRECTIONAL_DURATION_MS}ms ${DIRECTIONAL_EASING} var(--motion-delay, 0ms) backwards`
      )
    );

    // The flip: the 70deg start, both states' drop shadows, its own curves.
    expect(block).toContain(css('perspective(800px) rotateX(70deg)'));
    expect(block).toContain(css('drop-shadow(0 15px 10px rgba(0, 0, 0, 0.2))'));
    expect(block).toContain(css('drop-shadow(0 4px 4px rgba(0, 0, 0, 0.12))'));
    expect(block).toContain(
      css(`transform ${LETTER_FLIP_TRANSFORM_MS}ms ${LETTER_FLIP_EASING}`)
    );
    expect(block).toContain(css(`opacity ${LETTER_FLIP_OPACITY_MS}ms ease`));
  });

  it('gives the reveal keyframes the armed state as their start, from one source', () => {
    render(<MotionStyles />);
    const block = css(renderedCss());

    // Each directional effect declares its start travel exactly once, and both the
    // armed state and the keyframes read that variable — so the element cannot be
    // parked at one offset and animate from another.
    const ARMED_FROM = {
      slideInStart: `[data-motion='armed'][data-motion-effect='slideInStart'] { transform: translate3d(var(--motion-from-x), 0, 0) }`,
      slideInEnd: `[data-motion='armed'][data-motion-effect='slideInEnd'] { transform: translate3d(var(--motion-from-x), 0, 0) }`,
      fadeInStart: `[data-motion='armed'][data-motion-effect='fadeInStart'] { opacity: 0; transform: translate3d(var(--motion-from-x), 0, 0) }`,
      fadeInEnd: `[data-motion='armed'][data-motion-effect='fadeInEnd'] { opacity: 0; transform: translate3d(var(--motion-from-x), 0, 0) }`,
    } as const;

    for (const rule of Object.values(ARMED_FROM)) {
      expect(block).toContain(css(rule));
    }

    // The two shared keyframes take their x offset from the same variable.
    expect(block).toContain(css('translate3d(var(--motion-from-x), 0, 0)'));
    expect(block).toContain(
      css(
        '@keyframes motion-slide-in { from { transform: translate3d(var(--motion-from-x), 0, 0); visibility: hidden } }'
      )
    );
    expect(block).toContain(
      css(
        '@keyframes motion-fade-in-x { from { opacity: 0; transform: translate3d(var(--motion-from-x), 0, 0); visibility: hidden } }'
      )
    );

    // vertical travel is the measured 20% of the element's own box.
    expect(block).toContain(
      css(
        `@keyframes motion-slide-up { from { transform: translate3d(0, ${REVEAL_TRAVEL}, 0); visibility: hidden } }`
      )
    );
  });

  it('never declares a transition on the element it reveals', () => {
    render(<MotionStyles />);
    const block = css(renderedCss());

    // The P1 defect this contract exists for: a `transition` shorthand on the reveal
    // rule owns transition-property/-duration/-timing-function, outranks every
    // Tailwind `transition-*` utility, and lands every hover on such an element
    // instantly. The revealed state must therefore declare `animation` and no
    // transition of its own, and the armed state must declare none either.
    const revealedRules =
      renderedCss().match(
        /\[data-motion=["']revealed["']\][^{}]*\{[^{}]*\}/g
      ) ?? [];

    expect(revealedRules).toHaveLength(6);

    for (const rule of revealedRules) {
      expect(rule).toContain('animation');
      expect(rule).not.toContain('transition');
    }

    const armedRules =
      renderedCss().match(/\[data-motion=["']armed["']\][^{}]*\{[^{}]*\}/g) ??
      [];

    expect(armedRules.length).toBeGreaterThan(0);
    for (const rule of armedRules) expect(rule).not.toContain('transition');

    // The one place a transition is mentioned on a motion node is the reduced-motion
    // block, and it is a `none`, not an owned shorthand.
    expect(block).toContain(css('transition: none !important'));
  });

  it('enumerates only the three delays the reference page uses', () => {
    render(<MotionStyles />);
    const block = css(renderedCss());

    for (const delay of [
      REVEAL_DELAY_MS.heroEmailForm,
      REVEAL_DELAY_MS.heroFloatStart,
      REVEAL_DELAY_MS.heroFloatEnd,
    ]) {
      expect(block).toContain(
        css(`[data-motion-delay='${delay}'] { --motion-delay: ${delay}ms }`)
      );
    }

    expect(block).toContain(css('var(--motion-delay, 0ms)'));
    expect(block).not.toContain(css("[data-motion-delay='100']"));
  });

  it('mirrors the reference’s physical x offsets for the Arabic locale', () => {
    render(<MotionStyles />);
    const block = css(renderedCss());

    // The mirror is one declaration per effected pair: the start travel the armed
    // state parks the element at, and the keyframes then animate away from.
    for (const [effect, ltr, rtl] of [
      ['slideInStart', `-${REVEAL_TRAVEL}`, `${REVEAL_TRAVEL}`],
      ['slideInEnd', `${REVEAL_TRAVEL}`, `-${REVEAL_TRAVEL}`],
      ['fadeInStart', `-${DIRECTIONAL_TRAVEL}`, `${DIRECTIONAL_TRAVEL}`],
      ['fadeInEnd', `${DIRECTIONAL_TRAVEL}`, `-${DIRECTIONAL_TRAVEL}`],
    ]) {
      expect(block).toContain(
        css(`[data-motion-effect='${effect}'] { --motion-from-x: ${ltr} }`)
      );
      expect(block).toContain(
        css(
          `[dir='rtl'] [data-motion-effect='${effect}'] { --motion-from-x: ${rtl} }`
        )
      );
    }

    // The letters keep their own mirrored 20px shove; the flip is still a transition
    // because a letter span is not — and cannot be made — a hover node.
    expect(block).toContain(
      css(
        "[dir='rtl'] [data-motion-letters='armed'] [data-motion-part='letter'] { transform: perspective(800px) rotateX(70deg) translateZ(10px) translateX(-20px) }"
      )
    );

    // The mirror only ever rewrites a start transform or its one variable: no physical
    // layout property enters this block, so no measured box can move.
    expect(block).not.toContain(css('margin-left'));
    expect(block).not.toContain(css('left:'));
  });

  it('keeps the hover convention on the reference’s timings and reduced-motion safe', () => {
    expect(HOVER_TRANSITION.base).toContain('duration-300 ease-linear');
    expect(HOVER_TRANSITION.button).toContain('duration-[350ms] ease-in-out');
    expect(HOVER_TRANSITION.card).toContain(
      'duration-[375ms] ease-[cubic-bezier(0.7,0,0.3,1)]'
    );
    expect(HOVER_TRANSITION.dropdown).toContain(
      'duration-[250ms] ease-[cubic-bezier(0.25,0.1,0.11,0.99)]'
    );
    expect(HOVER_TRANSITION.image).toContain('duration-200 ease-in-out');
    expect(HOVER_TRANSITION.delayed).toContain('delay-[150ms]');

    for (const value of Object.values(HOVER_TRANSITION)) {
      // A hover string has no attribute for the shared block to key on, so it has
      // to carry its own reduced-motion guard.
      expect(value).toContain('motion-reduce:transition-none');
    }
  });
});
