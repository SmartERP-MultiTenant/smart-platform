# SMART ERP — Phase 0 Audit Report

**Repo:** `Multi-Tenant-Platform` (frontend) · **Branch:** `development`
**Date:** 2026-08-17 · **Scope:** full website (landing + funnel + admin) per the decision workshop
**Method:** source inspection, import-graph analysis, production build analysis, Lighthouse (mobile) baseline

---

## 1. Executive summary

The site is a Vite + React 18 + Tailwind v3 single-page app with a small backend integration surface (`SmartERP.API`). It works, but it is structured like a prototype, not a product:

- **Content & theme "CMS" is browser-local.** Admin edits are saved to `localStorage` (`smarterp_content`) — visitors never see them. The contact form stores messages in `localStorage` and sends nothing anywhere.
- **Monoliths.** `AdminDashboard.jsx` (2,682 lines), `RegisterPage.jsx` (712), `PaymentModal.jsx` (420).
- **Dead weight.** 43+ of 57 `components/ui` files are imported nowhere; 4 section components are dead; `dist/` contains stale build artifacts and is committed to git.
- **Performance.** Mobile Lighthouse **Performance 62**; LCP **6.4 s** (target ≤ 2.5 s), driven by a **532 KiB** unoptimized Unsplash hero image and a 474 KiB JS bundle; 1.36 MB total page weight.
- **Aging stack, no TS, no tests/CI**, no proper i18n, `!important`-based live-theming (a ~100-line inline `<style>` override block injected on every page).
- **Platform coupling.** 4 custom Vite plugins + 4 injected inline scripts ("Horizons" hosting editor/error-reporting) run in production.

The good news: the surface area is small (≈ 20 real source files), the backend API layer is cleanly isolated (`src/services/api.js`), and the visual design direction (RTL Arabic, Cairo, blue→orange) is a real brand.

---

## 2. Repo facts

| Item      | Value                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| Stack     | Vite 4.4.5 · React 18.2 · Tailwind 3.3 · react-router 7.15 · framer-motion 10 · shadcn/ui (Radix)                  |
| Languages | JSX only (`jsconfig.json`), no TypeScript                                                                          |
| Git       | 13 commits, 3 authors (Osama, Eslam Osama, smart4-4); branches: `main`, `development` (+ remote `color`, `deploy`) |
| Runtime   | dev on port 3000 (`--host ::`); prod build in `dist/` (Apache via `.htaccess`)                                     |
| Backend   | REST via `src/services/api.js` → `VITE_API_URL` (fallback `http://localhost:5001/api`)                             |

---

## 3. Architecture & structure audit

### 3.1 Findings

| #   | Severity  | Finding                                                                                                                    | Evidence                                                                                                                                  |
| --- | --------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 🔴 High   | **God files** — one file doing the work of a module                                                                        | `AdminDashboard.jsx` 2,682 lines; `RegisterPage.jsx` 712; `PaymentModal.jsx` 420                                                          |
| A2  | 🔴 High   | **Content/theme "CMS" is browser-local** — admin edits never reach visitors                                                | `SiteContentContext.jsx:94` → `localStorage.setItem('smarterp_content', ...)`; read in `SiteContentContext.jsx:16` from the same browser  |
| A3  | 🔴 High   | **Contact form is a fake form** — "sent" messages only land in `localStorage`                                              | `Contact.jsx:17-24` `handleSubmit` → `addMessage(formData)` → `localStorage('smarterp_messages')`; no network call                        |
| A4  | 🟠 Medium | **Dead code everywhere**                                                                                                   | 43+/57 `ui/*` unused; `CallToAction`, `HeroImage`, `ScrollToTop`, `WelcomeMessage` not imported; `use-mobile` only used by dead `sidebar` |
| A5  | 🟠 Medium | **Live theming via `!important` CSS hacks** — ~100 lines of inline `<style>` overriding Tailwind utilities on every render | `HomePage.jsx` `<style>{...}` block; driven by `content.theme`                                                                            |
| A6  | 🟠 Medium | **"i18n" is ternary soup** — `lang === 'ar' ? x_ar : x_en` repeated everywhere, no library, no plural/interpolation        | `Header.jsx`, `Contact.jsx`, `HomePage.jsx`, …                                                                                            |
| A7  | 🟠 Medium | **RTL hygiene gaps** — `index.html` is `lang="en"` with Arabic content; direction only set at runtime                      | `index.html`; `SiteContentContext.jsx:64-67`                                                                                              |
| A8  | 🟡 Low    | **Two 8-font Google Fonts import** — 8 Arabic families (~all weights) loaded, one used                                     | `index.css:1` (`@import` of 8 families)                                                                                                   |
| A9  | 🟡 Low    | **Flat folder structure** — `components/` mixes sections, layout, modal, and the whole UI kit; no feature boundaries       | `src/components/` listing                                                                                                                 |

### 3.2 What's actually used vs dead

