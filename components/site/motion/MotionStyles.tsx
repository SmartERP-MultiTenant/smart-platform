import type { ReactElement } from 'react';

/**
 * The reveal CSS, shared by every band (one styled-jsx `global` block, the shape the
 * three existing band blocks already use — `ServicesShowcase`, `ToolsShowcase`,
 * `TestimonialsSection`).
 *
 * ## Why the hidden state cannot blank the page
 *
 * Every rule that hides or offsets content is keyed on `[data-motion='armed']` or
 * `[data-motion-letters='armed']`. Those attributes are written by `useReveal` in an
 * effect, and only when the visitor has not asked for reduced motion and the environment
 * can actually observe intersections. The server and the first client render both emit
 * `data-motion="idle"`, which **matches no rule in this file** — so without JS, or before
 * hydration, every band is fully visible, laid out and readable. Nothing here uses
 * `display: none` and nothing is conditionally rendered: the element is always in the
 * DOM, at its final geometry (`visibility: hidden` keeps the box and its layout slot),
 * and only the reference's measured *starting* transform is applied to it.
 *
 * The same block carries the `prefers-reduced-motion` rules, which is the one place the
 * whole page's reveal motion is switched off. Because the hook also refuses to arm under
 * reduced motion, the two are independent: either alone is enough to show the final
 * state immediately.
 *
 * ## Effects, as measured (probe §1A/§1B/§1C, §2)
 *
 * | `effect` | reference class | starts at | duration | easing |
 * |---|---|---|---|---|
 * | `fadeIn` | `fadeIn` | `opacity: 0` | 750ms | `ease` |
 * | `slideUp` | `slideInUp` | `translate3d(0, 20%, 0)` | 750ms | `ease` |
 * | `slideInStart` | `slideInLeft` | `translate3d(-20%, 0, 0)` | 750ms | `ease` |
 * | `slideInEnd` | `slideInRight` | `translate3d(20%, 0, 0)` | 750ms | `ease` |
 * | `fadeInStart` | `adFadeInLeft` | `opacity: 0; translate3d(-100px, 0, 0)` | 380ms | `cubic-bezier(0.7, 0, 0.3, 1)` |
 * | `fadeInEnd` | `adFadeInRight` | `opacity: 0; translate3d(100px, 0, 0)` | 380ms | `cubic-bezier(0.7, 0, 0.3, 1)` |
 *
 * The two `slideIn*`/`fadeIn*` pairs mirror their x offset under `[dir='rtl']`, so in the
 * Arabic locale they arrive from the inline start / end edge the element is actually
 * anchored to instead of always from the physical left. Each pair's start travel is
 * declared **once**, as `--motion-from-x`, and both the armed state and the keyframes read
 * that one variable — so the offset a hidden element is parked at and the offset its
 * animation starts from cannot drift apart, and the `[dir='rtl']` mirror is a single
 * declaration rather than two.
 *
 * ## Mechanism (probe §9)
 *
 * IntersectionObserver, `{ root: null, rootMargin: '0px', threshold: 0 }`, fire once,
 * unobserve — no ScrollTrigger, no GSAP, no animation library. The reveal runs on **CSS
 * keyframes with `animation-fill-mode: backwards`**, not on a transition, for one
 * structural reason:
 *
 * > A `transition` declared on the revealed state is a **shorthand**, so it resets
 * > `transition-property`, `-duration`, `-timing-function` and `-delay` in one go — and
 * > it is keyed on two attribute selectors (specificity `0,2,0`), which beats every
 * > Tailwind `transition-*` utility (`0,1,0`). Any element that is *both* a reveal target
 * > and a hover node therefore had its hover transition silently replaced by the reveal's
 * > (a measured regression: the two WorkCounters CTAs hovered instantly). `animation` is a
 * > different property, so the element's `transition` stays entirely its own.
 *
 * The delays fall out of the same declaration: the animation carries
 * `var(--motion-delay, 0ms)` as its `animation-delay`, and because the fill mode is
 * `backwards` the from-keyframe — including its `visibility: hidden` — is held for the
 * whole delay, which is what keeps a delayed element (150/200/400ms) invisible until its
 * turn. After the animation ends nothing is filled forward: the element sits at its own
 * computed values again, exactly as a finished transition leaves it.
 *
 * Fill is deliberately **not** `forwards`/`both`: a filling animation keeps overriding the
 * properties it names, which would re-create the same class of bug one property over (a
 * `hover:-translate-y-*` on a reveal target would never move). And because the
 * direction-dependent keyframes are the *only* keyframes that name a transform per
 * direction, the reduced-motion block below still turns the whole mechanism off by name.
 *
 * Every value here is also exported by name from `./values`; `motion.spec.tsx` asserts
 * the block still carries them, so a number changed in one place fails a test instead of
 * drifting.
 */
