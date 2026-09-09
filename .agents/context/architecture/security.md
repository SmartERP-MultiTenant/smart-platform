<!-- Context: architecture/security | Priority: high | Version: 1.1 | Updated: 2026-09-02 -->

# Security layer (middleware)

`middleware.ts` is the app's security gate — it both **authenticates routes** and **sets headers**.

## Key points

- Route gating: every request is checked against `unAuthenticatedRoutes` (micromatch). Public allowlist includes `/api/auth/**`, `/api/oauth/**`, `/api/scim/v2.0/**`, `/api/invitations/*`, `/api/webhooks/stripe`, `/api/webhooks/dsync`, `/auth/**`, `/.well-known/*`, `/terms-condition`, `/unlock-account`, `/login/saml`, `/api/hello`, `/api/health`. **New public pages must be added here or they 307 to login.**
- **Platform-admin routes (P5.2):** `/admin`, `/admin/**`, `/api/admin`, `/api/admin/**` are gated for BOTH strategies (jwt via `getToken`, database via `/api/auth/session` fetch). Pages: anonymous → `/auth/login?callbackUrl` redirect, non-admin → 403; APIs: JSON 401/403 (never an HTML login page). These routes are NEVER added to `unAuthenticatedRoutes` — middleware is defense in depth only; `requirePlatformAdmin` (fresh DB check) is the authority on every `/api/admin/*` handler and `pages/admin.tsx` SSR.
- CSP is generated in code (`generateCSP()`) and applied via both header + injected `<meta>`-style header on `NextResponse.next`; scoped for Google fonts/recaptcha (`*.gstatic.com`, `*.google.com`) and payment SDKs (`*.moyasar.com`, `*.tabby.ai`, `*.tamara.co`, `*.paymob.com`, `*.oppwa.com`, `*.hyperpay.com`).
- Other headers: `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-site` (gated by `env.securityHeadersEnabled`).
- Matcher excludes `_next/static`, `_next/image`, favicon, `/api/auth/session`.

## Constraints for the redesign

- Payment SDKs (Moyasar card form, Tabby/Tamara iframes, Paymob, HyperPay) have scoped CSP origins configured. Final tightening pass (nonces/hashes for 'unsafe-inline'/'unsafe-eval') will run once payment gateways are live.
- reCAPTCHA covers both `/auth/join` and `/register` (ERP registration funnel) via `GoogleReCAPTCHA` + server-side `validateRecaptcha` in `/api/public/erp/register`.
- Rate limiting is in-memory for single-node; architecture decision (P4.8) specifies migrating to Redis for horizontal scaling (>1 node).
- **ERP Access Token Encryption (P4.14):** `Team.erpAccessToken` is encrypted at rest using AES-256-GCM via `lib/crypto/erpToken.ts` (`ERP_TOKEN_ENCRYPTION_KEY`). Decrypted on server-side only for ERP API communication; stripped from all client payloads via `lib/teamSafe.ts`.
- **POST Token Handoff (P4.14):** Token handoff to the ERP client uses hidden auto-submitting POST forms (`lib/erp/handoff.ts`), ensuring tokens never appear in URL query strings, browser history, or referrer logs.

## References

- `middleware.ts` · `lib/env.ts` (security flags) · `lib/guardPlatformAdmin.ts` · `lib/recaptcha.ts` · `lib/rateLimit.ts` · `lib/crypto/erpToken.ts` · `lib/erp/handoff.ts`

