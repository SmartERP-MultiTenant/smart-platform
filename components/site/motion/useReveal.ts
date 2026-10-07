import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';

import {
  LETTER_FLIP_STAGGER_MS,
  LETTER_FLIP_THRESHOLD,
  REVEAL_DELAY_MS,
  REVEAL_THRESHOLD,
  type RevealDelayMs,
} from './values';

/**
 * The reference effect classes, renamed for the inline axis. The mapping to the
 * reference's own names is in `MotionStyles.tsx`; `fadeInStart` / `fadeInEnd` are the
 * theme's 380ms override of `fadeInLeft` / `fadeInRight`.
 */
export type RevealEffect =
  | 'fadeIn'
  | 'slideUp'
  | 'slideInStart'
  | 'slideInEnd'
  | 'fadeInStart'
  | 'fadeInEnd';

/**
 * `idle` is what the server and the first client render both emit, and no CSS rule
 * matches it, so the element is fully visible until JS arms it. `armed` hides it in
 * place (`visibility: hidden`, so its box and its layout slot survive) and `revealed`
 * starts the entrance keyframes — the armed rule stops matching and the animation runs
 * from the element's own start values back to its natural geometry.
 */
export type MotionState = 'idle' | 'armed' | 'revealed';

export interface UseRevealOptions {
  /** The reference effect to reproduce. Defaults to `slideUp`, the commonest one. */
  effect?: RevealEffect;
  /**
   * The reference's `_animation_delay`. Only the three measured values are accepted; a
   * value outside the table silently degrades to no delay (see `REVEAL_DELAY_MS`).
   */
  delayMs?: RevealDelayMs;
  /**
   * Also drive the split-heading flip (the reference's second reveal system) from this
   * element: its letters animate when the heading is *fully* visible rather than when it
   * crosses the fold. Requires the caller to spread `letterProps` on the letter spans —
   * see the usage example in `index.ts`.
   */
  letters?: boolean;
}

/** Props to spread on the element that reveals. No wrapper element is ever needed. */
export interface MotionProps<T extends HTMLElement> {
  ref: RefObject<T>;
  'data-motion': MotionState;
  'data-motion-effect': RevealEffect;
  'data-motion-delay': RevealDelayMs;
  'data-motion-letters'?: MotionState;
}

/** Props for one `<span>` around one character of a split heading. */
export interface LetterProps {
  'data-motion-part': 'letter';
  style: CSSProperties;
}

export interface RevealMotion<T extends HTMLElement> {
  /** Spread on the revealing element itself (`<h2 {...reveal.motionProps}>`). */
  motionProps: MotionProps<T>;
  /**
   * Props for letter `index` of a split heading. The per-letter delay is the reference's
   * `0.035s * var(--char-index)` stagger, computed here as `index * 35ms`.
   */
  letterProps: (index: number) => LetterProps;
}

/**
 * False when the environment cannot observe intersections (jsdom, an old browser) or when
 * the visitor asked for reduced motion. In both cases nothing is armed, so the element
 * keeps the visible `idle` state: the motion is skipped, never the content.
 */
function canAnimate(): boolean {
  if (typeof IntersectionObserver === 'undefined') return false;
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia !== 'function') return true;

  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A zero-area element cannot be revealed by an observer that reports intersection, and
 * hiding it would be pointless — so it is never armed. Same guard for both systems.
 */
function hasBox(element: HTMLElement): boolean {
  const { width, height } = element.getBoundingClientRect();

  return width > 0 && height > 0;
}

/**
 * The reference's threshold, capped at the best ratio the viewport can deliver. Only the
 * flip's `threshold: 1` can be unreachable — a heading taller than the viewport can never
 * be 100% visible, and the reference then leaves its letters at `opacity: 0` forever.
 */
function reachableThreshold(element: HTMLElement, ratio: number): number {
  const height = element.getBoundingClientRect().height;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;

  if (height <= viewportHeight) return ratio;

  return Math.max(0.01, viewportHeight / height - 0.01);
}

/** Observe once, at `threshold`, and unobserve on the first intersection (probe §1A/§4). */
function observeOnce(
  element: HTMLElement,
  threshold: number,
  onEnter: () => void
): IntersectionObserver {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;

      onEnter();
      observer.disconnect();
    },
    { root: null, rootMargin: '0px', threshold }
  );

  observer.observe(element);

  return observer;
}

/**
 * Entrance reveal for one element, reproducing the reference's mechanism (probe §9):
 * IntersectionObserver, `{root: null, rootMargin: '0px', threshold: 0}`, fire once, then
 * unobserve. No ScrollTrigger, no GSAP, no animation library — the timings and the start
 * transforms live in the shared `MotionStyles` block.
 *
 * ## No hydration mismatch
 *
 * The state starts at the constant `'idle'` and is never derived from the environment, so
 * the server render and the first client render emit byte-identical attributes
 * (`data-motion="idle"`, which matches no CSS rule). Arming happens in `useEffect`, which
 * never runs on the server; nothing in the render path reads `window`, `document` or
 * `matchMedia`. That is also what keeps the page readable without JS: the hidden state
 * only ever exists after an effect has written it.
 *
 * The hook is the whole animation contract — the caller keeps its own element, its own
 * classes and its own geometry, and only spreads the returned props.
 */
export function useReveal<T extends HTMLElement>(
  options: UseRevealOptions = {}
): RevealMotion<T> {
  const {
    effect = 'slideUp',
    delayMs = REVEAL_DELAY_MS.none,
    letters = false,
  } = options;

  const ref = useRef<T>(null);
  const [state, setState] = useState<MotionState>('idle');
  const [letterState, setLetterState] = useState<MotionState>('idle');

  useEffect(() => {
    const element = ref.current;

    if (element === null || !canAnimate() || !hasBox(element)) return;

    setState('armed');

    const observer = observeOnce(element, REVEAL_THRESHOLD, () =>
      setState('revealed')
    );

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!letters) return;

    const element = ref.current;

    if (element === null || !canAnimate() || !hasBox(element)) return;

    setLetterState('armed');

    const observer = observeOnce(
      element,
      reachableThreshold(element, LETTER_FLIP_THRESHOLD),
      () => setLetterState('revealed')
    );

    return () => {
      observer.disconnect();
    };
  }, [letters]);

  return {
    motionProps: {
      ref,
      'data-motion': state,
      'data-motion-effect': effect,
      'data-motion-delay': delayMs,
      ...(letters && { 'data-motion-letters': letterState }),
    },
    letterProps: (index: number) => ({
      'data-motion-part': 'letter',
      style: {
        '--motion-letter-delay': `${index * LETTER_FLIP_STAGGER_MS}ms`,
      } as CSSProperties,
    }),
  };
}
