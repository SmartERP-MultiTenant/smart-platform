import type { ReactElement, ReactNode } from 'react';

/**
 * DS Marquee — a CSS-only, RTL-safe infinite row.
 *
 * ## Why it exists
 *
 * Both rows this replaces animated a **physical** `translateX` on a `w-max` track inside
 * an RTL document. In RTL a `w-max` flex track overflows to the **left**, so its
 * inline-start edge sits flush with the clip's right edge; `translateX(0 -> -50%)` then
 * walks the strip's leading edge away from the clip and the row empties. In LTR the same
 * code only broke when the clip was wider than one copy (the icon strip: clip > 1020px).
 *
 * ## Seamlessness is arithmetic, not eyeballing
 *
 * Define strip coordinate `s` as the distance from the strip's inline-start edge. A
 * translate of `+s` in RTL (or `-s` in LTR) slides the clip to `[s, s + clip]`. The track
 * is exactly **two identical units** of width `U = repeat * listWidth`, and every item
 * carries the same trailing gap, so the track is exactly `2U` wide and the animation's
 * `50%` is exactly `U`.
 *
 * > **Invariant: blank is impossible while `U >= clip`, at any viewport and either
 * > direction.** At the loop's end the clip shows `[U, U + clip]`, which is inside the
 * > second unit iff `clip <= U`; and unit 2's pixels are unit 1's by construction, so the
 * > frame is identical to `t = 0`.
 *
 * `repeat` therefore has to satisfy `unit >= clip` **for the clip the calling band
 * actually presents**, and that number is not the same for the two callers:
 *
 * - The testimonial rows are **capped**: `TestimonialsSection` puts each row inside a
 *   `max-w-[1700px]` container, so the clip can never exceed 1700px. Its pill list
 *   measures 1380-1656px and it passes `repeat={3}` (unit 4140-4989px), so the invariant
 *   holds at every viewport, in both locales.
 * - The tools icon strip is **not** capped — its wrapper loses the cap exactly as the
 *   reference's Elementor container does — so its clip tracks the viewport at roughly
 *   0.65 x viewport (884px at 1440, 1623 at 2560, 2468 at 3840, 3313 at 5120). Its unit at
 *   `repeat={3}` was 3060px, which that clip passes at about a 4740px viewport; a browser
 *   run measured an 8.5% blank row at 5120. It now passes `repeat={5}`: `md` tiles are
 *   140px + 30px gap, so the unit is `6 x 170 x 5 = 5100px` (blank-free to an ~7800px
 *   clip, i.e. 8K), and `4500px` below `md` (`6 x 150 x 5`).
 *
 * The bound is per caller and it is the caller's job to check it: the primitive cannot
 * measure its own clip, and nothing here runs in the browser to find out.
 *
 * ## Direction
 *
 * `direction` is the visual travel: `left` runs `0 -> -50%` in LTR and its mirror,
 * `0 -> +50%`, under `[dir='rtl']`. Both directions are mirrored, because in RTL the only
 * translate that advances the strip without exposing its edge is the one that increases
 * `s` (a positive `translateX`). The mirror is a plain `animation-name` override selected
 * by a data attribute — no JS measurement and no `requestAnimationFrame`, so the SSR
 * output is already correct and there is nothing to hydrate.
 *
 * The primitive never sets a direction of its own on the track: the caller's items inherit
 * the document's `dir`, so Arabic pill copy still resolves RTL inside an RTL row.
 *
 * Hover-to-pause and `prefers-reduced-motion` live in the same styled-jsx block: the pause
 * is `animation-play-state` (the band's existing behaviour) and reduced motion removes the
 * animation entirely, leaving the first unit laid out and readable.
 */

