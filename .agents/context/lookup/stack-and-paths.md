<!-- Context: lookup/stack-and-paths | Priority: medium | Version: 1.0 | Updated: 2026-08-17 -->

# Stack versions & file map

## Versions (package.json)

- next 15.5.14 (Pages Router) · prisma 6.10.0 / @prisma/client · next-auth 4.24.13 · TypeScript (strict) · Tailwind + daisyUI · next-i18next · react-email · jest + playwright · @sentry/nextjs · Jackson (embedded SSO)

## File map

| Path                         | Purpose                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/`                     | All routes (Pages Router): `index` (landing), `dashboard`, `auth/*` (login, join, magic-link, reset, verify, unlock, sso), `settings/{account,security}`, `teams/{index,switch,[slug]/{members,sso,directory-sync,audit-logs,webhooks,api-keys,billing,products,settings}}`, `invitations/[token]`, `well-known/saml-configuration` |
| `components/`                | `layouts/` (app shell), `auth/`, `account/`, `team/`, `billing/`, `apiKey/`, `webhook/`, `invitation/`, `defaultLanding/` (Hero/Features/Pricing/FAQ + data), `shared/`, `emailTemplates/`                                                                                                                                          |
| `lib/`                       | `auth.ts` (providers), `nextAuth.ts`, `prisma.ts`, `server-common.ts` (session/team helpers), `env.ts` (env config object), `rbac.ts`/`permissions.ts`, `guards/*`, `jackson*` (SSO), `svix.ts` (webhooks), `retraced.ts` (audit), `stripe.ts`, `slack.ts`, `email/*`, `zod/*`                                                      |
| `models/`                    | (Prisma model type re-exports)                                                                                                                                                                                                                                                                                                      |
| `prisma/schema.prisma`       | Data model + `prisma/seed.ts`                                                                                                                                                                                                                                                                                                       |
| `locales/en/`                | i18n strings (`common.json`)                                                                                                                                                                                                                                                                                                        |
| `middleware.ts`              | Auth gate + CSP/security headers                                                                                                                                                                                                                                                                                                    |
| `hooks/`                     | `useTheme` etc.                                                                                                                                                                                                                                                                                                                     |
| `__tests__/lib`, `tests/e2e` | Unit + Playwright suites                                                                                                                                                                                                                                                                                                            |

## Route→feature quick map

- Landing: `pages/index.tsx` + `components/defaultLanding/*` (i18n, theme toggle)
- Login/signup: `pages/auth/{login,join}.tsx`
- Post-auth shell: `pages/dashboard.tsx` → team pages
