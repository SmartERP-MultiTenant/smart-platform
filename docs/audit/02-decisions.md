# SMART ERP — Decision Document (locked)

**Source:** decision workshop (Lavish artifact, 2026-08-17) · **Status:** locked — these four decisions are the foundation for every phase of the redesign.

---

## D1 — Redesign scope: **Landing + funnel (excluding admin)**

> The landing page plus the funnel pages (Register, Payment Success, Payment Failed) are redesigned and restructured first. The admin dashboard is **excluded** from this cycle and gets its own follow-up cycle.

**Implications**

- The new Design System (tokens, typography, components) is built once and shared; admin adopts it later instead of being dragged through this cycle.
- The Phase-0 audit still covers the admin (it is the source of several findings — god file, theme editor) so its issues are known, but fixing it is a separate tracked workstream.
- `AdminDashboard.jsx` (2,682 lines) stays untouched during Phases 1–3; we only ensure nothing we change breaks it (it consumes the same content context and ui components).

**Why:** fastest path to one coherent design system; keeps risk bounded; admin complexity would otherwise slow the landing redesign.

---

## D2 — Visual editor: **Core product feature — the client edits content themselves**

> The client edits text, images, and theme from the dashboard. Therefore content **must become real data** (backend CRUD + public read API), not `localStorage`.

**Implications (this is the biggest architectural pivot)**

- 🔴 **Replace the browser-local "CMS":** admin edits currently persist only to the admin's own `localStorage` (`smarterp_content`). Visitors never see them. This must become a content API:
  - `GET /api/content` (public, cached, per-locale) — what visitors read
  - `POST/PUT /api/content` + `Assets/upload` (admin, authenticated) — what the dashboard writes
  - Versioned/published content so edits can be staged and rolled back
- The contact form must also become real (`POST /api/contact`) or be deliberately dropped.
- Theming stays possible, but implemented with **design tokens** (CSS variables) instead of the current ~100-line `!important` override block.
- The existing inline-editing UX (select element → edit) can be preserved on top of the new data model; the Horizons AST plugins are a build-time nicety, not the content system.

**Why:** without this, "the client edits the site" is a demo, not a product feature.

---

## D3 — Execution approach: **Hybrid — radical restructure reusing what works**

> New feature-based architecture and folder structure, while reusing the working components, content copy, and the API layer.

**What gets reused**

- Content copy (bilingual, in `defaultContent.js`) — moved into the new content model, not rewritten.
- The API service layer (`src/services/api.js`) — refactored into a typed client, endpoints unchanged.
- The 13 ui components actually in use (button, dialog, input, label, separator, sheet, skeleton, toast/toaster, use-toast, toggle, tooltip, textarea).
- Payment integrations (Moyasar, Apple Pay, Tabby, Tamara) — extracted into a `features/payments` module, behavior preserved.

**What gets rebuilt**

- Folder structure (feature-based, see plan §4).
- Theming/tokens, i18n, and the content data layer.
- God files split (`RegisterPage` 712 lines, `PaymentModal` 420) into feature modules.
- Pruning of all dead code (43+ ui files, 4 dead components, stale `dist/`).

**Why:** speed + low risk of breaking existing behavior (especially payments and the editor), with an enterprise-grade end state.

---

## D4 — Language: **Yes — migrate to TypeScript before the rebuild**

> Migration happens **before** the rebuild lands, so the new structure is born typed.

**Implications**

- `tsconfig` + `jsconfig` migration path; `strict: true`; convert incrementally per feature module (landing first).
- Typed API contracts for every `src/services/api.js` call (request/response types from the backend or OpenAPI if available).
- Type-safe content model (generated types from the content schema).
- Vite 4 → current Vite, Tailwind 3 → current, React 18 → 19 decision made in Phase 1 (version bump bundle).

**Why:** enterprise standard, catches errors before runtime, cheaper now than after the rebuild.

---

## Out of scope (this cycle)

- Admin dashboard redesign (D1) — tracked as a follow-up.
- Backend implementation of the content API — requires a `SmartERP.API` workstream (contract-first: define the endpoints in Phase 1, coordinate with the backend team).
