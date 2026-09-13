<!-- Context: architecture/auth | Priority: high | Version: 1.3 | Updated: 2026-09-13 -->

# Auth model

NextAuth v4 with pluggable providers; **credentials login is enabled in local `.env` so dev works with zero SMTP**.

## Key points

- Providers are gated by `AUTH_PROVIDERS` (comma-separated): `github, google, email, saml, credentials, idp-initiated` — wired in `lib/auth.ts` via `isAuthProviderEnabled`.
- Session strategy `NEXTAUTH_SESSION_STRATEGY=jwt` (default) → `middleware.ts` validates the JWT via `getToken`; `database` strategy hits `/api/auth/session` instead.
- SSO/SAML is provided by embedded **Jackson** (`lib/jackson.ts` + `lib/jackson/config.ts`); it persists to its own tables. Team SSO config lives in `pages/teams/[slug]/sso.tsx` (gate: `FEATURE_TEAM_SSO`).
- Sign-in pages: `pages/auth/login.tsx`, `join.tsx`, `magic-link.tsx`, `forgot-password.tsx`, `reset-password/[token].tsx`, `verify-email.tsx`, `unlock-account.tsx`, `auth/sso/*` (IdP select + SAML login).
- Account security: `MAX_LOGIN_ATTEMPTS` (lockout via `lib/accountLock.ts`), `User.disabledAt` (admin disable) and `User.lockedAt` (admin lock) both rejected at login via `lib/nextAuth.ts`, reCAPTCHA hooks (`lib/recaptcha.ts`), email verification (`CONFIRM_EMAIL`), non-business-email signup gate (`DISABLE_NON_BUSINESS_EMAIL_SIGNUP`).
- Token storage for API calls: NextAuth session JWT; admin/tenant tokens from the old app do not exist here — replace with session-based auth.

## Platform-admin role & user administration (P5.2 / P5.5)

- `enum PlatformRole { PLATFORM_ADMIN }` + nullable `User.platformRole` (`prisma/schema.prisma`, migration `20260902144019_add_platform_role`). Independent from team `Role` — never reuse team roles or the ERP's `isSuperAdmin` for platform authz.
- `User.disabledAt DateTime?`: Admin-level permanent account disable. Enforced at **every provider sign-in** (`signIn` callback → `user-disabled` error redirect; credentials `authorize` as defense-in-depth) and enforced against **existing sessions**: JWT strategy — the `jwt` callback refreshes `{ platformRole, disabledAt }` from the DB on every session resolution and neuters revoked tokens (`sub` cleared + `userDisabled` flag → `session` callback returns null/unauthenticated); database strategy — the `session` callback rejects `user.disabledAt` and the admin disable action deletes the user's session rows.
- `User.lockedAt DateTime?` (admin lock, `pages/api/admin/users/*`): rejected in credentials `authorize` — `account-locked` when attempts are below the threshold, `exceeded-login-attempts` when the natural lockout threshold was also reached (keeps the unlock-email flow intact).
- Platform Admin User Management API (`/api/admin/users`):
  - `GET /api/admin/users?search=<q>&page=<n>&limit=<m>`: List/search users, roles, and teams. Excludes passwords.
  - `GET /api/admin/users/[id]`: Single user inspection.
  - `PATCH /api/admin/users/[id]` / `POST /api/admin/users/[id]/[action]`: Disable, enable, lock, unlock. Guarded with safety checks (prevent self-disable/lock, prevent disabling last PLATFORM_ADMIN).
  - Audit logging: `lib/adminAudit.ts` `recordAdminAudit()` **persists** to the `AdminAuditLog` model (P5.4, migration `20260912180000_add_admin_audit_log`) — SUCCEEDED after each mutation, FAILED for rejected/failed attempts. The console-only `[ADMIN_AUDIT]` fallback no longer exists: the code uses the typed `prisma.adminAuditLog` delegate. See `architecture/admin-console` for the two-phase lifecycle, the redaction choke point and the error contract.
