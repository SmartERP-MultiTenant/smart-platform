# AGENTS.md — SMART PLATFORM

Instructions for any agent or AI pair-programmer working in this repository.

## 1. Context knowledge base (mandatory pre-flight)

Read the project context **before any task**, in order:

1. `.agents/context/quick-start.md` — status, constraints, first commands
2. `.agents/context/navigation.md` — category index
3. The category file that covers your task: `architecture/`, `best-practices/`, `guides/`, `lookup/`, `errors/`, `context-system/` (see §6)

Context is canonical: if it conflicts with ambient knowledge, trust the context and
update it if reality has changed.

## 2. Context-sync rule (no commit without it)

- **No commit or push is allowed** when the context knowledge base is missing, stale,
  or out of sync with the areas the change touches.
- Code changes in covered areas (auth, routing, tenancy, security, env vars, run
  steps, stack versions) MUST ship with a matching `.agents/context/` update **in the
  same commit**.
- After any context change, run `npm run context:validate` and fix failures before
  committing.
- A fresh clone must be able to boot and navigate the codebase from the knowledge
  base alone — nothing else should be required.

## 3. Communication (English only)

- **Always reply in English**, even when the user writes in Arabic.
- Code, comments, docs, commit messages, and issues: English.

## 4. Quick run commands

```bash
docker start saas-postgres          # Postgres 16 on host port 5433 (5432 is taken by host Postgres)
npm install                         # install deps
npm run dev                         # dev server → http://localhost:4002
npx prisma db push                  # sync schema after model changes
npx prisma studio                   # inspect data
npm run context:validate            # validate the context knowledge base
npm run check-types                 # tsc --noEmit
npm run check-unused                # npx knip — dead-code gate, must exit 0
npm test                            # jest unit tests
npm run test:e2e                    # playwright e2e
npx prisma db seed                  # seed (if needed)
```

## 5. Stack & key facts

- **Stack:** Next.js 15 (**Pages Router**, not App Router) · TypeScript strict ·
  Prisma 6 + PostgreSQL 16 (Docker container `saas-postgres`, host port **5433**) ·
  NextAuth 4 (JWT sessions) · Tailwind + daisyUI · i18next · Jest + Playwright.
- **Auth:** `AUTH_PROVIDERS=credentials` locally → `/auth/join` signup form requires
  name, team, email and password (credentials provider, no SMTP needed). NextAuth routes
  under `pages/api/auth/[...nextauth].ts`.
- **Env:** `.env` (gitignored); values are read through the single typed config object
  in `lib/env.ts` (plain `process.env` reads — no zod validation; missing keys surface
  as empty/undefined at their use site, not a boot failure). Local values:
  `NEXTAUTH_URL`/`APP_URL` = `http://localhost:4002`, `DATABASE_URL` =
  `postgresql://postgres:postgres@localhost:5433/saas`.
- **Tenancy:** `Team` / `TeamMember` / `Invitation` with slug routing; per-team
  enterprise features: SSO/SAML (Jackson), SCIM DSYNC, audit logs (Retraced),
  webhooks (Svix), API keys, billing (Stripe).
- **Routing:** new pages go in `pages/` with `getServerSideProps` +
  `serverSideTranslations`; auth gating lives in `middleware.ts`
  (`unAuthenticatedRoutes` allowlist).
- **i18n:** strings in `locales/en/common.json`; every page needs `serverSideTranslations`.

## 6. Context categories

| Category                                                       | Purpose                                      | Priority |
| -------------------------------------------------------------- | -------------------------------------------- | -------- |
| [architecture](.agents/context/architecture/navigation.md)     | Tenancy, auth, security layer                | high     |
| [best-practices](.agents/context/best-practices/navigation.md) | Security/performance/UX standards            | high     |
| [guides](.agents/context/guides/navigation.md)                 | Run locally, add routes/pages                | high     |
| [lookup](.agents/context/lookup/navigation.md)                 | Stack versions, file map, env vars reference | medium   |
| [errors](.agents/context/errors/navigation.md)                 | Known failures and their fixes               | medium   |
| [context-system](.agents/context/context-system/navigation.md) | Rules for the knowledge base itself          | high     |
