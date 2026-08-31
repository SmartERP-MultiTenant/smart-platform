<!-- Context: best-practices/security | Priority: high | Version: 1.0 | Updated: 2026-08-20 -->

# Security — best practices (harvested from this codebase)

Purpose: the security invariants this repo already enforces, plus the rules to keep them true when adding features (landing, payments, admin).

## Key points

- **CSP is the security gate.** `middleware.ts` `generateCSP()` sets `default-src 'self'`, strict `font-src 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`, and COEP/COOP/CORP headers. **Any new third-party (Moyasar/Tabby/Tamara iframes, analytics, fonts) requires an explicit `script-src`/`frame-src`/`connect-src`/`img-src` addition — never loosen `default-src`.**
- **Route gating is allowlist-based.** Everything not in `unAuthenticatedRoutes` (middleware.ts) 307s to `/auth/login`. New public pages (landing sections, `/design-system`) must be added there deliberately.
- **Input validation is centralized for most API routes** via `validateWithSchema(zodSchema, body)` from `lib/zod/index.ts` → throws `ApiError(422, …)`. Caveat: `pages/api/oauth/token.ts`, `pages/api/oauth/saml.ts` and `pages/api/webhooks/dsync.ts` read raw `req.body` without a schema — validate before trusting them in new code. Env is read through `lib/env.ts` (plain `process.env` config object, no zod validation).
- **Secrets live only in `.env`** (gitignored). `NEXTAUTH_SECRET`, Stripe, Jackson, Svix, SMTP, reCAPTCHA keys — accessed via `lib/env.ts` only, never hardcoded, never shipped (exception: the standalone scripts `sync-stripe.js` and `delete-team.js` read env directly via `process.env`). `NEXT_PUBLIC_*` vars are the ONLY client-visible ones (mixpanel token, dark mode).
- **API surface discipline + auth hardening:** every API route handles unknown methods with `405` + `Allow` header, wraps handlers in try/catch → `ApiError`/500, uses `getCurrentUser`/`requireTeamMembership` guards (`lib/guards/`), and forces response consumption (`forceConsume`) to avoid leaks. Team-scoped routes must verify membership via the `Team`/`TeamMember` model — never trust `teamSlug` alone. `lib/accountLock.ts` throttles login attempts (`MAX_LOGIN_ATTEMPTS`, default 5) with lockout + unlock email (7-day token); `generateToken(64)` uses `crypto.randomBytes` (not Math.random); email-confirmation and disable-non-business-email-signup flags live in env.

## Rules for new code

1. Add payment SDKs to CSP consciously; verify the CSP still blocks everything else.
2. Validate every API input with a zod schema — 422, not a silent accept.
3. Never log or return secrets/verification tokens in responses.
4. Team data access always through guards (`lib/guards/*`), not client-passed ids.
5. New public route → middleware allowlist + explicit reasoning in the PR.

## References

- `middleware.ts` · `lib/env.ts` · `lib/zod/index.ts` · `lib/accountLock.ts` · `lib/server-common.ts` · `lib/guards/*` · `architecture/security.md`