**Real surface area (used):** `App`, `HomePage`, `RegisterPage`, `AdminLogin`, `AdminDashboard`, `PaymentSuccess`, `PaymentFailed`, `Header`, `Hero`, `Features`, `Services`, `About`, `Testimonials`, `Contact`, `Footer`, `PaymentModal`, `SiteContentContext`, `defaultContent`, `api.js`, `use-toast`, 13 `ui/*` components, `index.css`.

**Dead (safe to prune in Phase 2):** `CallToAction`, `HeroImage`, `ScrollToTop`, `WelcomeMessage`, `use-mobile`, and 43 unused `ui/*` files (accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button-group, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, drawer, dropdown-menu, empty, field, form, hover-card, input-group, input-otp, item, kbd, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, sidebar, slider, sonner, spinner, switch, table, tabs, toggle-group, toggle(? — used by admin), …). **Verify each with `grep` before deletion**; `toggle`, `skeleton`, `sheet`, `tooltip`, `toast/toaster`, `use-toast`, `dialog`, `input`, `label`, `separator`, `textarea`, `button` are used.

---

## 4. Content & funnel audit

### 4.1 Content inventory (from `src/contexts/defaultContent.js`)

| Section                                                           | Items                                                                            | Bilingual? |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- |
| General (name, phone, email, address, logos, copyright)           | 10                                                                               | ✅ (ar/en) |
| Theme (colors, font sizes, font family, image shapes/anims/scale) | 14                                                                               | n/a        |
| Hero (subtitle, image, 4 benefits, 2 CTAs)                        | 8                                                                                | ✅         |
| Features                                                          | 9 cards (icon, title, description, color)                                        | ✅         |
| Services/pricing                                                  | 3 plans (Basic 999 SAR, Advanced 1999 SAR, Enterprise custom; 6–8 features each) | ✅         |
| About (2 texts, image, 4 stats, 4 values)                         | 14                                                                               | ✅         |
| Testimonials                                                      | 3 (name, role, company, content, rating, avatar)                                 | ✅         |
| Client logos                                                      | 4 (external CDN images)                                                          | ✅         |
| Contact (phones, emails, addresses, hours)                        | 8                                                                                | ✅         |
| Register page + theme                                             | 4 + theme                                                                        | ✅         |
| Payment pages + theme                                             | 4 + theme                                                                        | ✅         |

**Assets:** all images are **external CDN URLs** (`horizons-cdn.hostinger.com`, Unsplash avatars) — `public/` is empty. No local asset pipeline, no image optimization.

### 4.2 Funnel & payments

- **Registration** (`RegisterPage.jsx`, 712 lines, 3-step wizard): plans → company/registration form → success. Uses `getPlans`, `registerTenant`, `checkSubdomainAvailable`, `checkEmailAvailable`.
- **Payments** (`PaymentModal.jsx`, 420 lines): **Moyasar** (card, dynamically injects `moyasar-payment-form@2.2.9` CSS+JS from jsDelivr at runtime), **Apple Pay**, **Tabby**, **Tamara**. All funnel through `POST /payments` on the backend.
- **API layer** (`src/services/api.js`): clean fetch wrapper — registration, packages, payments (4 providers), verify endpoints, admin auth (`/auth/account/Login`), super-admin CRUD, `Assets/upload`. ⚠️ No timeout/retry/abort, no types, `sessionStorage` token, error strings are Arabic.

---

## 5. Performance baseline (production build, mobile)

> Method: Lighthouse (headless Chrome) against the **production build** served statically. Desktop run failed to complete twice (tooling issue, not the site) — re-run later; mobile is the stricter target anyway.

| Metric             | Mobile    | Target   | Status |
| ------------------ | --------- | -------- | ------ |
| **Performance**    | **62**    | ≥ 90     | 🔴     |
| **LCP**            | **6.4 s** | ≤ 2.5 s  | 🔴     |
| FCP                | 5.1 s     | ≤ 1.8 s  | 🔴     |
| Speed Index        | 5.8 s     | ≤ 3.4 s  | 🔴     |
| TBT                | 120 ms    | ≤ 200 ms | 🟢     |
| CLS                | 0         | ≤ 0.1    | 🟢     |
| **Accessibility**  | **89**    | ≥ 95     | 🟡     |
| **Best practices** | **96**    | ≥ 95     | 🟢     |
| **SEO**            | **100**   | ≥ 90     | 🟢     |

### Biggest opportunities

| Item                                                     | Cost                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Unsplash hero image (unoptimized, 532 KiB)               | drives LCP                                                                                       |
| JS bundle `index-1c7edab5.js` — 474 KiB raw / 145 KiB gz | unused JS ~231 KiB savable; no code-splitting/manualChunks                                       |
| CSS — 88 KiB raw / 15 KiB gz                             | ~75 KiB unused rules (Tailwind + dead ui)                                                        |
| Total page weight                                        | **1,355 KiB**                                                                                    |
| Long tasks                                               | 3 (client main thread)                                                                           |
| Console errors at load                                   | `ERR_SSL_UNRECOGNIZED_NAME_ALERT` (external) + `Failed to fetch` (API reachability in audit env) |

