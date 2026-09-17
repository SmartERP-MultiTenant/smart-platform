<!-- Context: docs/design/design-system-adoption | Priority: high | Version: 1.0 | Updated: 2026-09-15 -->

# SMART PLATFORM — Design System Adoption Brief

**Goal:** decide which ready-made design systems, component libraries and art direction sources SMART PLATFORM adopts, given that the project has no UX/UI designer, and that the brand's visual identity is anchored to the colours already present in the logo.

**Method:** first-party verification of every licence, price and compatibility claim (npm registry metadata, vendor licence pages, live requirement documents), a shortlist scored against the actual stack in `smart-platform/`, and contrast maths run against the logo palette.

**Scope:** the marketing surface (`components/landing/**`, `pages/index.tsx`, `pages/pricing.tsx`), the authenticated app shell (`components/shared/shell/**`), and the admin/dashboard surface (`pages/teams/[slug]/dashboard`, `components/dashboard/**`).

**Companion:** `docs/design/design-synthesis.md` is the competitor-driven v2 token synthesis. This document sits on top of it and decides the _sources_; that document decided the _tokens_.

## Contents

1. [Structural finding: there is no installable ready design](#1-structural-finding-there-is-no-installable-ready-design)
2. [Brand identity anchor extracted from the logo](#2-brand-identity-anchor-extracted-from-the-logo)
3. [Recommended stack — four layers](#3-recommended-stack--four-layers)
4. [Shortlist with verdicts](#4-shortlist-with-verdicts)
5. [Colour system plan](#5-colour-system-plan)
6. [Arabic / RTL reality check](#6-arabic--rtl-reality-check)
7. [Reference intelligence — patterns to copy, not assets](#7-reference-intelligence--patterns-to-copy-not-assets)
8. [Sequenced next moves](#8-sequenced-next-moves)
9. [Sources](#9-sources)

## 1. Structural finding: there is no installable ready design

The project stack — **Next.js 15 (Pages Router) · React 18.3 · Tailwind CSS 3.4.17** — is now the previous library generation. In 2026 the premium market moved to **Tailwind v4 + React 19 + App Router**. Concretely, each of the following now requires a Tailwind 3 → 4 migration before it can be dropped in:

- HeroUI (ex-NextUI)
- Untitled UI React
- shadcn's new styles (`base-nova`, `radix-nova`)
- Preline 5
- Magic UI
- TailAdmin
- NextAdmin
- shadcnstudio
- DashboardPack Apex Dashboard

**Conclusion:** there is no single ready-made design to install. There are **four layers**, each bought or borrowed separately. This document assigns one source per layer.

## 2. Brand identity anchor extracted from the logo

The palette below was extracted from `public/logo/logo.png` and `public/favicon.svg`. This is the part of the identity that is **fixed**: the logo may be redrawn later, but the colour family is not expected to change.

| Role                   | Logo hex              | Contrast vs white | Verdict                                                                               |
| ---------------------- | --------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| Primary blue (mark bg) | `#0552E0` → `#013CCD` | 6.38:1 / 8.30:1   | Safe CTA with white text                                                              |
| Deep blue              | `#0330A8`             | 10.54:1           | Passes                                                                                |
| Copper / bronze        | `#A36744`, `#C7865D`  | 4.58:1 / 3.00:1   | Raw copper passes AA by 0.08 — fills and large icons only, never body text            |
| Gold                   | `#E8B64C`             | 1.87:1            | **Never** carries white text. Correct pairing is plum `#332D4F` text on gold = 6.89:1 |
| Plum / navy            | `#332D4F`             | 12.89:1           | Dark surface                                                                          |

### 2.1 Two defects found in `smart-platform/styles/tokens.css`

Both were found by mapping the real logo palette onto the current v2 tokens. Neither is a matter of taste — both are fixable this week.

**Defect 1 — blue drift.** The logo is a _vivid_ blue: `#0552E0`. The v2 token `--ds-primary-600` is a _muted indigo_: `#2548D9` (`smart-platform/styles/tokens.css:17`). The system is therefore already two shades off its own brand.

Remediation:

| Token              | Current   | Change to | Role                          |
| ------------------ | --------- | --------- | ----------------------------- |
| `--ds-primary-600` | `#2548d9` | `#0552E0` | brand primary — logo-accurate |
| `--ds-primary-700` | `#1d3ab0` | `#013CCD` | pressed / hover-dark          |
| `--ds-primary-800` | `#1b3189` | `#0330A8` | deep surface / gradient end   |
| `--ds-primary-500` | `#3a63f5` | `#2548D9` | hover (demoted from 600)      |

**The change is not confined to those four steps.** The primary palette is also hardcoded as raw hex in the gradient, glow and info tokens, so changing only the four steps above would leave the system split in two: CTAs would render the new vivid blue while hero gradients and glows kept the old indigo.

| Token                  | Line   | Hardcoded value                                  | Holds                               |
| ---------------------- | ------ | ------------------------------------------------ | ----------------------------------- |
| `--ds-gradient`        | `:92`  | `#2548d9`, `#1d3ab0`, `#182a68`                  | old blue 600 / 700 / 900            |
| `--ds-gradient-bright` | `:93`  | `#3a63f5`, `#2548d9`, `#1d3ab0`                  | old blue 500 / 600 / 700            |
| `--ds-gradient-dark`   | `:105` | `#3a63f5` glow, `#182a68`, plus bronze `#b8733a` | old blue 500 / 900 and old bronze   |
| `--ds-shadow-glow`     | `:167` | `#3a63f5`                                        | old blue 500                        |
| `--ds-info-500`        | `:73`  | `#3a63f5`                                        | old blue 500                        |
| `--ds-gradient-bronze` | `:99`  | `#cc8a54`, `#b8733a`, `#9a5c2e`                  | copper ramp — only if bronze moves  |
| `--ds-shadow-bronze`   | `:169` | `#b8733a`                                        | only if bronze moves at token level |

The glows are written as `rgba(...)` in the file; the value column gives the equivalent colour. Line numbers are `smart-platform/styles/tokens.css` as reviewed on 2026-09-15.

The existing `--ds-primary` / `--ds-primary-dark` / `--ds-primary-light` legacy aliases do keep working, because they resolve through the four steps above rather than holding their own hex.

**Defect 2 — bronze fails AA.** White text on `--ds-bronze-500` (`#B8733A`, `smart-platform/styles/tokens.css:29`) measures **3.78:1**, which fails WCAG AA for normal text. Every bronze button or badge currently carrying white text is non-compliant.

Remediation:

- Bronze **fills** with white text → use `#A36744` (**4.58:1**).
- Copper **text** on white → use a darker copper around **`#8E5638`**.
- Gold **must never be a text colour on white** (1.87:1) and must never sit under white text. Gold's correct text pairing is plum `#332D4F`.

## 3. Recommended stack — four layers

| #   | Layer                                                                             | Pick                                                                                           | Licence / cost                                        | Why it wins for this repo                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Decision anchor** — type scale, spacing, radius, RTL behaviour, component specs | **Saudi DGA "Platforms Code"** (كود المنصات)                                                   | **Licence unverified** — see §3.3                     | The single best find. An **Arabic-first (not translated)** national design system: decided palette, decided type scale, decided component specs, native RTL, **62 components**. A team with no designer does not fail at _components_ — it fails at _decisions_. Saudi buyers already recognise this visual language, so "we did not decide" reads as institutionally correct. MIT React port: `@dev-dga/react`.                                                |
| 2   | **Component foundation**                                                          | **shadcn/ui on the Tailwind v3 legacy path** (`shadcn@2.3.0`, `components.json` → `rsc:false`) | MIT, free                                             | The **only** broad React _component library_ that still runs natively on Tailwind 3.4.17 — Tremor Blocks is a block collection and daisyUI is a CSS class system, so neither is a drop-in equivalent of the same kind. Theming is roughly 20 semantic CSS variables re-pointed at the existing `--ds-*` tokens, so brand colour stays single-sourced. Router-agnostic, so Pages Router is fine. 60+ components including data-table, sidebar, forms and charts. |
| 3   | **Dashboard / data surface**                                                      | **Tremor Blocks**                                                                              | **MIT, $0** (post-Vercel acquisition)                 | The one free kit whose install documentation **pins `tailwindcss@3.4.17` and React `18.2.0+` verbatim**. 300+ blocks: KPI cards ×29, chart tooltips ×21, chart compositions ×15, bar charts ×12, form layouts ×6, banners ×5. Copy-paste, no router coupling.                                                                                                                                                                                                   |
| 4   | **Art direction** — the actual "look"                                             | **Tailwind Plus All-Access**                                                                   | **$299 one-time**, personal licence (team ≤25 ≈ $979) | 500+ application UI components, 10+ full templates, plus Catalyst. Every component has a **v4 ↔ v3.4 code toggle in the Code tab**, so it drops into 3.4.17 instead of forcing a migration. Covers marketing, auth, app shell, settings, billing, tables and empty states. One-time payment, unlimited end products.                                                                                                                                            |

### 3.1 Caveat on layer 3

Tremor Blocks is **Recharts-based**: `@tremor/react` depends on `recharts ^2.13.3`. This repo already ships ApexCharts in `components/dashboard/charts/ApexChart.tsx`.

Therefore:

- Take the **library-agnostic** blocks as-is (KPI cards ×29, form layouts ×6, banners ×5).
- **Port the chart compositions to ApexCharts** rather than adding a second chart engine to the bundle.

### 3.2 If only one thing is done

Buy **Tailwind Plus** for art direction and adopt **DGA Platforms Code** for decisions. Together they close, by our estimate, roughly **70% of the designer gap** with no architecture risk, no migration, and a combined one-time cost of $299.

Read **§3.3** before acting on the DGA half of that: the official licence is unverified, and the community registry's component payload would overwrite this repo's token file.

### 3.3 Caveats on layer 1 — read before adopting DGA

The Layer 1 recommendation stands: an Arabic-first national design system is still the right decision anchor for a team with no designer. These three findings were discovered _after_ this document was first written, and they change the _mechanics_ of adopting it — not the recommendation.

#### Caveat 1 — path collision: the registry would overwrite the design tokens (blocker)

The Saudi DGA community registry (`dga-registry.vercel.app`) declares its component payloads as `{ "path": "styles/tokens.css", "target": "styles/tokens.css" }`.

The repo's token file is **`smart-platform/styles/tokens.css`** — the _same filename_. Running `shadcn add <registry-url>` would therefore **overwrite the design tokens** with the registry's own. Mitigations, in order of preference:

1. Run `shadcn add` into a **scratch project** first, then hand-port only what survives review.
2. **Override `target`** in the registry entry before running anything.
3. Never run `shadcn add <dga-registry-url>` against this repo.

This is the reason the layer-1 recommendation is phrased as "adopt the _specs_", not "install the components".

#### Caveat 2 — the registry's neutral ramp is not neutral

Its `--colors-neutral25…800` matches **Untitled UI's published grey scale exactly** — the most AI-reproduced neutral ramp in existence, and the fastest way to make a finished page read as generated. **Replace that ramp first.** It is the highest-leverage de-genericising action available and costs about one afternoon.

Two further rename facts:

- The token names contain a **baked-in typo**, `--typography-line-hight-line-hight90` ("hight"), to correct during any rename pass.
- The prefixes are `--colors-*`, `--typography-*`, `--icon-*`, `--charts-*`, `--progress-bar-*` — **not** `--ds-*` — so a **central rename shim is required**; this is not a drop-in.

#### Caveat 3 — the licensing status is weaker than §3 states

§3 described this source as "Free, public, official". **That was wrong and is corrected here.**

| Claim                                          | Verified status                                        |
| ---------------------------------------------- | ------------------------------------------------------ |
| `oss.dga.gov.sa`, `design.dga.gov.sa`          | Return **403 to automated access**                     |
| Official `@platforms-code/*` npm package       | **Does not exist**                                     |
| Community registry (`dga-registry.vercel.app`) | **Third-party Vercel deployment, no LICENSE file**     |
| Official DGA licence text                      | **UNVERIFIED** — not retrievable by automated means    |
| `mazin-musleh/NDS-vanilla`                     | **MIT** — the only DGA-derived artifact safe to vendor |

**If DGA code is vendored, vendor `NDS-vanilla`, not the community registry.** Its README states the default visual identity — tokens, colours, logos and the digital-stamp component — is **exclusive to Saudi Arabia government entities**, and that non-government adopters must substitute their own identity. This project already anchors its identity to the logo palette rather than to DGA's, so the substitution costs nothing — but it must be deliberate, not accidental.

> **OPEN VERIFICATION ITEM.** Confirm the official DGA licence with one **manual browser pass** — open `oss.dga.gov.sa` in a normal browser session and read the terms — before vendoring any DGA code. Do not treat "it is a government design system" as a licence.

## 4. Shortlist with verdicts

### 4.1 Adopt or steal from

| Candidate                      | Licence               | Tailwind 3.4?    | RTL                   | Verdict                                                                                                                    |
| ------------------------------ | --------------------- | ---------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **DGA Platforms Code**         | Unverified — see §3.3 | Reference        | Native Arabic-first   | Adopt as the taste **and** decision anchor                                                                                 |
| **shadcn/ui** (`shadcn@2.3.0`) | MIT                   | Native           | Manual on v3          | Adopt as the component foundation                                                                                          |
| **Tremor Blocks**              | MIT, $0               | Pinned 3.4.17    | Logicalize by hand    | Adopt the non-chart blocks                                                                                                 |
| **Tailwind Plus**              | $299 one-time         | v3.4 code toggle | Re-typeset for Arabic | Buy for art direction                                                                                                      |
| **Radix primitives**           | MIT                   | Yes              | Yes                   | Adopt as shadcn's headless base                                                                                            |
| **Noor UI RTL guide**          | MIT                   | n/a (v4-only)    | Yes                   | **Steal the guide, skip the package.** Well documented, but it ships Inter for Arabic — the exact bug it criticises        |
| **Oratiq bidi isolation**      | MIT                   | Tailwind v4      | Best engineering      | Steal the discipline: `<bdi>` on phone numbers, OTP codes, currency, shortcut labels                                       |
| **NYX**                        | MIT                   | Vanilla CSS      | Yes                   | Steal one thing: the Arabic font decision — it bundles Thmanyah (a Saudi brand face, under its own licence, not NYX's MIT) |
| **satnaing/shadcn-admin**      | MIT                   | v3.4 origin      | Explicit RTL          | Reference for physical → logical class mapping                                                                             |
| **arhamkhnz Studio Admin**     | MIT                   | Tailwind v4      | No                    | Best free _design taste_ in the dashboard space. **Read it, do not run it.**                                               |

### 4.2 Reject, and why

| Candidate                                                                   | Kill reason                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **HeroUI** (ex-NextUI)                                                      | `@heroui/theme` peers `tailwindcss >=4.0.0`; and the **worst Arabic RTL** of the shortlist — no RTL docs, open complaints (#6312, #6061)                                                                                                                                                                                                                     |
| **Radix Themes**                                                            | RTL officially unsupported (issues #11, #539; PR #161 never merged); repo stale since Apr 2026. Use **primitives**, not Themes                                                                                                                                                                                                                               |
| **Mantine 8**                                                               | Genuinely excellent RTL ("all components support RTL out of the box") and a maintained Pages Router template — but Tailwind preflight breaks its components and it carries a second token system. **Scoped companion only** (dates, charts, spotlight), never the base                                                                                       |
| **Park UI / Chakra v3**                                                     | Wrong styling engine (Panda CSS / Emotion) → duplicate tokens, reset collisions, no Tailwind interop                                                                                                                                                                                                                                                         |
| **Untitled UI React**                                                       | Hard-requires Tailwind **4.3** + React **19.2**                                                                                                                                                                                                                                                                                                              |
| **Origin UI → coss ui**                                                     | **AGPL-3.0** — network copyleft, a licensing blocker for a multi-tenant SaaS                                                                                                                                                                                                                                                                                 |
| **TailAdmin / NextAdmin / shadcnstudio / Apex Dashboard / shadcndashboard** | All App Router + Tailwind v4 + React 19 → reference only. **TailAdmin is worth mining**: it is ApexCharts-native and its own documentation markup carries Tailwind v4 `ltr:` / `rtl:` variants, making it the closest structural analogue to this repo. We could not confirm the specific release that added RTL, so treat any version number as unverified. |
| **Aceternity UI / Magic UI**                                                | Motion, not a design system. The dark/neon/shader register is actively wrong for Arabic ERP/fintech trust, and in our judgement Magic UI is the clearest tell of an AI-generated site                                                                                                                                                                        |
| **Preline 5**                                                               | Targets Tailwind v4 (its setup imports `@import "tailwindcss"`, the v4 syntax); ships HTML markup and headless vanilla-JS plugins rather than React components; and it has no RTL documentation — every RTL docs path we tried returns 404                                                                                                                   |
| **arabic-ui-kit, manara**                                                   | `arabic-ui-kit` is MIT but has 1 star, i.e. no traction; `manara` ships with `"license": "UNLICENSED"` in its npm metadata — **legally unusable**                                                                                                                                                                                                            |
| **Style Dictionary / Tokens Studio**                                        | One platform (web) only. Tokens Studio Git sync is ≈ €39/mo for a designer-facing tool there is no designer for. Keep hand-written `tokens.css`                                                                                                                                                                                                              |

## 5. Colour system plan

### 5.1 Mint four scales

Mint four 50–950 scales — blue, copper, gold, plum — with one of:

- **BeanToolBox Color Scale Builder** — free, in-browser, outputs Tailwind config + CSS + JSON, OKLCH interpolation.
- **tints.dev** — free, public JSON API.

### 5.2 Stay on hex in `smart-platform/styles/tokens.css`

Do **not** move to OKLCH now. In Tailwind **3.4.x**, raw `oklch()` values silently break `bg-primary/50`-style opacity modifiers (tailwindcss issue #14499), and there is no automatic sRGB fallback for the ~6% of browsers without support (caniuse puts global support at **94.25%**).

- Use OKLCH only for **generation maths**.
- Revisit on the Tailwind v4 migration.

### 5.3 Add a contrast test

Generators do not guarantee contrast — Radix's own custom-palette documentation says so explicitly. Add `tests/tokens.contrast.test.ts` asserting the pairings in §2.

### 5.4 Accent discipline rules

These are what separate premium from cheap:

- **Copper / bronze ≤ ~8%** of any screen. It is an accent, never a second primary.
- **Bronze and gold never carry a primary CTA.** The primary CTA is brand blue.
- **Gold is the warning hue** in every major design system, so brand gold is allowed on badges, KPI highlights and "Pro" marks — and **never in status components**.
- **Blue is the info hue.** With a blue primary, `info` cannot also be blue-on-white: render info as a **tinted brand-blue surface with a neutral icon**.
- **Copper sits ~25° from red.** Keep `danger` a cool deep red (a `#C7362F`-class value) and always pair status with **icon + label** (WCAG 1.4.1 — never colour alone).
- **Semantic set:** success `#10B981` and warning `#B45309` already match the current tokens and stay. `danger` **changes** — the current `--ds-danger-500: #ef4444` / `--ds-danger-700: #b91c1c` sit too close to copper, so move them to a cooler deep red of the `#C7362F`-class.

## 6. Arabic / RTL reality check

**No product on the market ships Arabic-_first_ design.** Every candidate on the shortlist is RTL-_flipped_. This is therefore work that must be done in-house — but it is mechanical, and the cheap path is:

1. **Tailwind logical utilities are the whole mechanism** — `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `inset-s-`. They exist in **v3 already**, so **no mirroring plugin is needed**.
2. **Enforce it with a lint rule.** Ban `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right` inside `components/` and `pages/`. This substitutes for the shadcn CLI RTL transform, which is **only** available for `shadcn create` projects using the new `base-nova` / `radix-nova` styles — and `v3.shadcn.com/docs/rtl` is a 404. **Verified:** the Tailwind v3 path gets **zero** RTL automation, so lint _is_ the automation.
3. **Bidi isolation, not just direction.** Apply `<bdi>` / `dir=` to phone numbers, OTP codes, IBANs, currency and keyboard shortcuts. Oratiq's own published component-source comparison (July 2026) counts **24 bidi-isolation sites in Oratiq versus 0 in shadcn/ui** — this is the difference between "an Arabic site" and "an Arabic site that renders broken numbers".
4. **Arabic type needs its own scale.** The repo's font stack is Cairo (Arabic body), Almarai (Arabic display), Tajawal (alternate) and Montserrat (Latin / numerals), loaded through `next/font` rather than declared as `tokens.css` variables. Consider **IBM Plex Sans Arabic** (open, free) or **Thmanyah** (the Saudi face NYX bundles). **Never `Inter` for Arabic.** Keep the existing generous `--ds-leading-body: 1.85` (`smart-platform/styles/tokens.css:129`).
5. **Audit locale URLs before launch.** Tabby's `tabby.ai/ar` 404s — its real locales are `/ar-AE`. Salla's `/ar` renders thin and client-side.

## 7. Reference intelligence — patterns to copy, not assets

| Site        | Pattern worth copying                                                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zid**     | The hero is a **merchant-story carousel, not a product pitch** — every slide is a named merchant plus an outcome number. Evidence beats claims. Best pattern in the market for a no-designer team.        |
| **Wafeq**   | The compliance moat is in the headline ("ZATCA-compliant e-invoicing for Saudi businesses"), plus **numeric proof as a persistent band above the fold** ("4.8 average rating"), not buried in a carousel. |
| **Qoyod**   | **Lead with the regulatory deadline, not the product.** Compliance _is_ the hero. Then a "choose the product that fits your business" module grid.                                                        |
| **Foodics** | Category-defining verb phrase as the hero rather than a product name; a logo cloud phrased as a sentence; **kashida/tatweel elongation in Arabic headlines** as a free, purely-Arabic visual accent.      |
| **Tamara**  | **Max ~4 Arabic words in the hero** — Arabic display type cannot carry a long headline. Licensing disclosure in the footer, which reads as maturity in KSA.                                               |
| **Moyasar** | **Their FAQ is their product page** — the real Arabic buying objections (fees, "can I activate before my site is live?", security). Promote competitor FAQ answers into on-page sections.                 |

**Do not copy** the dense, dated grids of traditional Qoyod / Odoo / SAP B1 interfaces. That is the differentiation opportunity, not a template.

## 8. Sequenced next moves

| #   | Action                                                                                                                                                                                                                                                                                                                            | Effort            | Risk                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------- |
| 1   | Fix the brand drift: `primary-600 = #0552E0`, demote `#2548D9` to `primary-500`, replace `#B8733A` bronze fills with `#A36744`, ban gold + white text                                                                                                                                                                             | ~2h               | medium              |
| 2   | Mint four scales via BeanToolBox into `tokens.css`; add `tests/tokens.contrast.test.ts`                                                                                                                                                                                                                                           | ~1 day            | none                |
| 3   | Buy Tailwind Plus ($299); harvest spacing rhythm, type scale, section order and app-shell layout; re-typeset in Arabic                                                                                                                                                                                                            | ~1 day to harvest | spend decision      |
| 4   | Adopt DGA Platforms Code specs into the existing `/design-system` page as the decision reference                                                                                                                                                                                                                                  | ~2 days           | none                |
| 5   | Add Tremor Blocks non-chart blocks (KPI cards ×29, form layouts ×6, banners ×5); port chart compositions to ApexCharts                                                                                                                                                                                                            | ~1 week           | Recharts temptation |
| 6   | ESLint rule banning physical direction utilities, plus a `<bdi>` pass on numerals; verify on `/ar` screenshots                                                                                                                                                                                                                    | ~3 days           | none                |
| 7   | **Deferred:** daisyUI 4 → shadcn/ui migration. Both run on Tailwind 3.4.17, so it is the one migration possible today. 47 of 161 `.tsx` files import `react-daisyui`; ≈900 daisyUI class sites. Realistic cost **3–6 dev-weeks**, done incrementally with daisyUI still installed. Defer until the Tailwind 4 + React 19 upgrade. | —                 | —                   |

**Step 1 is not a one-token edit.** The same commit must also move the tokens that hardcode the old palette — `--ds-gradient`, `--ds-gradient-bright`, `--ds-gradient-dark`, `--ds-shadow-glow`, `--ds-info-500`, and, if bronze moves at token level, `--ds-gradient-bronze` and `--ds-shadow-bronze` — otherwise hero gradients and glows keep the old indigo while the CTAs move to the new blue. Per the repo `AGENTS.md` context-sync rule, the same commit also carries `.agents/context/best-practices/ux-ui.md` (which describes the palette as "indigo-royal"), the `/design-system` page swatches, and the Do / Don't rules.

**Step 4 is gated on a licence check.** Adopting DGA specs is a reading-and-deciding exercise, so it carries no code risk — but confirm the official licence (§3.3) before any DGA code is vendored, and if it is vendored, vendor `NDS-vanilla` rather than the community registry, whose payload would overwrite `smart-platform/styles/tokens.css`.

### 8.1 Recommendation on layer 2 (the component foundation)

**Do not migrate off daisyUI yet.**

The token system (`smart-platform/styles/tokens.css`) and the landing components are already token-driven — the weak link is **daisyUI's generic component look**, not the colours. Buy the art direction, anchor the decisions, enforce RTL, and time the shadcn migration to ride along with the inevitable Tailwind 4 / React 19 upgrade.

## 9. Sources

- <https://beantoolbox.com/tools/color-scale-builder>
- <https://www.tints.dev/>
- <https://github.com/tailwindlabs/tailwindcss/issues/14499>
- <https://ui.shadcn.com/docs/rtl>
- <https://ui.shadcn.com/docs/theming>
- <https://v3.shadcn.com/docs/installation/next>
- <https://ui.shadcn.com/docs/components-json>
- <https://blocks.tremor.so/getting-started>
- <https://blocks.tremor.so/license>
- <https://vercel.com/blog/vercel-acquires-tremor>
- <https://registry.npmjs.org/@tremor/react/latest>
- <https://tailwindcss.com/plus/ui-blocks>
- <https://github.com/tailwindlabs/tailwind-plus-issues/issues/1680>
- <https://github.com/mantinedev/next-pages-template>
- <https://mantine.dev/styles/rtl/>
- <https://help.mantine.dev/q/third-party-styles>
- <https://registry.npmjs.org/@heroui/theme/latest>
- <https://github.com/heroui-inc/heroui/discussions/6312>
- <https://github.com/heroui-inc/heroui/discussions/6061>
- <https://github.com/radix-ui/themes/issues/539>
- <https://github.com/radix-ui/themes/issues/11>
- <https://github.com/radix-ui/themes>
- <https://github.com/radix-ui/themes/pull/161>
- <https://www.untitledui.com/pricing>
- <https://github.com/shadcndashboard/shadcndashboard>
- <https://github.com/cosscom/coss>
- <https://tailadmin.com/pricing>
- <https://tailadmin.com/docs>
- <https://preline.co/docs/>
- <https://nextadmin.co/pricing>
- <https://shadcnstudio.com/pricing>
- <https://dashboardpack.com/theme-details/apex-dashboard-nextjs/>
- <https://www.radix-ui.com/colors/docs/overview/custom-palettes>
- <https://caniuse.com/mdn-css_types_color_oklch>
- <https://github.com/adobe/leonardo>
- <https://oss.dga.gov.sa/en/products/6c0378d656d94cfba6981a7862f05303>
- <https://www.npmjs.com/package/@dev-dga/react>
- <https://noorui.com/rtl-guide>
- <https://github.com/ositaka/noor-ui>
- <https://github.com/kasimmj/arabic-ui-kit>
- <https://registry.npmjs.org/@1001tv/manara>
- <https://github.com/fadyehabamer/NYX>
- <https://font.thmanyah.com/>
- <https://oratiq.com/>
- <https://github.com/satnaing/shadcn-admin>
- <https://github.com/arhamkhnz/next-shadcn-admin-dashboard>
- <https://www.wafeq.com/ar-sa/saas-demo>
- <https://www.qoyod.com/ar>
- <https://www.foodics.com/ar/>
- <https://www.zid.sa/ar/>
- <https://tamara.co/ar>
- <https://moyasar.com/ar>
- <https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html>
- <https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast>
- <https://www.w3.org/WAI/WCAG22/Understanding/use-of-color>
- <https://dga-registry.vercel.app/>
- <https://github.com/mazin-musleh/NDS-vanilla>
