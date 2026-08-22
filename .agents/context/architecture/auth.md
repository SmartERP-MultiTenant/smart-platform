<!-- Context: architecture/auth | Priority: high | Version: 1.0 | Updated: 2026-08-17 -->

# Auth model

NextAuth v4 with pluggable providers; **credentials login is enabled in local `.env` so dev works with zero SMTP**.

## Key points

- Providers are gated by `AUTH_PROVIDERS` (comma-separated): `github, google, email, saml, credentials, idp-initiated` — wired in `lib/auth.ts` via `isAuthProviderEnabled`.
- Session strategy `NEXTAUTH_SESSION_STRATEGY=jwt` (default) → `middleware.ts` validates the JWT via `getToken`; `database` strategy hits `/api/auth/session` instead.
- SSO/SAML is provided by embedded **Jackson** (`lib/jackson.ts` + `lib/jackson/config.ts`); it persists to its own tables. Team SSO config lives in `pages/teams/[slug]/sso.tsx` (gate: `FEATURE_TEAM_SSO`).
- Sign-in pages: `pages/auth/login.tsx`, `join.tsx`, `magic-link.tsx`, `forgot-password.tsx`, `reset-password/[token].tsx`, `verify-email.tsx`, `unlock-account.tsx`, `auth/sso/*` (IdP select + SAML login).
- Account security: `MAX_LOGIN_ATTEMPTS` (lockout via `lib/accountLock.ts`), reCAPTCHA hooks (`lib/recaptcha.ts`), email verification (`CONFIRM_EMAIL`), non-business-email signup gate (`DISABLE_NON_BUSINESS_EMAIL_SIGNUP`).
- Token storage for API calls: NextAuth session JWT; admin/tenant tokens from the old app do not exist here — replace with session-based auth.

## References

- `lib/auth.ts` · `lib/nextAuth.ts` · `middleware.ts` · `pages/auth/*` · `lib/jackson*`
