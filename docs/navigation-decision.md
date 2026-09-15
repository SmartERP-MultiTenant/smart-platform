# Navigation Architecture & Decision Log — SMART PLATFORM

**Scope:** Public Header, Funnel Navigation, and Auth Routing  
**Date:** 2026-09-10  
**Status:** Canonical Decision (Signed Off)

---

## 1. Primary CTA: Registration Funnel (`/register`)

- **Rule:** Every primary Call-To-Action (CTA) on public-facing marketing surfaces must point to the **SMART PLATFORM SaaS registration funnel (`/register`)**.
- **Surface Coverage:**
  - Header Primary Button: `/register` ("ابدأ الآن" / "Get Started")
  - Hero Section Primary CTA: `/register` ("ابدأ تجربتك مجانًا" / "Start for Free")
  - CTA Section: `/register` ("ابدأ تجربتك مجانًا" / "Start Your Free Trial")
  - Pricing Page Plan Buttons: `/register?package=<id>`
- **Rationale:** Prospective enterprise buyers and business owners require a full SaaS tenant setup (ERP tenant provisioning, subdomain allocation, database setup, and trial subscription), which is executed via `/register`.

---

## 2. Secondary Action: Account Login (`/auth/login`)

- **Rule:** Existing customers and team members must always have a clean, secondary pathway to log into their tenant workspace.
- **Placement:**
  - Header Desktop: Subtle text link (`/auth/login`) positioned next to the primary CTA.
  - Header Mobile Menu: Navigation item (`/auth/login`) within the mobile drawer.
- **Constraint:** Logged-out marketing CTAs must **never** bounce anonymous prospective buyers to `/auth/login` as a primary action.

---

## 3. `/auth/join` — Invitations vs. Self-Service Signup

- **Actual behaviour (verified against the code, not assumed):** `/auth/join` serves **two**
  entry points, selected by whether a `token` query parameter is present
  (`pages/auth/join.tsx`):
  - **With a token** (`/auth/join?token=<inviteToken>`) it renders `JoinWithInvitation`, and
    the API resolves the token to join an **existing** organization
    (`pages/api/auth/join.ts:54` → `getInvitation({ token: inviteToken })`).
  - **Without a token** (`/auth/join`) it renders the plain `Join` form
    (`components/auth/Join.tsx`), whose schema requires `name`, `email`, `password` and
    `team` and which POSTs to `/api/auth/join` with **no token** — creating a new account
    and a new team.
- **Reachability:** `/auth/**` is in the `middleware.ts` unauthenticated allowlist
  (`middleware.ts:112`), so `/auth/join` is a **public** page. It is not gated and does not
  require a signed token in order to load.
- **Invitation path (intent unchanged and still supported):**
  `components/invitation/NotAuthenticated.tsx` routes to
  `/auth/join?token=${invitation.token}`, which is the signed-token flow.
- **Constraint — holds, re-verified:** public **marketing** surfaces must point at
  `/register` and never at `/auth/join`. Confirmed in source: `LandingHeader.tsx:108`,
  `HeroSection.tsx:29`, `CtaSection.tsx:18` and `pages/pricing.tsx:95`
  (`/register?package=<id>`) all use `/register`, and no file under
  `components/landing/`, `pages/index.tsx`, `pages/pricing.tsx` or
  `pages/register.tsx` links to `/auth/join`.
- **⚠ Open product question — needs a human decision:** there are effectively **two public
  self-service signup entry points**. `pages/auth/login.tsx:219` renders the
  `create-a-free-account` link as `/auth/join${params}`, where
  `params = token ? '?token=' + token : ''` (`pages/auth/login.tsx:111`). On an ordinary
  visit to the login page there is no token, so that link reaches the **tokenless** `Join`
  form rather than the sanctioned `/register` funnel. Decide whether it should target
  `/register` (a single funnel) or whether the tokenless `Join` form is an intentional
  second entry point and should stay.

> **Correction:** this section previously asserted that `/auth/join` was "strictly reserved
> for invited team members joining an existing organization via a signed token" and implied
> the page was unreachable without one. That was not true of the code and has been replaced
> with the behaviour above.

---

## 4. Design System Page Placement (`/design-system`)

- **Rule:** The Design System reference page is an internal design and engineering reference tool.
- **Placement:**
  - Removed from the public customer-facing header.
  - Retained in the application at `/design-system` for engineering, QA, and admin development workflows.
