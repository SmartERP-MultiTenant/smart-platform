<!-- Context: navigation | Priority: high | Version: 1.0 | Updated: 2026-08-20 -->

# Project Context — SMART PLATFORM

Next.js 15 multi-tenant SaaS shell for the SMART PLATFORM platform (landing + registration funnel + admin).

## Quick start

Read `quick-start.md` first, then the category `navigation.md` for your task.

## Categories

| Category                                       | Purpose                                                              | Priority |
| ---------------------------------------------- | -------------------------------------------------------------------- | -------- |
| [architecture](architecture/navigation.md)     | Multi-tenancy, auth (NextAuth + Jackson SSO), security headers/CSP   | high     |
| [best-practices](best-practices/navigation.md) | Security, performance, UX/UI engineering standards (harvested)       | high     |
| [guides](guides/navigation.md)                 | Run locally, add routes/pages, work with teams                       | high     |
| [lookup](lookup/navigation.md)                 | Stack versions, key file map, env vars reference                     | medium   |
| [errors](errors/navigation.md)                 | Known failures and their fixes (ports, SMTP, Prisma auth)            | medium   |
| [context-system](context-system/navigation.md) | Rules for the knowledge base itself                                  | high     |
| [shared](shared/navigation.md)                 | Cross-repo: ecosystem map, integration contracts, payments, workflow | high     |

## Key facts

- **Stack:** Next.js 15 (Pages Router) · TypeScript strict · Prisma 6 + PostgreSQL (Docker, port 5433 locally) · NextAuth 4 (JWT sessions) · Tailwind + daisyUI · i18next · Jest + Playwright.
- **Tenancy:** `Team` / `TeamMember` / `Invitation` with slug-based routing; enterprise features per team: SSO/SAML (Jackson), SCIM directory sync, audit logs (Retraced), webhooks (Svix), API keys, billing (Stripe).
- **Dev login:** `AUTH_PROVIDERS=credentials` enables email+password (no SMTP needed locally).
- **Decision:** build SMART PLATFORM's landing + funnel on this shell; port content from the old app; swap Stripe for Moyasar/Tabby/Tamara.
