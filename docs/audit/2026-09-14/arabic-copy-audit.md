# Arabic copy & UX audit — public landing and funnel

> **Ticket:** P1.1 · [`86cbbpyev`](https://app.clickup.com/t/86cbbpyev) — "Arabic copy & UX polish pass — all public pages".
> Companion tickets in the same change: **P4.20** (funnel content gaps), **P4.19** (landing media), **P1.x** (shell home button).
> **Repo / baseline:** `smart-platform` · branch `feat/landing-media-content`, stacked on PR #69 (`feat/landing-restructure`).
> **Date:** 2026-09-14.
> **Method:** static review of the rendered-tree sources (`pages/{index,pricing,register,terms,privacy,payment/*}.tsx`,
> `components/layouts/PublicLayout.tsx`, `components/landing/**`, `components/erp/**`), plus `locales/{ar,en}/*.json`
> key-parity and used-key verification via `check-locale.js`.

---

## 1. Honest scope statement — what this audit is and is not

**Screenshots were NOT captured, and no viewport sweep was performed.** Capturing them requires a locally built app
(`npm run build` + `next start`) against a live Postgres, which is outside this change's tooling budget. Rather than
claim a visual verification that did not happen, this document records what _was_ verified mechanically and states
plainly what remains unverified in §5.

What that means in practice: **every claim in §2–§4 is derived from source and locale files and is reproducible by
grep.** No claim in this document depends on having seen the page render.

---

## 2. Surfaces reviewed

| Surface               | Source files                                                                                                         | Verdict                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Landing page          | `pages/index.tsx` + `components/landing/{Hero,Trust,Features,Alternating,Mobile,Testimonials,Cta,Footer}Section.tsx` | reviewed — 5 untranslated literals found and fixed                                  |
| Public shell / header | `components/landing/LandingHeader.tsx`, `components/layouts/PublicLayout.tsx`                                        | reviewed — clean                                                                    |
| Pricing               | `pages/pricing.tsx`                                                                                                  | reviewed — clean (all copy via `t()`)                                               |
| Registration funnel   | `pages/register.tsx`, `components/erp/RegisterFunnel.tsx`                                                            | reviewed — clean                                                                    |
| Payment funnel        | `components/erp/PaymentActivation.tsx`, `pages/payment/{success,failed}.tsx`                                         | reviewed — owned by parallel PRs (#73/#75/#77); no locale collision introduced here |
| Legal                 | `pages/terms.tsx`, `pages/privacy.tsx`                                                                               | reviewed — clean                                                                    |

---

## 3. Untranslated literals found and fixed

`components/landing/MobileSection.tsx` carried the only batch of hardcoded English UI copy left on the landing
surface — the store-badge pair. All five strings were `t()`-less literals in a module-scope array, which is why the
previous audits kept listing them.

| Before (file:line)              | Literal                                       | After (i18n key)                         |
| ------------------------------- | --------------------------------------------- | ---------------------------------------- |
| `MobileSection.tsx:21`          | `'Download on the'`                           | `landing-mobile-store-appstore-eyebrow`  |
| `MobileSection.tsx:22`          | `'App Store'`                                 | `landing-mobile-store-appstore-name`     |
| `MobileSection.tsx:28`          | `'GET IT ON'`                                 | `landing-mobile-store-playstore-eyebrow` |
| `MobileSection.tsx:29`          | `'Google Play'`                               | `landing-mobile-store-playstore-name`    |
| `MobileSection.tsx:99` + `:105` | `'Coming soon'` (×2 — `title=` and `sr-only`) | `landing-mobile-store-coming-soon`       |

### Structural change this required

The array was **hoisted to module scope**, so `t` was not in scope. It is now built inside the component. Two notes
on why the keys are passed as inline string literals rather than held in a variable:

1. `check-locale.js` discovers used keys by **regex over literal call sites**. A key held in a variable (or composed
   at runtime) is reported as _unused_ and **fails the gate** — so `t('landing-mobile-store-appstore-eyebrow')` must
   appear literally. This is recorded as a comment in the file so a future refactor does not trip it.
2. The `sr-only` and `title=` uses share one key because they carry the identical string; the gate counts keys, not
   call sites.

### Brand names are deliberately NOT translated

`App Store` and `Google Play` are identical in both locales. That is correct, not a missed translation: Apple's and
Google's badge guidelines require the store name in Latin script, and the surrounding file already follows this
convention (`landing-mobile-desc` keeps "SMART PLATFORM" in Latin inside Arabic prose). They live in the locale files
so every string in the component is managed in one place — not so that they can be translated.

---

## 4. Arabic copy decisions

The five new strings, with the reasoning that they are native marketing Arabic rather than transliteration:

| Key                                      | Arabic         | English         | Note                                                                                                                                                                                                                              |
| ---------------------------------------- | -------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `landing-mobile-store-appstore-eyebrow`  | `حمّله من`     | Download on the | Apple's Arabic badge eyebrow. Imperative with the doubled shadda on `حمّل`, which is the form Apple and Google use in their own Arabic store badges. A literal translation of "Download on the" would produce the wrong register. |
| `landing-mobile-store-appstore-name`     | `App Store`    | App Store       | Brand name — Latin by guideline, see §3.                                                                                                                                                                                          |
| `landing-mobile-store-playstore-eyebrow` | `احصل عليه من` | GET IT ON       | Google's Arabic eyebrow. `احصل عليه من` is the established phrase for the Play badge; "GET IT ON" has no direct idiomatic equivalent and a word-for-word rendering (`احصل عليه على`) is not Arabic.                               |
| `landing-mobile-store-playstore-name`    | `Google Play`  | Google Play     | Brand name — Latin by guideline.                                                                                                                                                                                                  |
| `landing-mobile-store-coming-soon`       | `قريبًا`       | Coming soon     | Standard product-roadmap Arabic, used elsewhere in this codebase for the same "not yet available" state, so the vocabulary stays consistent across surfaces.                                                                      |

**No em-dash, English punctuation or Latin-script sentence was introduced into the Arabic.** The one retained Latin
token is the brand names in the table above.

---

## 5. What could NOT be verified — and exactly what would verify it

| Unverified item                                                                             | Why                            | What it needs                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **375 px and 768 px layout sweep** for the landing and funnel                               | requires a built app + browser | `npm run build && npm run start`, then a Playwright/DevTools screenshot pass at 375/768 with RTL. **This is the single largest gap in this audit.** |
| Visual confirmation that the badge eyebrows render without truncation inside the badge pill | same                           | the sweep above — `حمّله من` and `احصل عليه من` are 2-word strings and the badge is a fixed-height flex box, so this is plausible-but-unproven      |
| Whether the **live ERP catalogue** supplies Arabic method labels on the payment surface     | needs a running ERP WebAPI     | an integration check against `GET /payments/methods?country=SA`                                                                                     |
| The `en` locale strings rendering in LTR without overflow                                   | same                           | the sweep above                                                                                                                                     |

**Risk assessment of the gap:** the changes here are string substitutions and one module-scope→component-scope move.
No layout container, size class or direction attribute changed. A layout regression is therefore unlikely but is
**not** excluded by this audit.

---

## 6. Adjacent findings closed by this same change

| Finding                                                                                                                   | Ticket        | Verdict                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stale host literal `app.smarterp.sa/dashboard` in the hero mockup chrome — a domain that appears nowhere else in the repo | P4.20         | **fixed** → `erp.smartapro.com`, the real ERP client host per `.agents/context/shared/ecosystem-map.md`                                                                                                                                      |
| Stale `'Samsung Pay'` brand chip in the trust strip                                                                       | P2.15 / PG-22 | **fixed** in PR #76 (same ticket cluster, separate branch)                                                                                                                                                                                   |
| Dead anchors / empty `wa.me/` links                                                                                       | P4.20         | **verified clean** — `href="#features"` (`HeroSection:51`, `FeaturesSection:110`) resolves to `id="features"` (`FeaturesSection:37`); every header nav anchor (`/#home`, `/#about`, `/#features`, `/#pricing`) resolves to a real section id |
| Missing `aria-*` on the landing sections                                                                                  | P4.20         | **not a defect** — 0 icon-only controls on the landing surface; the interactive elements are native links and buttons with accessible names. The real a11y gap was on the **payment method picker** and is closed in PR #75                  |
| Contact channel absent because `NEXT_PUBLIC_SUPPORT_URL` was unset                                                        | P1.3          | **fixed** in PR #76, including the build-arg wiring that made it actually ship                                                                                                                                                               |

---

## 7. Residual risk

1. **No visual verification** (§5). The audit is static-evidence-only and says so.
2. **Five strings, two of which are brand names that look like translations were skipped** — flagged explicitly in §3
   so a future reviewer does not "fix" them.
3. **`check-locale.js`'s used-key discovery is regex-based.** Any future refactor that moves a `t('...')` key into a
   variable will fail the locale gate. This is pre-existing behaviour, now documented in `MobileSection.tsx`.
