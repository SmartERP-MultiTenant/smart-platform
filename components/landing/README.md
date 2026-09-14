# `components/landing/` — the public marketing funnel

Everything the public landing page (`/`) renders, plus the chrome around it. This
directory is the **only** place landing copy components live. It was renamed in
P4.17 to drop the Penpot design-board codename and the upstream directory name it
inherited, neither of which described what the code is; the old path survives only
in git history (`git log --follow`) and in dated decision records, which are
intentionally not rewritten.

For the funnel's structure, `pages/index.tsx` renders one thing:
`landingSections.map(...)` from **`sections.ts`**.

## Funnel order

`sections.ts` is the single source of truth for the **set and order** of the
sections. The rendered order is:

| #   | `id`           | Component             | Anchor          | i18n prefix      |
| --- | -------------- | --------------------- | --------------- | ---------------- |
| 1   | `hero`         | `HeroSection`         | `#home`         | `landing-hero`   |
| 2   | `trust`        | `TrustSection`        | `#about`        | `landing-trust`  |
| 3   | `features`     | `FeaturesSection`     | `#features`     | `landing-feat`   |
| 4   | `alternating`  | `AlternatingSection`  | —               | `landing-alt`    |
| 5   | `mobile`       | `MobileSection`       | —               | `landing-mobile` |
| 6   | `testimonials` | `TestimonialsSection` | `#testimonials` | `landing-test`   |
| 7   | `cta`          | `CtaSection`          | `#pricing`      | `landing-cta`    |

The anchors are the targets of the header nav links (`/#home`, `/#about`,
`/#features`, `/#pricing`) built in `LandingHeader.tsx`.

> **`anchor` and `i18nKey` are documentation, not wiring.** `pages/index.tsx`
> reads only `id` and `Component` from each entry. The real anchor is a
> hardcoded `id="…"` inside the section component; the real i18n prefix is
> whatever its `t()` calls use. So editing `anchor` here changes nothing on
> the page. Renaming an anchor means changing **three** places in one commit:
> the registry field, the component's `id`, and the nav href in
> `LandingHeader.tsx`. `__tests__/components/landing/sections.spec.tsx` fails if
> any of the three drift apart — that test is the enforcement, this table is the
> documentation.

## Chrome (not sections)

These render on every public page through `components/layouts/PublicLayout.tsx`,
not from the registry:

- `LandingHeader.tsx` — sticky header: brand, nav, language switcher, CTAs. Takes
  props (`compact`, `darkModeEnabled`, `toggleTheme`, labels) from `PublicLayout`.
- `FooterSection.tsx` — footer; it renders `TrustStrip` itself, which is why
  `TrustStrip` is not a registry entry.
- The `PublicLayout` also renders the Cairo (Arabic body) and Almarai (Arabic
  display) `next/font` variables that the whole surface relies on.

## Adding a section

1. Add `components/landing/<Name>Section.tsx`, following the existing shape: a
   default-exported zero-prop component that renders a single `<section>` and
   reads its copy with `useTranslation('marketing')`.
2. Add it to `landingSections` in `sections.ts` at the position it should appear,
   with a unique `id`, its `anchor` (if it has one), and the `landing-*` prefix its
   keys use.
3. Add the copy keys to **both** `locales/ar/marketing.json` and
   `locales/en/marketing.json` with the same key set. Key parity is a CI gate
   (`npm run check-locale`), and Arabic is the default locale — a key that only
   exists in `en` is a bug, not a fallback.
4. If the section needs to be reachable from the nav, add the link in
   `LandingHeader.tsx`.

Those are the only files to touch. `pages/index.tsx` never changes for a new
section, and there is no configuration or factory layer here by design.

## Conventions

- **Naming:** `<Thing>Section.tsx` / `<Thing>Section`. The directory is plain
  `landing/`; no product codenames.
- **Copy:** every user-visible string goes through `t('landing-<section>-…')` from
  the `marketing` namespace. Literal strings in this directory are lint-exempt
  (`eslint.config.cjs` turns `i18next/no-literal-string` off for
  `components/landing/**/*.tsx`) but must not be introduced — see the store-badge
  literal debt tracked in P4.20.
- **Styling:** design tokens only (`var(--ds-*)`); the raw hex literals still in
  this tree are tracked in P4.18.
- **Data:** all sections are currently static copy. Sections that become
  data-driven must fetch through `lib/erp.ts` at request time (the pattern
  `pages/pricing.tsx` uses), never with invented hardcoded figures.
