<!-- Context: architecture/security | Priority: high | Version: 1.0 | Updated: 2026-08-17 -->

# Security layer (middleware)

`middleware.ts` is the app's security gate — it both **authenticates routes** and **sets headers**.

## Key points

- Route gating: every request is checked against `unAuthenticatedRoutes` (micromatch). Public allowlist includes `/api/auth/**`, `/api/oauth/**`, `/api/scim/v2.0/**`, `/api/invitations/*`, `/api/webhooks/stripe`, `/api/webhooks/dsync`, `/auth/**`, `/.well-known/*`, `/terms-condition`, `/unlock-account`, `/login/saml`, `/api/hello`, `/api/health`. **New public pages must be added here or they 307 to login.**
- CSP is generated in code (`generateCSP()`) and applied via both header + injected `<meta>`-style header on `NextResponse.next`; relaxed for Google fonts/recaptcha (`*.gstatic.com`, `*.google.com`) — adapt when adding Moyasar/Tabby/Tamara iframes/scripts.
- Other headers: `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-site` (gated by `env.securityHeadersEnabled`).
- Matcher excludes `_next/static`, `_next/image`, favicon, `/api/auth/session`.

## Constraints for the redesign

- Payment SDKs (Moyasar card form injects CSS+JS from jsDelivr; Tabby/Tamara iframes) will need `script-src`/`frame-src`/`connect-src` additions — plan the CSP update when wiring payments.

## References

- `middleware.ts` · `lib/env.ts` (security flags)
