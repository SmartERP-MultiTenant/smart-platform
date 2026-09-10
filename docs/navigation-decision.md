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

## 3. Team Member Invitations vs. Public Funnel (`/auth/join`)

- **Rule:** `/auth/join` is strictly reserved for **invited team members** joining an existing organization via a signed token (`/auth/join?token=<inviteToken>`).
- **Constraint:** Public marketing pages and navigation menus must never link to `/auth/join` directly.

---

## 4. Design System Page Placement (`/design-system`)

- **Rule:** The Design System reference page is an internal design and engineering reference tool.
- **Placement:**
  - Removed from the public customer-facing header.
  - Retained in the application at `/design-system` for engineering, QA, and admin development workflows.
