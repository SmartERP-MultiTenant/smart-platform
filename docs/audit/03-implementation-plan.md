# SMART ERP — Implementation Plan (website redesign)

**Basis:** audit report (`01-audit-report.md`) + locked decisions (`02-decisions.md`)
**Sequence:** 5 phases, each with deliverables and exit criteria. Phase 0 is done (this audit).

---

## Phase 1 — Design system + content model

**Goal:** the foundation. Nothing in later phases is built until tokens, typography, RTL, and the content source are real.

### Workstreams

1. **Design tokens** (`styles/tokens.css`)
   - Convert the brand (blue `#1e40af`/`#3b82f6`, orange `#f97316`, Cairo) into CSS custom properties: color scale, spacing, radii, typography scale, shadows.
   - Replace the `!important` override block in `HomePage.jsx` with token-driven styling; keep the admin theme editor functional by mapping its controls → token values.
2. **Typography & RTL** — single font strategy (Cairo, subsetted/local, `font-display: swap`; drop the other 7 families), proper RTL baseline (`dir` per locale, logical properties), type scale tokens.
3. **i18n** — react-i18next (or equivalent): locale files per feature, interpolation/plurals, `hreflang` + `canonical` per locale, `lang`/`dir` from config. Migrate the `_ar`/`_en` ternary soup.
4. **Content model + API (contract-first)**
   - Schema: `SiteContent` (general, hero, features[], services[], about, testimonials[], clientLogos[], contact, registerPage, paymentPages) — one document per locale + theme block.
   - Endpoints (coordinate with `SmartERP.API`): `GET /api/content?locale=ar|en` (public, cacheable), `PUT /api/content` + `Assets/upload` (admin auth), `POST /api/contact`.
   - Frontend: content hook with fetch + cache + fallback to `defaultContent` while offline/unreachable; remove `localStorage` as source of truth.
5. **Stack bump** (bundled here): Vite 4 → current, Tailwind 3 → current, React 18 → 19 (only if deps allow), keep radix components.

### Exit criteria

- Visitor sees admin-published content (end-to-end with a stub/mock backend if the real one lags).
- Tokens drive the UI; no `!important` overrides remain for theme colors.
- Both locales render correct `dir`/`lang`; Lighthouse a11y ≥ 95 on the landing.

---

## Phase 2 — Restructure + build

**Goal:** feature-based architecture, god files split, dead code gone, TypeScript on.

### 4.1 Target structure

```text
src/
├── app/                        # shell: router, providers, error boundary
│   ├── router.tsx
│   └── providers.tsx
├── pages/                      # thin route wrappers
│   ├── home/index.tsx
│   ├── register/index.tsx
│   ├── payment/success.tsx · failed.tsx
│   └── admin/index.tsx (untouched this cycle)
├── features/                   # product modules (each: components + logic colocated)
│   ├── landing/                #   header, hero, features, services, about,
│   │                           #   testimonials, contact, footer
│   ├── registration/           #   wizard (split from 712-line page)
│   ├── payments/               #   modal + providers: moyasar, applepay, tabby, tamara
│   ├── admin/                  #   auth + dashboard (future cycle)
│   └── content/                #   types, hooks, api client for content
├── components/                 # shared presentational components (only what's used)
├── ui/                         # design-system components (pruned shadcn subset, 13 used)
├── lib/                        # utils, api client (typed), guards
├── hooks/
├── styles/                     # tokens.css, globals.css
└── types/                      # domain + API contract types
```

### Workstreams

1. **Prune** — delete the 43 unused `ui/*` files + 4 dead components + stale `dist/` artifacts; verify with import graph.
2. **Split god files** — `RegisterPage` → `features/registration` (plan-step components + validation); `PaymentModal` → `features/payments` (provider adapter per gateway: `moyasar`, `applepay`, `tabby`, `tamara`); keep behavior identical.
3. **TypeScript migration** — tsconfig strict, convert per module (landing → registration → payments → admin last), typed API client for `services/api.js`.
4. **Horizons plugins review** — keep only what production needs; dev-only plugins stay dev-only; remove injected prod scripts that duplicate the app's own error handling (or gate them behind a flag).
5. **Code splitting** — route-level lazy loading (`/admin/*` especially — it should not ship in the landing bundle), `manualChunks` for radix/framer.

