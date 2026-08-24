# Smart Platform

Arabic-first, RTL enterprise resource planning SaaS — accounting, inventory, HR and e-invoicing for growing businesses in Saudi Arabia, delivered as a multi-tenant cloud platform.

## Highlights

- **Multi-tenant workspaces** — teams with slug routing, roles & permissions (RBAC), member invitations, API keys and team-scoped audit trail
- **Enterprise auth** — credentials + magic link signup, Google/GitHub OAuth, SAML SSO and SCIM directory sync via Jackson, account lockout and email verification
- **Billing** — subscription packages with checkout and portal flows; payment status pages
- **Observability** — Sentry error tracking, OpenTelemetry metrics, structured audit logs
- **Public funnel** — Arabic landing, pricing, and a rate-limited ERP registration/payment API
- **Security** — CSP + security headers via middleware, reCAPTCHA, rate limiting, session management

## Tech stack

| Layer     | Choice                                                          |
| --------- | --------------------------------------------------------------- |
| Framework | Next.js 15 (Pages Router) · React 18 · TypeScript strict        |
| Styling   | Tailwind CSS + daisyUI · Cairo/Almarai fonts (Arabic-first RTL) |
| Data      | PostgreSQL 16 · Prisma 6                                        |
| Auth      | NextAuth 4 (JWT or database sessions) + Jackson for SAML/SCIM   |
| Payments  | Stripe                                                          |
| Email     | Nodemailer + react-email templates                              |
| Tooling   | Jest · Playwright · ESLint · Prettier                           |

## Getting started

Prerequisites: Node.js 18+, PostgreSQL (see `docker-compose.yml`).

```bash
cp .env.example .env            # fill in values (see Env & scripts below)
docker compose up -d db         # Postgres 16 on port 5432
npm install
npx prisma db push              # sync schema
npm run dev                     # → http://localhost:4002
```

Local defaults: `APP_URL=http://localhost:4002`, `DATABASE_URL=postgresql://admin:admin@localhost:5432/smart-platform` (matches `docker-compose.yml`). Generate a real value for `NEXTAUTH_SECRET` with `openssl rand -base64 32`.

## Useful scripts

| Script                     | What it does                                    |
| -------------------------- | ----------------------------------------------- |
| `npm run dev`              | Dev server on port 4002                         |
| `npm run build`            | Prisma generate + `db push` + Next build        |
| `npm test`                 | Jest unit tests                                 |
| `npm run test:e2e`         | Playwright end-to-end tests                     |
| `npm run check-types`      | TypeScript type check                           |
| `npm run check-lint`       | ESLint                                          |
| `npm run check-format`     | Prettier check                                  |
| `npm run check-locale`     | Validate locale keys                            |
| `npm run context:validate` | Validate the `.agents/context` knowledge base   |
| `npm run sync-stripe`      | Push product/pricing data to Stripe from `.env` |

## Environment

Configuration is read through the typed object in `lib/env.ts`. Key variables (`NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DATABASE_URL`, `APP_URL`, `SMTP_*`, `JACKSON_*`, `STRIPE_*`, `SVIX_*`, `RETRACED_*`, `ERP_*`) are documented in `.env.example`.

## Project layout

- `pages/` — routes (Pages Router) with `getServerSideProps` + `serverSideTranslations`
- `components/` — feature components: auth, teams, billing, webhooks, api keys, email templates, landing
- `lib/` — env, auth, jackson/sso/dsync, email, stripe, svix, retraced helpers
- `models/` — Prisma model wrappers
- `prisma/` — schema and seed
- `locales/` — i18n strings
- `tests/` — Jest unit tests; `tests/e2e/` — Playwright specs
- `.agents/context/` — project knowledge base for AI pair-programming (see `AGENTS.md`)
