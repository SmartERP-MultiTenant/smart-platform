<!-- Context: best-practices/ux-ui | Priority: high | Version: 1.3 | Updated: 2026-09-17 -->

# UX/UI — best practices (harvested from this codebase)

Purpose: the design system (tokens + component rules) and the RTL/Arabic + premium design standards this repo commits to.

## Key points

- **The public marketing surface is LIGHT-ONLY (P4.18 decision, 2026-09-14).** `components/landing/**` + `components/layouts/PublicLayout.tsx` render light only: no theme toggle, no `dark:` variants, and **no dark palette is planned**. The toggle was removed from `LandingHeader` because `NEXT_PUBLIC_DARK_MODE=false` already gated it off (`.env:34`, `lib/env.ts:109`) — a visible control that did nothing. Dark surfaces on this surface come from the `ds-gradient-dark` class (`--ds-gradient-dark`), never from a toggled theme; `--ds-ink-*` is reserved for those gradient surfaces and has no flat-consumer today. The authenticated account/app shell keeps its own `useTheme` behaviour (`pages/_app.tsx:44`, `components/shared/shell/Header.tsx:166`, `components/account/UpdateAccount.tsx:19`), which the same flag also gates — do not assume removing the landing toggle removes theme support app-wide.
- **Design tokens are the single source of truth.** `styles/tokens.css` v2: indigo-royal primary scale (50–950), bronze accent (brand-distinctive), ink/dark surfaces, semantic colors, gradients (brand/dark/bronze), radius incl. pill, 3-tier layered shadows, motion tokens. **Reference `var(--ds-*)` everywhere — never hardcode hex in components.** Legacy aliases (`--ds-primary`, `--ds-accent`) are kept for v1 compat. **`--ds-text-muted` resolves to `--ds-gray-600` (`#475569`), not `--ds-gray-500`** (revalued 2026-09-17): as `#64748b` it passed on white (4.76:1) but gave only **4.34:1 on the `--ds-gray-100` surface** (`#f1f5f9`) — below the 4.5:1 AA threshold for normal text, which made it the source of eight contrast failures in the design audit. `#475569` gives **7.58:1 on white** and **6.92:1 on `--ds-gray-100`**. Muted text on any gray surface must use `--ds-text-muted`, never `--ds-gray-500` directly.
- **Fonts (next/font):** Cairo = Arabic body · Almarai = Arabic display · Tajawal = alt · Montserrat = Latin/numbers. `.font-ar` / `.font-en` utilities resolve the `--font-*` vars directly (they are page-scoped via the root class — see `best-practices/performance.md`). Arabic line-height token `--ds-leading-body: 1.85`; RTL is `dir="rtl"` with mirrored layout.
- **Premium ≠ AI-slop (from `docs/design/design-synthesis.md`):** one signature color + warm secondary (not generic purple-blue on white); dark surfaces used with intent (hero/stats/footer); real product UI as hero art; layered soft shadows not heavy drop shadows; trust signals above the fold (compliance badges, stats, client logos); pill radius **only** for CTA buttons. No emoji in place of real metrics, no stock-feel imagery.
- **Component conventions:** cards 16–20px radius, interactive elements 8–12px; buttons solid/outline/ghost/link + sizes + disabled; inputs 12px radius with 4px focus ring (`--ds-primary-100`); badges status/compliance/tag variants; alerts use semantic tokens (success/warning/danger/info). Section header pattern: icon tile + Arabic title + uppercase EN label (`Section` component in `pages/design-system.tsx`).
- **Admin shell dashboard (teams/[slug]/dashboard):** stat cards use the daisyUI `stats` component with shell gray/dark tokens (not hex palettes) · charts (ApexCharts) render **client-only** via `next/dynamic({ ssr: false })` and follow the theme through `.dark` on `<html>` (MutationObserver in `components/dashboard/charts/useIsDark.ts`) · chart series colors are the token hexes from `styles/tokens.css` (`--ds-primary-600/400`, `--ds-bronze-500`) — the only sanctioned hexes · restricted-permission sections render as hidden/empty, never as fake zeros.
- **Do/Don't rules** live in the design-system page "قواعد الاستخدام" and in `docs/design/design-synthesis.md`: gradient only in hero/CTA; bronze reserved for pricing/premium; no mixing radii inside a component; white text on dark blue; ink surfaces for hero/stats/footer; avoid heavy 3D shadows.

## Rules for new UI

1. Use tokens (`var(--ds-*)`) + the `Section`/`FieldLabel` helper patterns; extend the design-system page when adding a new component.
2. Arabic-first RTL with EN parity; use `dir="rtl"` + `font-en` for Latin spans; generous line-height for Arabic.
3. Trust hierarchy for this market: compliance (ZATCA/ISO) > customer counts > named logos > testimonials.
4. If a new visual pattern is added, showcase it on `/design-system` and update Do/Don't + this file.
5. Dashboard/insight UIs: wire charts and stat cards to real data (SWR + `models/dashboard.ts`); prefer tables with view-all links over pagination on overview pages; never create side effects (e.g. Stripe customer creation) from dashboard reads.

## References

- `styles/tokens.css` · `styles/globals.css` (utilities) · `pages/design-system.tsx` (showcase) · `docs/design/design-synthesis.md` (competitor research)