### Exit criteria

- `npm run build` clean; landing bundle drops below ~200 KiB gz total.
- Zero unused files in `src` (import-graph check passes).
- All existing routes/behaviors pass a manual smoke test (register + each payment method with test mode).

---

## Phase 3 — Quality

**Goal:** enterprise-grade readiness gates.

- **Performance budgets** in CI: LCP ≤ 2.5 s, bundle ≤ 220 KiB gz, no >100 KiB unoptimized images. Optimize hero image (WebP/AVIF, sized, `fetchpriority=high`, `width/height` set).
- **a11y** — fix button-name, color-contrast (gradient text on image), heading-order, unsized images; keyboard + screen-reader pass on funnel; RTL parity.
- **SEO** — canonical/hreflang per locale, `robots.txt`, `sitemap.xml`, structured data (Organization + Product for plans), OG image.
- **Security** — `.env*` + `dist/` out of git, `.env.example` added, `npm audit` gate, security headers (CSP reviewed with the Horizons editor in mind), token expiry handling for admin.
- **Tests + CI** — Vitest + React Testing Library for content hook, registration validation, payment payload builders; Playwright smoke (landing, register, payment success/fail); GitHub Actions: lint → typecheck → test → build → audit.

### Exit criteria

- Lighthouse mobile: Performance ≥ 90, a11y ≥ 95, BP ≥ 95, SEO ≥ 95.
- CI green on every PR; test coverage ≥ 70% on funnel logic.

---

## Phase 4 — Deploy + measure

- Deploy pipeline (build artifacts to hosting, never `dist/` in git), caching headers tuned (immutable hashed assets; HTML revalidate).
- Monitoring: error tracking (replace Horizons console hooks if duplicated), Core Web Vitals dashboard (RUM).
- **Compare vs Phase-0 baseline**: Lighthouse mobile (Perf 62 / a11y 89 / BP 96 / SEO 100; LCP 6.4 s; 1,355 KiB) → target (Perf ≥ 90 / a11y ≥ 95; LCP ≤ 2.5 s; ≤ ~450 KiB). Numbers, not vibes.

### Exit criteria

- Before/after report with the same tooling; new baseline committed to `docs/audit/`.
- Post-launch CWV in the green for 7 days.

---

## Phase 5 (follow-up, out of scope this cycle) — Admin dashboard

Split `AdminDashboard.jsx` (2,682 lines) into `features/admin/*` (auth, packages, tenants, orders, content editor, theme editor) on top of the Phase-1 design system.

---

## Risks & mitigations

| Risk                                                       | Mitigation                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| Content API lands late (backend dependency)                | Contract-first in Phase 1; mock adapter keeps frontend unblocked   |
| Payment behavior regression                                | Provider adapters with test-mode smoke tests; feature-flag rollout |
| Horizons hosting constraints (inline editor, allowedHosts) | Keep the editor surface; isolate it behind the content API         |
| TS migration cost on 2,682-line admin                      | Admin converted last; JSX-allowlist until then                     |
| Scope creep into admin                                     | D1 boundary enforced; admin is a separate tracked workstream       |

## Suggested build order (first sprint)

1. Tokens + typography + RTL baseline (Phase 1.1–1.2)
2. Content API contract + hook with mock adapter (1.4)
3. i18n migration of landing copy (1.3)
4. Prune dead code + feature-based skeleton for landing (2.1–2.2)
5. Landing visual redesign on the new foundation (design pass, per user's request)
6. Funnel (registration + payments) migration (2.2)
