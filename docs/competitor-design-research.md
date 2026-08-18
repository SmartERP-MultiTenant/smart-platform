<!-- Context: docs/competitor-design-research | Priority: high | Version: 1.0 | Updated: 2026-08-17 -->

# SMART ERP — Arab-World Competitor Design Research

**Goal:** study the most famous Arab (esp. Saudi/GCC) SaaS platforms similar to SMART ERP — their landing design, section structure, and positioning focus — to plan our design and pages.
**Screenshots:** `docs/competitor-screenshots/*.png` (hero viewport captures, taken 2026-08-17).
**Companion docs:** `docs/audit/*` (old app) · `.agents/context/` (new shell knowledge).

---

## 1. Shortlist

| Platform           | Type                       | Country      | What to learn                                                    | Screenshot                              |
| ------------------ | -------------------------- | ------------ | ---------------------------------------------------------------- | --------------------------------------- |
| **سلة Salla**      | E-commerce SaaS            | KSA (Makkah) | The region's flagship landing: sections, stats, ecosystem        | `competitor-screenshots/cs-salla.png`   |
| **زد Zid**         | E-commerce SaaS            | KSA          | Merchant-focused funnel, trust                                   | `competitor-screenshots/cs-zid.png`     |
| **قيود Qoyod**     | Cloud accounting (ERP-ish) | KSA          | ZATCA compliance trust, accounting hero                          | `competitor-screenshots/cs-qoyod.png`   |
| **وافق Wafeq**     | Cloud accounting           | KSA          | Direct competitor positioning (vs Qoyod), pricing 99 SAR         | `competitor-screenshots/cs-wafeq.png`   |
| **تمارا Tamara**   | BNPL / payments            | KSA          | Sharia-compliance trust, consumer benefits, FAQ in Saudi dialect | `competitor-screenshots/cs-tamara.png`  |
| **تابي Tabby**     | BNPL / payments            | UAE/KSA      | Financial trust + partner ecosystem                              | `competitor-screenshots/cs-tabby.png`   |
| **ميسر Moyasar**   | Payment gateway            | KSA          | Our payment partner — clean B2B dev-first design                 | `competitor-screenshots/cs-moyasar.png` |
| **فوديكس Foodics** | POS / restaurant SaaS      | KSA          | Vertical SaaS (closest to "ERP modules" structure)               | `competitor-screenshots/cs-foodics.png` |

---

## 2. Per-platform design cards

### سلة Salla (salla.com) — the benchmark landing

- **Positioning:** "تجارة ذكية وسهلة" (smart, easy commerce) — outcome-led, not feature-led. Built for Saudi/UAE merchants explicitly.
- **Section map (top→bottom):**
  1. Nav: logo, solutions, pricing, customers, resources, language switch, **CTA: register**
  2. **Hero:** H1 "سلة.. تجارة ذكيَّة وسهلة" + subhead (create store in minutes, payments/shipping/inventory/marketing) + register CTA + product UI shot
  3. **Stats band:** +68,000 active stores · 15M orders/day · sales in SAR
  4. **Customer journey blocks** (حلول تدعمك بكل خطوة): إنشاء وتدشين المتجر → تصميم المتجر → المدفوعات → الشحن والتوصيل → التسويق → التوسّع — each = icon + 3 bullets + visual (journey narrative!)
  5. **Social proof:** "1 من كل 3 في السعودية اشترى من متاجر سلة" · "82% ثقة العملاء"
  6. **Ecosystem/marketplace:** محلي (local platform) + 1,000+ merchant services
  7. **Final CTA:** "امتلك متجرًا احترافيًا في سلة"
  8. **FAQ** + footer (compliance, links)
- **Visual style:** light, purple/violet primary, big product screenshots, framer animations, generous whitespace.
- **Design takeaways:** journey-based sectioning (not feature grid), massive stat social proof, explicit "made for Saudi/UAE" local framing, multiple CTAs always visible.

### تمارا Tamara (tamara.co/ar-sa) — trust-led B2C + B2B

- **Positioning:** "حلمك بيدك" + **Sharia-compliant**, no late fees, split up to 24 months. Dual audience nav (للأفراد / للأعمال).
- **Section map:** hero (app download + Sharia badge) → benefits (no late fees, flexible plans, tuition, cashback) → stores → smart product (pricing: free first month, 19 AED/mo) → **Tamara for Business** (انضم الآن) → privacy/security → **FAQ in Saudi dialect** → footer with **SAMA license number + capital + CR** (regulatory trust).
- **Visual style:** bold, illustration-led, dark hero, video-rich, rounded 3D illustrations.
- **Design takeaways:** trust is front-and-center (Sharia badge in hero, regulatory IDs in footer), dialect-specific Arabic copy (وش/وين/ليش), "للأفراد/للأعمال" segmentation pattern, video in hero.

### قيود Qoyod & وافق Wafeq — accounting/ERP competitors

- **Qoyod:** first 100% Saudi cloud accounting; **ZATCA-approved** (e-invoicing) is the #1 trust signal; two editions (business owners / accountants); 25,000+ companies; 14-day free trial; ecosystem (POS, restaurants, services).
- **Wafeq:** positions directly against Qoyod on price (plans from 99 SAR/mo), users count, AI automation; 40+ financial reports; Riyadh HQ.
- **Design takeaways (both):** **compliance badges (ZATCA) above the fold**, "Saudi-built/trusted" framing, clear plan pricing with free trial, accountant-specific paths, and — importantly — their design quality is average (dense, dated); a cleaner, modern ERP landing is a real differentiation opportunity.