- Session claim: `Session.user.isPlatformAdmin: boolean` (+ `JWT.isPlatformAdmin?`) in `types/next-auth.d.ts`. `lib/nextAuth.ts` jwt callback resolves it from the DB at sign-in for **all** providers — including the `boxyhq-idp` early-return branch (fixed 2026-09-02: first IdP session carries the claim) — and refreshes via `token.sub`; database strategy resolves fresh per session read.
- Server guard: `lib/guardPlatformAdmin.ts` → `requirePlatformAdmin(req, res)` — 401 no session, 403 non-admin. The **fresh narrow DB check** (`select: { platformRole }`) is the authority; never trust the JWT claim alone (claim can outlive a revocation). Returns safe actor `{ id, email, name }`.
- Bootstrap: `scripts/seed-platform-admin.ts` (`npm run seed:platform-admin`; `--email` or `PLATFORM_ADMIN_EMAIL`) grants the role to an **existing** user only, idempotent. Prod procedure: `docs/platform-admin-bootstrap.md` (transactional UPDATE with row-count enforcement).
- Admin pages (`pages/admin.tsx`, `pages/admin/revenue.tsx`, `pages/admin/users.tsx`, `pages/admin/rules.tsx`, `pages/admin/audit-logs.tsx`, `pages/admin/tenants/[teamId].tsx`): SSR guard — ApiError 401 → login redirect, 403 → `context.res.statusCode = 403` + forbidden state, anything else rethrown (500). Arabic RTL (`dir="rtl" lang="ar"`, funnel convention) reusing **existing** `admin-*` locale keys; the P5.4/P5.6 pages add further keyed strings to `locales/{ar,en}/common.json` (AR/EN parity checked by `npm run check-locale`) and no inline literal may be user-facing.

## Platform-admin dashboard (P5.3, read-only)

- Tenant source of truth is the platform `Team` table, **not** ERP: `lib/adminDashboard.ts` selects an explicit whitelist (`id, name, slug, domain, erpTenantId, erpSubdomain, erpLinkedAt, createdAt, _count.members`) and never `erpAccessToken`, `erpApiUrl` or the M2M key. ERP billing is read per linked team via `erp.getTenantBillingSubscription(env.erp.platformApiKey, …)`.
- Guard-first, GET-only API: `pages/api/admin/dashboard.ts` and `pages/api/admin/tenants/[teamId].ts` call `requirePlatformAdmin` **before** any method or data logic (405 on other methods, 422 invalid id, 404 unknown team). Mutations, the `AdminAuditLog` store and revenue aggregation were P5.4+/P5.7 and are now implemented — this bullet describes the read-only P5.3 dashboard alone; see `architecture/admin-console`.
- **ERP-down is a first-class state, never a 500.** `probeErpHealth()` bounds the probe with a 3s `AbortSignal.timeout`; per-tenant reads are bounded by `ERP_ROW_TIMEOUT_MS` (3s, `Promise.race`) and capped at 5 in flight (`mapWithConcurrency`); `Promise.allSettled` guarantees one bad tenant cannot fail the payload. An ERP outage ⇒ **HTTP 200 with `health.ok=false`**. Failures surface as fixed tokens only (`timeout | unreachable | http-<status> | erp-timeout | erp-unavailable | erp-malformed-payload`) — never the ERP URL, auth header or raw body.
- Distinguish **linked-but-unreachable** tenants from **genuinely unlinked** ones (`AdminSubscriptionBadge` takes `linked` + `reachable`, and `AdminTenantTable` threads them). Collapsing both into "not linked" is the exact failure this surface exists to prevent.
- Normalisation in `models/adminDashboard.ts` is pure: `toIso()` parses offset-less ERP datetimes as UTC and returns `null` instead of throwing; echoed free text is clamped to `MAX_ECHOED_TEXT`.

## References

- `lib/auth.ts` · `lib/nextAuth.ts` · `middleware.ts` · `pages/auth/*` · `lib/jackson*` · `lib/guardPlatformAdmin.ts` · `lib/adminAudit.ts` · `pages/api/admin/users/*` · `lib/accountLock.ts` · `scripts/seed-platform-admin.ts` · `docs/platform-admin-bootstrap.md`
- P5.3 dashboard: `pages/admin.tsx` · `pages/admin/tenants/[teamId].tsx` · `pages/api/admin/dashboard.ts` · `pages/api/admin/tenants/[teamId].ts` · `lib/adminDashboard.ts` · `models/adminDashboard.ts` · `hooks/useAdminDashboard.ts` · `hooks/useAdminTenant.ts` · `components/admin/*`
