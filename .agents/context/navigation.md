<!-- Context: navigation | Priority: high | Version: 1.0 | Updated: 2026-08-20 -->

# Project Context — SaaS Starter Kit (SMART ERP)

BoxyHQ Enterprise SaaS Starter Kit — Next.js 15 shell for the SMART ERP multi-tenant platform. Cloned 2026-08-17 into this repo; the old Vite app lives in the sibling `Multi-Tenant-Platform/` folder (reference only — landing redesign target).

## Quick start

Read `quick-start.md` first, then the category `navigation.md` for your task.

## Categories

| Category                                       | Purpose                                                            | Priority |
| ---------------------------------------------- | ------------------------------------------------------------------ | -------- |
| [architecture](architecture/navigation.md)     | Multi-tenancy, auth (NextAuth + Jackson SSO), security headers/CSP | high     |
| [best-practices](best-practices/navigation.md) | Security, performance, UX/UI engineering standards (harvested)     | high     |
| [guides](guides/navigation.md)                 | Run locally, add routes/pages, work with teams                     | high     |
| [lookup](lookup/navigation.md)                 | Stack versions, key file map, env vars reference                   | medium   |
| [errors](errors/navigation.md)                 | Known failures and their fixes (ports, SMTP, Prisma auth)          | medium   |
| [context-system](context-system/navigation.md) | Rules for the knowledge base itself                                | high     |

## Key facts

- **Stack:** Next.js 15 (Pages Router) · TypeScript strict · Prisma 6 + PostgreSQL (Docker, port 5433 locally) · NextAuth 4 (JWT sessions) · Tailwind + daisyUI · i18next · Jest + Playwright.
- **Tenancy:** `Team` / `TeamMember` / `Invitation` with slug-based routing; enterprise features per team: SSO/SAML (Jackson), SCIM directory sync, audit logs (Retraced), webhooks (Svix), API keys, billing (Stripe).
- **Dev login:** `AUTH_PROVIDERS=credentials` enables email+password (no SMTP needed locally).
- **Decision:** build SMART ERP's landing + funnel on this shell; port content from the old app; swap Stripe for Moyasar/Tabby/Tamara.
