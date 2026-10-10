import type { ElementType, HTMLAttributes, ReactNode } from 'react';

import MotionStyles from './MotionStyles';
import { useReveal, type RevealEffect } from './useReveal';
import { REVEAL_DELAY_MS, type RevealDelayMs } from './values';

/**
 * The tags a reveal may be attached to. Closing this list is deliberate: the reference's
 * measured boxes must be revealed **in place**, so a caller picks the tag its markup
 * already uses instead of wrapping a band element in a new one (a wrapper changes the
 * hero's overhang, the tools band's overhang reserve and the platform panel's clip — the
 * three geometries this design was measured against).
 */
export type RevealTag =
  | 'div'
  | 'span'
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'ul'
  | 'ol'
  | 'li'
  | 'article'
  | 'aside'
  | 'figure'
  | 'section'
  | 'form';

export interface RevealProps extends HTMLAttributes<HTMLElement> {
  /** The element to render. Defaults to `div`. Never adds a wrapper of its own. */
  as?: RevealTag;
  /** The reference effect. Defaults to `slideUp`, the effect most of the bands use. */
  effect?: RevealEffect;
  /** The reference's `_animation_delay` for this element. Defaults to none. */
  delayMs?: RevealDelayMs;
}

/**
 * Thin wrapper over `useReveal` for the common case: one element, one effect, no state to
 * thread. Use the hook directly when the band needs the split-heading letter flip, or
 * when it already owns the element's `ref`.
 *
 * It renders the shared `MotionStyles` block itself, so a band that reveals anything can
 * never forget the reveal CSS or its reduced-motion rules. The block is a styled-jsx
 * `global` style: it is registered into the document head (styled-jsx renders no DOM node
 * for it, and de-duplicates it across every instance), so it adds nothing to the band's
 * own markup and cannot shift its geometry.
 *
 * ```tsx
 * <Reveal as="h2" effect="slideUp" className={H2_CLS}>
 *   {headingCopy}
 * </Reveal>
 * ```
 */
export default function Reveal({
  as = 'div',
  effect = 'slideUp',
  delayMs = REVEAL_DELAY_MS.none,
  children,
  ...rest
}: RevealProps): ReactNode {
  const { motionProps } = useReveal<HTMLElement>({ effect, delayMs });
  const Tag = as as ElementType;

  return (
    <Tag {...rest} {...motionProps}>
      <MotionStyles />
      {children}
    </Tag>
  );
}
