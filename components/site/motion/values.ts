/**
 * The reference home page's measured motion values, named once.
 *
 * Every number below is quoted from the two read-only measurement passes over
 * `https://wdtsassy.wpengine.com/` that are on disk at
 * `/var/tmp/pi-scratch/wdtsassy-clone` (`entrance/` = the entrance-animation probe,
 * `hover/` = the hover catalogue). The `§` references in the comments are that
 * document's own section numbers, so any value can be traced back to a raw
 * `getComputedStyle` / `getAnimations()` / `getKeyframes()` reading of the live page.
 *
 * Two of the effect names deliberately differ from the reference: the
 * direction-dependent ones are named for the **inline** axis (`slideInStart` /
 * `slideInEnd`, `fadeInStart` / `fadeInEnd`) because their x offsets are mirrored
 * under `[dir='rtl']`, which would make the reference's physical
 * `slideInLeft` / `slideInRight` names a lie in the Arabic locale.
 */

/**
 * Entrance trigger (reference §1A): the reference observes every reveal element with
 * `new IntersectionObserver(cb, { root: null, rootMargin: '0px', threshold: [0] })`
 * and unobserves it the moment it fires, so the animation starts as soon as one pixel
 * of the element crosses the viewport's bottom edge and never replays.
 */
export const REVEAL_THRESHOLD = 0;

/**
 * Split-heading trigger (reference §1E): the theme's own in-view system is a *second*
 * observer with `threshold: 1`, i.e. the heading has to be **fully** visible. A heading
 * taller than the viewport can never reach `1`, so `useReveal` caps this at the best
 * ratio the viewport allows before it arms — the reference leaves such a heading's
 * letters at `opacity: 0` forever (probe §8, open question 2).
 */
export const LETTER_FLIP_THRESHOLD = 1;

/**
 * Duration of the Elementor effects the reference classes actually run at (probe §2):
 * `.animated.animated-fast { animation-duration: .75s }` beats both Elementor's 1s
 * default and the theme's 380ms override for every `slideIn*` class.
 */
export const REVEAL_DURATION_MS = 750;

/** `ease` = `cubic-bezier(0.25, 0.1, 0.25, 1)`; printed as `ease` by the reference. */
export const REVEAL_EASING = 'ease';

/**
 * `slideInUp` / `slideInLeft` / `slideInRight` travel (**20 %**, probe §1C). The
 * percentage resolves against the element's *own* box, which is why the reference's
 * travel differs from band to band (hero H2 43px of 215.2px tall, footer 161.4px of
 * 807px tall). `animations.min.css` re-declares these keyframes after Elementor's, so
 * the `20%` definition is the one that lands.
 */
export const REVEAL_TRAVEL = '20%';

/**
 * The theme override (probe §1B, `themes/sassy/assets/css/base.css`) that replaces
 * `fadeInLeft` / `fadeInRight` with `adFadeInLeft` / `adFadeInRight`: **380ms** on
 * `cubic-bezier(0.7, 0, 0.3, 1)`, from **∓100px** (not Elementor's `translate3d(±100%,0,0)`).
 * These are the two effects the Platform Capabilities heading row uses, and the single
 * most mis-reproducible pair on the page. The reference also sets
 * `transform-origin: top left|right`; that is inert for a pure translate and is
 * therefore not carried over here.
 */
export const DIRECTIONAL_DURATION_MS = 380;
export const DIRECTIONAL_EASING = 'cubic-bezier(0.7, 0, 0.3, 1)';
export const DIRECTIONAL_TRAVEL = '100px';

/**
 * The only three `_animation_delay` values on the whole reference page (probe §2); every
 * other entrance-animated element has delay 0. There is **no artificial stagger** — the
 * apparent cascade is positional, purely the order in which elements cross the fold.
 *
 * The delays are enumerated rather than free-form: the reveal CSS keys them off a
 * `data-motion-delay` attribute, so a value outside this table would silently degrade to
 * no delay. `heroFloatStart` / `heroFloatEnd` are the reference's physical left / right
 * floating dashboards, which our hero places on the inline start / end edge.
 */
export const REVEAL_DELAY_MS = {
  none: 0,
  heroEmailForm: 150,
  heroFloatStart: 200,
  heroFloatEnd: 400,
} as const;

export type RevealDelayMs =
  (typeof REVEAL_DELAY_MS)[keyof typeof REVEAL_DELAY_MS];

/**
 * Per-letter stagger of the split-heading flip (probe §1E):
 * `transition-delay: calc(0.035s * var(--char-index))`. A 37-character heading therefore
 * finishes at ~1.66s; `transition-delay` for letter *n* is `n * 35ms`.
 */
export const LETTER_FLIP_STAGGER_MS = 35;

/** The flip's own transition list: transform `.4s`, opacity `.2s`, filter `.4s`. */
export const LETTER_FLIP_TRANSFORM_MS = 400;
export const LETTER_FLIP_OPACITY_MS = 200;
export const LETTER_FLIP_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

/** The theme's `wdt-item-is-inview` class is never removed, so the flip is one-shot too. */
export const LETTER_FLIP_REPLAYS = false;

/**
 * Hover transitions, from the reference's own stylesheets (probe §1, "timing vocabulary").
 * These are Tailwind class strings, so they must be written as complete literals for the
 * scanner to see them; the `motion-reduce:transition-none` variant at the end of each one
 * is what makes a hover that uses this convention honour `prefers-reduced-motion` without
 * needing an attribute or a `<style>` block.
 */
export const HOVER_TRANSITION = {
  /**
   * `all 0.3s linear` — the reference's `--wdtBaseTransition` and by far the most common
   * value: nav/footer link colour, dropdown item colour and its clip-path wipe, input
   * border colour, testimonial pill colour, card box-shadow, counter shadow.
   */
  base: 'transition-all duration-300 ease-linear motion-reduce:transition-none',
  /**
   * `all 0.35s ease-in-out` — `.wdt-button`: the 450%-wide gradient swings to
   * `background-position: 100% center` and the fill goes black (`::hover`), and the
   * same curve drives the footer store badges' `scale(1.025)` + glow and the hero
   * Subscribe button.
   */
  button:
    'transition-all duration-[350ms] ease-in-out motion-reduce:transition-none',
  /**
   * `0.375s cubic-bezier(0.7, 0, 0.3, 1)` — the Platform Capabilities card, the one
   * element on the page that uses this curve: `box-shadow` fading in and the `::before`
   * plate going white at `scale(1.01)`.
   */
  card: 'transition-all duration-[375ms] ease-[cubic-bezier(0.7,0,0.3,1)] motion-reduce:transition-none',
  /**
   * `margin-top 0.25s cubic-bezier(0.25, 0.1, 0.11, 0.99)` — the navbar dropdown opening
   * (its `opacity` is a separate `0.2s` leg, on the same curve, delayed `0.1s`).
   */
  dropdown:
    'transition-all duration-[250ms] ease-[cubic-bezier(0.25,0.1,0.11,0.99)] motion-reduce:transition-none',
  /**
   * `all 0.2s ease-in-out` — the Tools card's icon image scaling to `scale(1.07)`.
   */
  image:
    'transition-transform duration-200 ease-in-out motion-reduce:transition-none',
  /**
   * `all 0.35s ease-in-out` with the reference's extra `0.15s` delay — the *outgoing*
   * interactive-showcase panel (`NetworkShowcase`) and the testimonial avatar's drawn
   * ring both leave on this one.
   */
  delayed:
    'transition-all duration-[350ms] delay-[150ms] ease-in-out motion-reduce:transition-none',
} as const;
