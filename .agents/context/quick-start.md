<!-- Context: quick-start | Priority: high | Version: 1.0 | Updated: 2026-08-20 -->

# Quick Start

The project is a fresh clone of the BoxyHQ Enterprise SaaS Starter Kit, serving as the new home for SMART ERP's website (landing + registration funnel + admin).

## Status (2026-08-20)

- Server running at `http://localhost:4002` (`npm run dev`).
- Postgres 16 in Docker container `saas-postgres` on **host port 5433** (host 5432 is occupied by another project's Postgres — see `errors/db-port-conflict`).
- `.env` configured for local dev: credentials auth, features enabled (SSO, DSYNC, AUDIT_LOG, WEBHOOK, API_KEY), payments disabled.
- DB schema pushed (`npx prisma db push`); no seed run yet.

## First commands

```bash
npm run dev              # dev server → http://localhost:4002
npx prisma studio        # inspect data
npx prisma db push       # sync schema after model changes
npm test                 # jest unit tests
npx playwright test      # e2e (needs install first)
```

## Key constraints

- Pages Router (not App Router): new pages go in `pages/`, layouts in `components/layouts`.
- Auth gating is done in `middleware.ts` (edit `unAuthenticatedRoutes` to expose routes).
- i18n via next-i18next: strings in `locales/en/common.json`, `serverSideTranslations` in every page's `getServerSideProps`.
- `.env` values are read through the single config object in `lib/env.ts` (plain `process.env` reads — no zod validation); missing keys surface as empty/undefined at their use site, not a boot failure.

## References

- `architecture/navigation.md` · `guides/navigation.md` · `lookup/navigation.md` · `errors/navigation.md`
