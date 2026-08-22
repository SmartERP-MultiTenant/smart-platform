<!-- Context: guides/add-route | Priority: high | Version: 1.0 | Updated: 2026-08-17 -->

# Add a route/page

This kit uses the **Pages Router** with a strict convention. Follow it to avoid auth and i18n surprises.

## Recipe

1. Create `pages/<path>/index.tsx` (or `pages/<path>.tsx`).
2. Type the page as `NextPageWithLayout` (from `types`) when it uses a layout; wrap content in the layout from `components/layouts/` (auth-gated pages use the shell with sidebar).
3. i18n: add keys to `locales/en/common.json`, then in `getServerSideProps` call `serverSideTranslations(locale, ['common'])` and read strings via `useTranslation('common')`.
4. Auth gating: add the route to `middleware.ts` `unAuthenticatedRoutes` **only if it must be public** (e.g. a new landing section). Everything else stays behind login automatically.
5. Data: server code in `getServerSideProps` via `lib/server-common.ts` helpers (e.g. `getSessionUser`, `requireTeamMembership`); Prisma through `lib/prisma.ts`; env through `lib/env.ts` (plain `process.env` config object).
6. Validate: `npm run check-types && npm run check-lint && npm test`.

## Traps

- Forgetting `serverSideTranslations` → `Server Error` on locale load.
- New public route not in `unAuthenticatedRoutes` → 307 to `/auth/login`.
- `middleware.ts` matcher excludes `_next/*` — client-only API calls are unaffected.
- API routes live in `pages/api/**`; public ones need their own allowlist entry.