export interface MarqueeProps {
  /**
   * The caller's item list. `repeat` copies of it become ONE animated unit, and the unit
   * is rendered twice.
   */
  items: ReactNode[];
  /**
   * Gap between items, in px. Applied as a logical trailing margin on every item —
   * including the last of a unit — because the pitch has to be uniform across the unit
   * boundary for `-50%` to land exactly one unit. It is therefore owned here, not in the
   * caller's item classes.
   */
  gap: number;
  /** Full loop duration in seconds. */
  duration: number;
  /**
   * Visual travel. `left` is the reference's `0 -> -50%`; `right` is its `-50% -> 0`.
   * Both mirror under `[dir='rtl']`.
   */
  direction?: 'left' | 'right';
  /**
   * `repeat * listWidth` must be at least as wide as the clip this caller actually
   * presents — 1700px for the capped testimonial band, but an uncapped `~0.65 x
   * viewport` for the tools strip (see the header comment). Defaults to 2; every
   * current caller passes an explicit value.
   */
  repeat?: number;
  /** Decorative rows (the icon strip) are `aria-hidden` whole. */
  decorative?: boolean;
  /** Classes for the clipping wrapper. Defaults to the bands' mobile full-bleed. */
  className?: string;
  /** Classes for each item element. Must not carry its own trailing margin. */
  itemClassName?: string;
}

const DEFAULT_WRAPPER_CLS = '-mx-[20px] overflow-hidden md:mx-0';

export default function Marquee({
  items,
  gap,
  duration,
  direction = 'left',
  repeat = 2,
  decorative = false,
  className = DEFAULT_WRAPPER_CLS,
  itemClassName,
}: MarqueeProps): ReactElement | null {
  if (items.length === 0) return null;

  // One unit = the caller's list repeated until it is at least as wide as the widest
  // clip; the track is two units, so the loop can always be translated by one full unit
  // without ever exposing the strip's edge.
  const unit: ReactNode[] = [];
  for (let copy = 0; copy < Math.max(1, repeat); copy += 1) {
    unit.push(...items);
  }
  const track = [...unit, ...unit];

  return (
    <div
      data-ds-marquee=""
      aria-hidden={decorative || undefined}
      className={className}
    >
      <div
        data-ds-marquee-track=""
        data-ds-marquee-direction={direction}
        className="flex w-max"
        style={{ animationDuration: `${duration}s` }}
      >
        {track.map((item, index) => {
          // Only the first copy of the list is the caller's real content; every repeat is
          // a visual clone. That is the same contract the three-copy rows had.
          const isClone = index >= items.length;

          return (
            <span
              key={index}
              className={itemClassName}
              style={{ marginInlineEnd: gap }}
              aria-hidden={decorative || isClone ? true : undefined}
            >
              {item}
            </span>
          );
        })}
      </div>

      <style jsx global>{`
        [data-ds-marquee-track] {
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        [data-ds-marquee-track][data-ds-marquee-direction='left'] {
          animation-name: ds-marquee-left;
        }

        [data-ds-marquee-track][data-ds-marquee-direction='right'] {
          animation-name: ds-marquee-right;
        }

        /* The mirror. In RTL the strip's inline-start edge is its right edge, so the only
           translate that advances the strip without exposing that edge is a positive one.
           These rules are deliberately not important: the reduced-motion block below kills
           the animation with an important declaration, and an important mirror would
           outrank it. */
        [dir='rtl'] [data-ds-marquee-track][data-ds-marquee-direction='left'] {
          animation-name: ds-marquee-left-rtl;
        }

        [dir='rtl'] [data-ds-marquee-track][data-ds-marquee-direction='right'] {
          animation-name: ds-marquee-right-rtl;
        }

        @keyframes ds-marquee-left {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        @keyframes ds-marquee-right {
          from {
            transform: translateX(-50%);
          }
          to {
            transform: translateX(0);
          }
        }

        @keyframes ds-marquee-left-rtl {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(50%);
          }
        }

        @keyframes ds-marquee-right-rtl {
          from {
            transform: translateX(50%);
          }
          to {
            transform: translateX(0);
          }
        }

        /* The reference's own pause: the pointer anywhere in the row stops its track.
           The track has no inline animation shorthand (duration only), so no !important
           is needed here. */
        [data-ds-marquee]:hover [data-ds-marquee-track] {
          animation-play-state: paused;
        }

        @media (prefers-reduced-motion: reduce) {
          [data-ds-marquee-track] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
