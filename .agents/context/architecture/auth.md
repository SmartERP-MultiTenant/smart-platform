<!-- Context: architecture/auth | Priority: high | Version: 1.1 | Updated: 2026-09-02 -->

# Auth model

NextAuth v4 with pluggable providers; **credentials login is enabled in local `.env` so dev works with zero SMTP**.

## Key points

- Providers are gated by `AUTH_PROVIDERS` (comma-separated): `github, google, email, saml, credentials, idp-initiated` — wired in `lib/auth.ts` via `isAuthProviderEnabled`.
- Session strategy `NEXTAUTH_SESSION_STRATEGY=jwt` (default) → `middleware.ts` validates the JWT via `getToken`; `database` strategy hits `/api/auth/session` instead.
- SSO/SAML is provided by embedded **Jackson** (`lib/jackson.ts` + `lib/jackson/config.ts`); it persists to its own tables. Team SSO config lives in `pages/teams/[slug]/sso.tsx` (gate: `FEATURE_TEAM_SSO`).
- Sign-in pages: `pages/auth/login.tsx`, `join.tsx`, `magic-link.tsx`, `forgot-password.tsx`, `reset-password/[token].tsx`, `verify-email.tsx`, `unlock-account.tsx`, `auth/sso/*` (IdP select + SAML login).
- Account security: `MAX_LOGIN_ATTEMPTS` (lockout via `lib/accountLock.ts`), reCAPTCHA hooks (`lib/recaptcha.ts`), email verification (`CONFIRM_EMAIL`), non-business-email signup gate (`DISABLE_NON_BUSINESS_EMAIL_SIGNUP`).
- Token storage for API calls: NextAuth session JWT; admin/tenant tokens from the old app do not exist here — replace with session-based auth.

## Platform-admin role (P5.2, 2026-09-02)

- `enum PlatformRole { PLATFORM_ADMIN }` + nullable `User.platformRole` (`prisma/schema.prisma`, migration `20260902144019_add_platform_role`). Independent from team `Role` — never reuse team roles or the ERP's `isSuperAdmin` for platform authz.
- Session claim: `Session.user.isPlatformAdmin: boolean` (+ `JWT.isPlatformAdmin?`) in `types/next-auth.d.ts`. `lib/nextAuth.ts` jwt callback resolves it from the DB at sign-in for **all** providers — including the `boxyhq-idp` early-return branch (fixed 2026-09-02: first IdP session carries the claim) — and refreshes via `token.sub`; database strategy resolves fresh per session read.
- Server guard: `lib/guardPlatformAdmin.ts` → `requirePlatformAdmin(req, res)` — 401 no session, 403 non-admin. The **fresh narrow DB check** (`select: { platformRole }`) is the authority; never trust the JWT claim alone (claim can outlive a revocation). Returns safe actor `{ id, email, name }`.
- Bootstrap: `scripts/seed-platform-admin.ts` (`npm run seed:platform-admin`; `--email` or `PLATFORM_ADMIN_EMAIL`) grants the role to an **existing** user only, idempotent. Prod procedure: `docs/platform-admin-bootstrap.md` (transactional UPDATE with row-count enforcement).
- Placeholder page `pages/admin.tsx`: SSR guard — ApiError 401 → login redirect, 403 → forbidden state, anything else rethrown (500). Arabic RTL hardcoded (`dir="rtl" lang="ar"`, funnel convention) — **no locale files** (locked decision 2026-09-02; P1.2 owns i18n).

## References

- `lib/auth.ts` · `lib/nextAuth.ts` · `middleware.ts` · `pages/auth/*` · `lib/jackson*` · `lib/guardPlatformAdmin.ts` · `scripts/seed-platform-admin.ts` · `docs/platform-admin-bootstrap.md`