### ميسر Moyasar (moyasar.com/ar) — our payment partner

- Clean developer-first B2B design; merchant signup + docs; unified payment APIs. Takeaway: as a partner, feature their badge/logo in our payment sections (trust transfer).

---

## 3. Cross-cutting patterns (what every winner does)

1. **Section template (the region's standard landing):**
   Nav (CTA: register) → Hero (H1 outcome + subhead + 2 CTAs + product visual) → **stats band** (store/company counts, SAR figures) → journey/features (6 blocks max) → **social proof** (testimonials, "1 من كل 3", %) → pricing teaser → ecosystem/partners → **final CTA** → **FAQ** → footer (compliance, links, contact).
2. **Trust hierarchy (Saudi-specific):** ZATCA compliance / SAMA license / Sharia compliance > customer counts (25k, 68k) > named customers & logos > testimonials > security statements. Trust must appear **in the hero and in the footer**.
3. **Local framing:** "مصمم للسوق السعودي"، SAR pricing, Saudi dialect in FAQ, Saudi support hours, ZATCA e-invoicing, Mada/Apple Pay/Tabby/Tamara payment badges.
4. **Funnel pattern:** Landing → pricing (3 tiers, monthly/annual, popular middle, free trial/14 days) → register (phone/email + company) → payment (card + local methods) → success (next steps + support) → dashboard.
5. **RTL design:** true RTL mirrored layouts, Arabic typography (Cairo/Tajawal family), LTR toggle for numbers/code, generous line-height for Arabic script.
6. **Segmentation:** "للأفراد / للأعمال" or "أصحاب الأعمال / المحاسبون" — split navigation by audience.

---

## 4. Gaps & opportunities for SMART ERP

| Competitor weakness                                        | SMART ERP opportunity                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Salla/Zid = e-commerce only; Qoyod/Wafeq = accounting only | **Full ERP positioning** (HR + inventory + accounting + projects in one) — own the "نظام متكامل" message   |
| Accounting sites' design is dated/dense                    | Modern, clean, token-driven design with great CWV — stand out                                              |
| None show multi-module product UI prominently              | Interactive dashboard/product mockup in hero                                                               |
| Trust signals scattered                                    | **Consolidated trust band**: ZATCA-style compliance (once certified), SAR pricing, Saudi support, security |
| English-first or weak bilingual                            | Arabic-first RTL with full EN parity (the regional winners are Arabic-first)                               |

---

## 5. Page-by-page design plan for SMART ERP (draft)

**Home (`/`) — section order (informed by Salla/Tamara):**

1. Nav — logo, modules, pricing, customers, contact, **language toggle** (AR/EN), CTA: ابدأ الآن
2. **Hero** — H1: outcome-led (e.g. "نظام ERP متكامل لمؤسستك… كل عملياتك في مكان واحد") + subhead + 2 CTAs (ابدأ الآن / شاهد العرض) + product dashboard mockup + trust chips (ضريبي، سعودي، آمن)
3. **Stats band** — 500+ عميل · 10+ سنوات · 24/7 دعم · 15+ دولة (from old content)
4. **Modules** (6 cards) — محاسبة · مخزون · موارد بشرية · مبيعات/مشتريات · مشاريع · تقارير (journey-free grid is fine here)
5. **Pricing teaser** — 3 باقات (أساسية 999 / متقدمة 1999 / مؤسسية حسب الطلب) + 14 يوم تجربة
6. **Testimonials + client logos**
7. **Final CTA** — "ابدأ تجربتك المجانية"
8. **FAQ** (Saudi dialect) + **Contact** + Footer (compliance, phone, email)

**Pricing (`/pricing`)** — highest-intent page: 3 tiers, popular highlight (orange), monthly/quarterly toggle, feature comparison table, FAQ, final CTA.

**Register (`/register`)** — 2-step: plan confirm → company+owner form (subdomain + email availability live-check, reuse old `TenantRegistration` API) → success with next steps.

**Payment (`/payment`)** — provider grid (card/Mada, Apple Pay, Tabby, Tamara) with partner badges; Moyasar iframe; success/fail pages with clear next actions.

**Admin login (`/admin`)** — separate brand surface, email+password → dashboard (new admin cycle).

**Mapped to the shell:** home = `pages/index.tsx` (public, add to middleware allowlist), pricing/register/payment = new public routes, success/fail = new routes, admin = `pages/admin/*` (future cycle). i18n via `locales/{ar,en}/common.json` — **add `ar` locale now** (currently only `en` exists).

---

## 6. Sources

- salla.com · zid.sa · qoyod.com · wafeq.com · tamara.co/ar-sa · tabby.ai · moyasar.com/ar · foodics.com
- azdan.com (15 ZATCA-approved systems) · it.com.sa (Salla vs Zid) · voxire.com (Arabic landing conversion 2×) · okasha.cv (Arabic B2B landing ≠ translation) · adzyon.com (GCC landing architecture) · falakcompany.com (MENA SaaS playbook)
