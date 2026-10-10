/**
 * Shared motion primitive for the public marketing bands.
 *
 * Nine bands reproduce the same two behaviours off the same reference, so the mechanism,
 * the measured values and the reduced-motion contract live here once instead of nine
 * times. Nothing in this folder touches band geometry, band copy or the Services
 * showcase's hover system.
 *
 * ## Usage
 *
 * ```tsx
 * import {
 *   HOVER_TRANSITION,
 *   REVEAL_DELAY_MS,
 *   Reveal,
 *   useReveal,
 * } from '@/components/site/motion';
 *
 * // 1. Entrance reveal — the band's own element, in place, no wrapper.
 * <Reveal as="h2" effect="slideUp" className={H2_CLS}>
 *   {headingCopy}
 * </Reveal>
 *
 * // 2. The reference's only three delays (probe §2). Everything else is 0ms.
 * <Reveal as="form" effect="slideUp" delayMs={REVEAL_DELAY_MS.heroEmailForm}>
 *   …
 * </Reveal>
 *
 * // 3. A heading that also does the reference's per-letter flip — the *second* reveal
 * //    system, triggered when the heading is fully visible. Use the hook, because the
 * //    letter spans need props of their own.
 * const heading = useReveal<HTMLHeadingElement>({
 *   effect: 'fadeInStart',
 *   letters: true,
 * });
 *
 * <h2 {...heading.motionProps} className={H2_CLS}>
 *   {characters.map((character, index) => (
 *     <span key={index} {...heading.letterProps(index)}>
 *       {character}
 *     </span>
 *   ))}
 * </h2>
 *
 * // 4. Hover — the measured transition for the state, plus the properties the reference
 * //    actually changes between the two states.
 * <article
 *   className={`${CARD_CLS} ${HOVER_TRANSITION.card} hover:shadow-[0_0_20px_-10px_rgba(0,0,0,0.21)]`}
 * >
 * ```
 *
 * Three rules that the primitive cannot enforce for a caller:
 *
 * - **Reveal the band's own block, not its cards.** The reference animates whole rows and
 *   panels (`123adfa`, `5fc5290`, `824caca` …) and gives the cards inside them no
 *   animation at all.
 * - **`useReveal` callers render `<MotionStyles />` once.** `<Reveal>` does it for you;
 *   the hook cannot. A missing block degrades to "no animation", never to hidden content.
 * - **The letter flip is for a script that does not join.** Splitting Arabic into
 *   per-character `inline-block` spans breaks the script's letter joining, so a heading
 *   that flips is an English-copy decision; without `letters` the text is untouched.
 *
 * `motion.spec.tsx` pins the mechanism, the measured values, the reduced-motion contract
 * and the no-JS/hydration behaviour.
 */
export { default as MotionStyles } from './MotionStyles';
export { default as Reveal } from './Reveal';
export type { RevealProps, RevealTag } from './Reveal';
export { useReveal } from './useReveal';
export type {
  LetterProps,
  MotionProps,
  MotionState,
  RevealEffect,
  RevealMotion,
  UseRevealOptions,
} from './useReveal';
export {
  DIRECTIONAL_DURATION_MS,
  DIRECTIONAL_EASING,
  DIRECTIONAL_TRAVEL,
  HOVER_TRANSITION,
  LETTER_FLIP_EASING,
  LETTER_FLIP_OPACITY_MS,
  LETTER_FLIP_REPLAYS,
  LETTER_FLIP_STAGGER_MS,
  LETTER_FLIP_THRESHOLD,
  LETTER_FLIP_TRANSFORM_MS,
  REVEAL_DELAY_MS,
  REVEAL_DURATION_MS,
  REVEAL_EASING,
  REVEAL_THRESHOLD,
  REVEAL_TRAVEL,
} from './values';
export type { RevealDelayMs } from './values';