**Notes:** `dist/` also contains a **stale second bundle** (`index-9e4d3f04.js` 440 KiB / `index-df246908.css` 88 KiB) not referenced by `dist/index.html` — leftover artifacts.

---

## 6. Quality audit

### 6.1 Security & hygiene

| #   | Severity  | Finding                                                                                                                                                                                                                                                |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | 🔴 High   | **`.env.production` is committed to git** (contains `VITE_API_URL`). Rotate anything sensitive; add `.env*` to `.gitignore` (currently only `node_modules` + `.idea`).                                                                                 |
| S2  | 🟠 Medium | **`dist/` (build artifacts + `.htaccess`) committed to git** — 6 tracked files. Build outputs belong in CI artifacts, not VCS.                                                                                                                         |
| S3  | 🟡 Low    | `X-Powered-By: SMART ERP` header; verbose runtime error hooks (`window.onerror` + `console.error` interceptor + **fetch monkey-patch**) injected into **production** HTML by the Horizons plugin — adds overhead + hides network errors from devtools. |
| S4  | 🟡 Low    | Admin token in `sessionStorage` with no expiry handling; API error messages in Arabic leak backend wording.                                                                                                                                            |
| S5  | 🟡 Low    | No dependency audit tooling (no `npm audit` step in CI — there is no CI).                                                                                                                                                                              |

### 6.2 Accessibility (mobile audit: 89)

Failing audits: **button-name** (unlabeled buttons), **color-contrast** (gradient text/hero over image), **heading-order**, **unsized-images**, image delivery (155 KiB savings). Also: no `aria-label` on icon-only controls, `img` without explicit dimensions in places.

### 6.3 SEO (100 ✅)

`Helmet` per-page titles/descriptions exist on HomePage. Gaps: no `canonical`/`hreflang` (bilingual!), no structured data (Product/Organization), OG image missing, `robots.txt`/`sitemap.xml` absent, `lang` attribute flips at runtime only.

### 6.4 i18n / RTL

Hand-rolled `lang` state + ternary lookups; no pluralization/interpolation; 8-font font import; `dir` set at runtime; hardcoded Arabic/English strings scattered in components (e.g. `Header.jsx` CTA text, `RegisterPage` section labels).

---

## 7. Git / CI / DX

- No CI (no GitHub Actions visible in repo), no lint gate (`lint` script exists, not wired to build), **no tests**.
- `tools/install-missing-components.js` + `tools/generate-llms.js` (LLMs.txt generator) — minor tooling, not versioned-pinned.
- No `.nvmrc` enforcement in CI (file exists, `v18`? — check), no environment examples (`.env.example` missing).

---

## 8. Prioritized remediation roadmap

| Priority | Item                                                                          | Where (Phase)                                |
| -------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| P0       | Real content backend (CRUD + public read) so client edits reach visitors      | Phase 1 (content model) + backend workstream |
| P0       | Contact form wired to backend (or explicitly out of scope)                    | Phase 1                                      |
| P0       | Kill the LCP: optimized/next-gen hero image + bundle splitting + font pruning | Phase 2–3                                    |
| P1       | Split god files; feature-based structure; prune dead code                     | Phase 2                                      |
| P1       | Replace `!important` theming with design tokens + CSS variables done right    | Phase 1–2                                    |
| P1       | TypeScript migration + typed API client                                       | Phase 2 (decision #4)                        |
| P1       | Real i18n (react-i18next or equivalent) + hreflang/canonical + a11y fixes     | Phase 1 + 3                                  |
| P2       | Git hygiene (.env\*, dist, CI, npm audit, lint gate), tests                   | Phase 3                                      |
| P2       | Re-evaluate Horizons plugins coupling (keep only what's needed in prod)       | Phase 2                                      |

---

## 9. File map (as of audit date)

```text
src/
├── App.jsx                        # router + providers (32 lines)
├── main.jsx
├── index.css                      # 8-font import + globals (57 lines)
├── components/                    # flat: sections + PaymentModal + 57 ui/*
├── contexts/defaultContent.js     # all copy + themes (194 lines)
├── contexts/SiteContentContext.jsx# localStorage "CMS" + lang
├── hooks/                         # use-mobile (dead), use-toast
├── lib/utils.js                   # cn() — used by ui
├── pages/                         # HomePage, RegisterPage, AdminLogin,
│                                  #   AdminDashboard(2682), PaymentSuccess, PaymentFailed
└── services/api.js                # fetch wrapper → SmartERP.API
plugins/                           # visual-editor, selection-mode, iframe-restore (4 vite plugins)
tools/                             # generate-llms, install-missing-components
dist/                              # committed build artifacts (stale)
.env.production                    # committed — contains VITE_API_URL
```

_Full Lighthouse JSON saved locally for the before/after comparison (Phase 4)._
