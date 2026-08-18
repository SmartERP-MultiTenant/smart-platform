<!-- Context: docs/design-synthesis | Priority: high | Version: 1.0 | Updated: 2026-08-18 -->

# SMART ERP — Design System Synthesis (Competitor-Driven v2)

**Goal:** upgrade the SMART ERP design system and tokens by adopting the **best design patterns** from 15 Arab-world SaaS/ERP competitors, while keeping a **premium, human-made** feel (explicitly NOT "AI-generated" looking).

**Method:** 15 screenshots analyzed (vision), live sites fetched, official brand guidelines read (Zid, Salla, Wafeq).

---

## 1. The winners and what we take from each

| Competitor            | Design quality | What we ADOPT                                                                                                                                                                                                                                       |
| --------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zid**               | ★★★★★          | Dark cinematic hero with deep royal background; bold lavender-purple pill CTA on dark; huge extra-bold Arabic headline; emoji announcement bar for human warmth; brand-story-first hero (no product grid clutter).                                  |
| **Salla**             | ★★★★½          | Floating browser-mockup hero with real dashboard data; massive stat numbers (68,000+ stores); trust chips; seasonal campaign banner; **Almarai** Arabic font (they use it — it reads premium); generous whitespace.                                 |
| **Wafeq**             | ★★★★           | Deep indigo primary (#3A54CF/#505EDD); dark navy (#1C2041) surfaces; warm orange accent (#FD6D00/#FFC01D); triple-overlapping product screenshots with layered shadows; ISO/regulatory badges above the fold; inline bold accent word in body copy. |
| **Moyasar**           | ★★★★           | Dark hero with dramatic lighting; dashboard-as-hero (product UI is the star); high-contrast lifestyle photography; ghost buttons on dark.                                                                                                           |
| **Tabby**             | ★★★★           | One brave signature color (neon green) used fearlessly; minimal black pill buttons; line-art illustration crowd; confident, non-template brand moment.                                                                                              |
| **Tamara**            | ★★★★           | Floating card layering over a central hero image; soft shadows; rounded 16–24px cards; playful small SVG decorations to soften a fintech brand.                                                                                                     |
| **Daftra**            | ★★★½           | Browser-chrome dashboard mockup with traffic-light dots; green-checkmark trust chips row (free trial / no credit card / works immediately); feature grid with colored icons.                                                                        |
| **Idaratech**         | ★★★★           | **Hexagonal module ecosystem diagram** (ERP hub with modules radiating); pill CTA with arrow; grayscale client logo bar (gov/banks); orange stat counters.                                                                                          |
| **Envaglo (ZAT)**     | ★★★★½          | Real product dashboard mockup in hero with macOS chrome + actual invoice data; **dark mode with purple/orange glow gradient**; keyword tag row under CTAs.                                                                                          |
| **Snad**              | ★★★½           | 3×3 module icon grid as hero visual; horizontal automation flow chain (sale→inventory→journal→invoice→report); dark primary CTA.                                                                                                                    |
| **ZAT CODE**          | ★★★★           | Pill-tag subcategories under feature cards; numbered step accordion in dark section; teal-green success accent.                                                                                                                                     |
| Qoyod / Odoo / SAP B1 | —              | Screenshots failed (403). Per research docs: their design is **dense/dated** — this is our differentiation opportunity, NOT to copy.                                                                                                                |

## 2. The premium "human-made" rules (anti-AI-slop)

1. **One strong signature color + a warm secondary** — not a generic purple-blue gradient on white. We keep SMART ERP's brand blue, deepen it to an indigo-royal, and pair with a **warm bronze/copper accent** (already in our tokens, rare in the market → distinctive).
2. **Dark surfaces used with intent** — a deep ink-navy (Zid/Moyasar/Envaglo) for hero + footer + stat bands, giving contrast rhythm instead of all-white.
3. **Real product UI as hero art** — browser/dashboard mockups with genuine data (Salla/Wafeq/Envaglo), never generic stock illustrations.
4. **Typography that feels Arabic-native and premium** — Almarai/Cairo display weights for Arabic, Montserrat for Latin numerals; generous Arabic line-height (1.7–1.9); tight Latin tracking for display.
5. **Elevation = layered soft shadows** (Wafeq's triple-screenshot depth), not heavy drop shadows.
6. **Trust signals above the fold** — compliance badges, stats, client logos (Saudi-market requirement).
7. **Micro-humanity** — pill CTAs with arrows, small SVG decorations, announcement bars with emoji, rounded-but-not-candy radii (8–16px, pill only for CTA).

## 3. Token changes (styles/tokens.css → v2)

- **Colors:** add full scales (primary 50–900, accent bronze scale), semantic tokens (success/warning/danger/info), **ink/dark tokens** for dark surfaces, glint stays.
- **Primary:** deepen from #1565E0 toward a royal indigo-blue (Wafeq-informed) with a full scale.
- **Accent:** keep bronze #B8733A family + add a warm gold highlight for pricing/premium.
- **Typography:** h1 56/64, h2 40, h3 28, body 17, caption 13; add display tokens; Arabic line-height token.
- **Radius:** add pill (9999px) + xl (20px); keep 8/12/16.
- **Shadows:** 3-tier layered (Wafeq) + glow for dark sections.
- **Gradients:** brand gradient (blue→indigo), dark hero gradient (ink→indigo glow), bronze gradient (premium).

## 4. Page changes (pages/design-system.tsx → v2)

- **New dark hero** for the page itself (Zid-style) with the SMART ERP brand gradient + glow.
- **Colors section:** show full scales (not single swatches) + semantic colors + ink/dark tokens.
- **Typography:** display sample on dark, Arabic type scale with proper line-heights, font families (Almarai/Cairo/Montserrat/Tajawal).
- **Buttons:** add pill variant (Zid/Idaratech), arrow CTA, dark-surface button, icon button; keep solid/outline/ghost/link + sizes + disabled.
- **Cards:** pricing card with bronze "most popular" (already exists — refine), feature card with icon tile, **stat card on dark** (Salla/Idaratech), layered product-mockup card (Wafeq depth), floating composition (Tamara).
- **Badges:** compliance-style badges (ZATCA/ISO-like), status pills, tag pills (ZAT CODE), grayscale client logo bar (Idaratech).
- **Alerts:** keep semantic set, align to new tokens.
- **New "Dark surfaces" section:** hero band, stat band, CTA band on ink with glow (Envaglo).
- **New "Trust signals" section:** stats row + compliance chips (Daftra green checks) + client logos.
- **Usage rules:** update Do/Don't to encode the new rules (pill CTA only for actions, dark surfaces reserved, etc.).

## 5. Sources

- Screenshots: `docs/competitor-screenshots/*.png` (15 sites)
- Brand guidelines: brand.zid.sa/color (full palette) · brand.salla.com (Almarai, ping AR) · wafeq.com live fetch (indigo #3A54CF family, navy #1C2041, orange #FD6D00)
- Research docs: `docs/competitor-design-research.md` · `docs/erp-competitor-research.md`