export default function MotionStyles(): ReactElement {
  return (
    <style jsx global>{`
      /* idle — the state the server and the first client render both emit — matches
         nothing here, so the page is fully visible before any of this can run. */
      [data-motion='armed'] {
        visibility: hidden;
      }

      /* Start travel, declared once per effect and read by both the armed state and the
         keyframes below. Only the two direction-dependent pairs need a mirror. */
      [data-motion-effect='slideInStart'] {
        --motion-from-x: -20%;
      }

      [dir='rtl'] [data-motion-effect='slideInStart'] {
        --motion-from-x: 20%;
      }

      [data-motion-effect='slideInEnd'] {
        --motion-from-x: 20%;
      }

      [dir='rtl'] [data-motion-effect='slideInEnd'] {
        --motion-from-x: -20%;
      }

      [data-motion-effect='fadeInStart'] {
        --motion-from-x: -100px;
      }

      [dir='rtl'] [data-motion-effect='fadeInStart'] {
        --motion-from-x: 100px;
      }

      [data-motion-effect='fadeInEnd'] {
        --motion-from-x: 100px;
      }

      [dir='rtl'] [data-motion-effect='fadeInEnd'] {
        --motion-from-x: -100px;
      }

      /* armed — the only state that hides or offsets anything, and a state that can only
         exist after a client effect has run. */
      [data-motion='armed'][data-motion-effect='fadeIn'] {
        opacity: 0;
      }

      [data-motion='armed'][data-motion-effect='slideUp'] {
        transform: translate3d(0, 20%, 0);
      }

      [data-motion='armed'][data-motion-effect='slideInStart'] {
        transform: translate3d(var(--motion-from-x), 0, 0);
      }

      [data-motion='armed'][data-motion-effect='slideInEnd'] {
        transform: translate3d(var(--motion-from-x), 0, 0);
      }

      [data-motion='armed'][data-motion-effect='fadeInStart'] {
        opacity: 0;
        transform: translate3d(var(--motion-from-x), 0, 0);
      }

      [data-motion='armed'][data-motion-effect='fadeInEnd'] {
        opacity: 0;
        transform: translate3d(var(--motion-from-x), 0, 0);
      }

      /* The reveal: keyframes, so the element's own transition (its hover timings) is
         never touched. Each from-frame is the armed state above; the implicit to-frame
         is the element's own computed value, which is what makes the end state
         "whatever this element is". */
      @keyframes motion-fade-in {
        from {
          opacity: 0;
          visibility: hidden;
        }
      }

      @keyframes motion-slide-up {
        from {
          transform: translate3d(0, 20%, 0);
          visibility: hidden;
        }
      }

      @keyframes motion-slide-in {
        from {
          transform: translate3d(var(--motion-from-x), 0, 0);
          visibility: hidden;
        }
      }

      @keyframes motion-fade-in-x {
        from {
          opacity: 0;
          transform: translate3d(var(--motion-from-x), 0, 0);
          visibility: hidden;
        }
      }

      [data-motion='revealed'][data-motion-effect='fadeIn'] {
        animation: motion-fade-in 750ms ease var(--motion-delay, 0ms) backwards;
      }

      [data-motion='revealed'][data-motion-effect='slideUp'] {
        animation: motion-slide-up 750ms ease var(--motion-delay, 0ms) backwards;
      }

      [data-motion='revealed'][data-motion-effect='slideInStart'] {
        animation: motion-slide-in 750ms ease var(--motion-delay, 0ms) backwards;
      }

      [data-motion='revealed'][data-motion-effect='slideInEnd'] {
        animation: motion-slide-in 750ms ease var(--motion-delay, 0ms) backwards;
      }

      [data-motion='revealed'][data-motion-effect='fadeInStart'] {
        animation: motion-fade-in-x 380ms cubic-bezier(0.7, 0, 0.3, 1)
          var(--motion-delay, 0ms) backwards;
      }

      [data-motion='revealed'][data-motion-effect='fadeInEnd'] {
        animation: motion-fade-in-x 380ms cubic-bezier(0.7, 0, 0.3, 1)
          var(--motion-delay, 0ms) backwards;
      }

      /* The three delays the reference actually uses (probe §2, "Delays"). There is no
         stagger setting anywhere else on the page: siblings reveal in document order as
         they cross the fold. */
      [data-motion-delay='150'] {
        --motion-delay: 150ms;
      }

      [data-motion-delay='200'] {
        --motion-delay: 200ms;
      }

      [data-motion-delay='400'] {
        --motion-delay: 400ms;
      }

      /* Split-heading flip — the reference's second reveal system (wdt-inview-section),
         trigger threshold: 1, once. transform-origin and display sit on the base rule
         because the reference keeps them in both states. A letter span is not a hover
         node (and letterProps gives it no way to become one: it spreads only a data
         attribute and a delay), so this stays a transition. */
      [data-motion-part='letter'] {
        display: inline-block;
        transform-origin: bottom center;
      }

      [data-motion-letters='armed'] [data-motion-part='letter'] {
        opacity: 0;
        transform: perspective(800px) rotateX(70deg) translateZ(10px)
          translateX(20px);
        filter: drop-shadow(0 15px 10px rgba(0, 0, 0, 0.2));
      }

      [dir='rtl'] [data-motion-letters='armed'] [data-motion-part='letter'] {
        transform: perspective(800px) rotateX(70deg) translateZ(10px)
          translateX(-20px);
      }

      [data-motion-letters='revealed'] [data-motion-part='letter'] {
        opacity: 1;
        transform: perspective(800px) rotateX(0deg) translateZ(0) translateX(0);
        filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.12));
        transition:
          transform 400ms cubic-bezier(0.4, 0, 0.2, 1)
            var(--motion-letter-delay, 0ms),
          opacity 200ms ease var(--motion-letter-delay, 0ms),
          filter 400ms ease var(--motion-letter-delay, 0ms);
      }

      /* The reference has no working reduced-motion path — its media query loses to the
         theme's !important animation declarations and every element animates anyway
         (probe §5). Ours shows the final state immediately: no transition, no keyframes,
         and a forced-visible armed state so a preference switched on mid-scroll can never
         leave an element hidden. */
      @media (prefers-reduced-motion: reduce) {
        [data-motion] {
          animation: none !important;
          transition: none !important;
        }

        [data-motion='armed'] {
          opacity: 1 !important;
          transform: none !important;
          visibility: visible !important;
        }

        [data-motion-part='letter'] {
          animation: none !important;
          transition: none !important;
        }

        [data-motion-letters='armed'] [data-motion-part='letter'] {
          filter: none !important;
          opacity: 1 !important;
          transform: none !important;
        }
      }
    `}</style>
  );
}
