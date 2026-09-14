<!-- Context: architecture/security | Priority: high | Version: 1.3 | Updated: 2026-09-14 -->

# Security layer (middleware)

`middleware.ts` is the app's security gate — it both **authenticates routes** and **sets headers**.

## Key points

- Route gating: every request is checked against `unAuthenticatedRoutes` (micromatch). Public allowlist includes `/api/auth/**`, `/api/oauth/**`, `/api/scim/v2.0/**`, `/api/invitations/*`, `/api/webhooks/stripe`, `/api/webhooks/dsync`, `/auth/**`, `/.well-known/*`, `/terms-condition`, `/unlock-account`, `/login/saml`, `/api/hello`, `/api/health`, the public ERP funnel (`/register`, `/payment/*`, `/api/public/erp/**`). **New public pages must be added here or they redirect to login (307). Unauthenticated `/api/**`calls never redirect to an HTML page: they receive JSON 401\*\* (admin APIs additionally enforce the platform-admin role with JSON 403). Also allowlisted but **NOT public**:`/api/cron/\*\*`— middleware must not intercept scheduled calls, the handler is the authority via`CRON_SECRET` (see the cron route contract below).
- **Platform-admin routes (P5.2):** `/admin`, `/admin/**`, `/api/admin`, `/api/admin/**` are gated for BOTH strategies (jwt via `getToken`, database via `/api/auth/session` fetch). Pages: anonymous → `/auth/login?callbackUrl` redirect, non-admin → 403; APIs: JSON 401/403 (never an HTML login page). These routes are NEVER added to `unAuthenticatedRoutes` — middleware is defense in depth only; `requirePlatformAdmin` (fresh DB check) is the authority on every `/api/admin/*` handler and `pages/admin.tsx` SSR.
- CSP is generated in code (`generateCSP()`) and applied via both header + injected `<meta>`-style header on `NextResponse.next`; scoped for Google fonts/recaptcha (`*.gstatic.com`, `*.google.com`) and payment SDKs (`*.moyasar.com`, `*.tabby.ai`, `*.tamara.co`, `*.paymob.com`, `*.oppwa.com`, `*.hyperpay.com`).
- Other headers: `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-site` (gated by `env.securityHeadersEnabled`).
- Matcher excludes `_next/static`, `_next/image`, favicon, `/api/auth/session`.

## Constraints for the redesign

- Payment SDKs (Moyasar card form, Tabby/Tamara iframes, Paymob, HyperPay) have scoped CSP origins configured. **`script-src` no longer allows `'unsafe-inline'`/`'unsafe-eval'` in production (P2.13);** development is the one exception — `generateCSP()` appends `'unsafe-eval'` when `NODE_ENV === 'development'` because the Next.js dev overlay / react-refresh runtime needs it, so a local-only CSP report showing `'unsafe-eval'` is expected, not a regression. A per-request nonce is minted in `middleware.ts` (`generateNonce()`/`generateCSP(nonce)`), set on the request + response (`x-nonce` and the CSP header), and propagated to `<Head nonce>`/`<NextScript nonce>` in `pages/_document.tsx`; `style-src` keeps `'unsafe-inline'` for JSX `style={{}}` props (documented decision). Public routes get the same nonce policy (they previously received no CSP at all).
- reCAPTCHA covers both `/auth/join` and `/register` (ERP registration funnel) via `GoogleReCAPTCHA` + server-side `validateRecaptcha` in `/api/public/erp/register`.
- Rate limiting is in-memory for single-node; architecture decision (P4.8) specifies migrating to Redis for horizontal scaling (>1 node). **Coverage (P4.8):** all seven public ERP handlers (`/api/public/erp/*`) start with their bucket check — `register` + `payments` 10/min, `check-subdomain`/`check-email` 30/min, `packages`/`methods` 60/min (catalog) and `verify` 60/min (sized for the 15-attempt payment poll); over-limit returns `429 { error: { message: 'too-many-requests' } }` (`lib/rateLimit.ts`, buckets kept separate by purpose). **P4.22 (2026-09-14) closed a full bypass of every one of those buckets** — the bucket key is now derived from the _trusted_ end of `X-Forwarded-For`; see the section below for the trust model, the deployment assumption and the open ops question.
- **ERP Access Token Encryption (P4.14):** `Team.erpAccessToken` is encrypted at rest using AES-256-GCM via `lib/crypto/erpToken.ts`. Key governance: `ERP_TOKEN_ENCRYPTION_KEY` is **required in production** (encrypt/decrypt throw when unset — never a silent published fallback key); outside production an unset key falls back to a dev-only key with a one-time warning; `NEXTAUTH_SECRET` is **not** part of the derivation (key separation — rotating the session secret never corrupts data-at-rest). Envelope `enc:v1:<keyId>:<iv>:<tag>:<ct>` carries a content-addressed keyId, so key rotation stays backward compatible. Decrypted on server-side only for ERP API communication; stripped from all client payloads via `lib/teamSafe.ts`.
- **Cron route contract:** `/api/cron/*` (e.g. `renewal-reminders`) is allowlisted in `middleware.ts` (`/api/cron/**`) so the scheduler is not stopped by the API auth gate — authentication lives in the handler and is guarded by `CRON_SECRET`: the route returns **503 when unset** (no open mode) and authenticates via headers only (`Authorization: Bearer` or `x-cron-secret`, constant-time compare); the query-string `?secret=` vector is rejected (would leak into access logs).
- **Renewal-email CTA locale (P3.3):** the renew link is built by `lib/email/utils.ts` `buildRenewalUrl(appUrl, teamSlug, locale)` — Arabic (default) stays unprefixed, English is `/en/teams/<slug>/erp` (same convention as `components/shared/SEO.tsx` / `pages/_document.tsx`). Middleware would negotiate an EN browser from an unprefixed link, but the explicit prefix keeps the target deterministic for mail clients/previews; every reminder also carries the other language as a secondary link.
- **POST Token Handoff (P4.14):** Token handoff to the ERP client uses hidden auto-submitting POST forms (`lib/erp/handoff.ts`), ensuring tokens never appear in URL query strings, browser history, or referrer logs.

## Rate-limit trust model & register-abuse review (P4.22 — 2026-09-14)

### The defect that was fixed

`clientKey()` read the **leftmost** `X-Forwarded-For` hop (`forwarded.split(',')[0]`). That header is
append-only: every proxy appends the address _it_ saw to the **right** of whatever the caller sent. The
leftmost entry is therefore precisely the value a caller controls, and rotating it minted a fresh bucket per
request — a **full bypass** of every limit in `lib/rateLimit.ts`, including `register` (10/min) and
`payments` (10/min). Nothing in the repo constrained it: `grep -rn 'TRUST_PROXY\|x-real-ip\|cf-connecting-ip\|trusted.proxy'`
returned only the vulnerable line and its spec.

### The model now in force

`resolveClientIp()` in `lib/rateLimit.ts` reads the **rightmost `trustedHops` entries** of the header and
uses the entry at `chain[chain.length - trustedHops]`. Everything to its left is caller-supplied and is never
used as a bucket key.

| Knob                                  | Value                                                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RATE_LIMIT_TRUSTED_HOPS`             | Non-negative integer, default **1**, clamped to `0..10`. `0` ignores `X-Forwarded-For` entirely and buckets on the direct-peer address                                         |
| Invalid values                        | `"false"`, `"abc"`, `"1.5"`, `"-1"`, `""` all fall **back to the default** — parsed, never truthiness-coerced (avoids the `SECURITY_HEADERS_ENABLED` fail-open bug class)      |
| Chain shorter than the hop count      | Falls back to the direct-peer address. It **never** guesses from the left end, which would hand the key back to the caller. Un-forceable by a caller, who can only ever append |
| Header absent / empty / all-malformed | Direct-peer address                                                                                                                                                            |
| Everything unavailable                | `'unknown'` — never an empty key, so a failure can never collapse all clients into one bucket                                                                                  |
| Address normalisation                 | `::ffff:203.0.113.7` → `203.0.113.7`; IPv6 lower-cased, so equivalent spellings share a bucket                                                                                 |

**Why an explicit hop count and not "is the peer address private?".** The production compose publishes
`5032:4002`, so Docker's NAT rewrites _every_ external request — including a direct attack on the published
port — to originate from the private bridge gateway. A private-peer heuristic would therefore trust the
header even when nothing in front of the app is a proxy. The hop count has no such blind spot and is
verifiable against the live reverse-proxy config.

`x-real-ip` and `cf-connecting-ip` are **deliberately not used**: they are exactly as caller-forgeable as
`X-Forwarded-For` without a trusted-proxy check, and adding a second source widens the surface without
adding a guarantee. `X-Forwarded-For` is the one header both Cloudflare and nginx maintain.

### ⚠️ Open ops question — the production hop count is unverified

The repo proves production sits behind **Cloudflare plus the host nginx** (`middleware.ts:42-43`: "production
sits behind Cloudflare/nginx and reports https through `x-forwarded-proto`"; `docs/CI-CD.md:409-423`: the
`*.smartapro.com` vhost lives in `/etc/nginx/` on the VPS, terminating in front of published port 5032).
That implies **two** trusting hops, i.e. `RATE_LIMIT_TRUSTED_HOPS=2`. The nginx config itself is **not in
this repo** (it is a follow-up of P4.5), so this cannot be confirmed from code.

- **If the value is 1 while two proxies are present:** no bypass — the bucket key becomes the Cloudflare
  edge address, i.e. coarser (all clients behind one edge share a bucket), never spoofable.
- **If the value is 2 while nginx is directly reachable (no Cloudflare in the path):** the entry one-in-from-right
  is the one nginx appended, so a prefix the caller injected is ignored — but that is exactly the case the
  number must match. **Action before go-live:** read `/etc/nginx/` and set the value to the real hop count in
  staging and production. Recorded in `docs/env-matrix.md` §3.4.

### Public routes carrying a bucket (re-verified at this change)

All seven `/api/public/erp/*` handlers were enumerated and each one re-checked for a bucket guard — the list
is exhaustive, not inherited from the previous revision:

| Route                             | Bucket     | Limit  | `clientKey()` call site |
| --------------------------------- | ---------- | ------ | ----------------------- |
| `/api/public/erp/register`        | `register` | 10/min | `register.ts:34`        |
| `/api/public/erp/payments`        | `payments` | 10/min | `payments.ts:31`        |
| `/api/public/erp/check-subdomain` | `checks`   | 30/min | `check-subdomain.ts:32` |
| `/api/public/erp/check-email`     | `checks`   | 30/min | `check-email.ts:31`     |
| `/api/public/erp/packages`        | `catalog`  | 60/min | `packages.ts:31`        |
| `/api/public/erp/methods`         | `catalog`  | 60/min | `methods.ts:31`         |
| `/api/public/erp/verify`          | `verify`   | 60/min | `verify.ts:32`          |

### Register-abuse review

| Abuse                                             | Control today                                                           | Gap                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bulk tenant creation (one ERP tenant per request) | `register` bucket 10/min/IP after the P4.22 fix, plus reCAPTCHA         | Limits are **per instance** and in-memory; a horizontally scaled deployment multiplies the effective rate. Needs Redis before scale-out                                                                                                                                                                         |
| Subdomain / email enumeration                     | `checks` bucket 30/min/IP shared by both probe routes                   | Bucket key was previously spoofable; fixed. Enumeration is still possible at a low rate by design                                                                                                                                                                                                               |
| Registration with a disposable/invalid address    | `validateRecaptcha` on `/register`; ERP-side tenant creation validation | reCAPTCHA is **fail-open when the key pair is absent** (`lib/recaptcha.ts:5-7` returns early). Production renders the pair explicitly (both-or-neither, real keys only), so the control is active there — but it is silent when unset. Recorded as a finding; the fail-open decision belongs to the P4.24 audit |
| Payment-step abuse                                | `payments` bucket 10/min/IP                                             | The step has **no captcha** — and the previously declared `erpPaymentSchema.recaptchaToken` field was removed by P4.22 because nothing consumed it: `.strict()` declared a bot check that did not exist, and the funnel client never sent it                                                                    |
| Order-reference enumeration via `/verify`         | `verify` bucket 60/min/IP + reference shape `min(8)/max(64)`            | 60/min is sized for the 15-attempt success-page poll; it is not a strong anti-enumeration control on its own                                                                                                                                                                                                    |

### Scaling recommendation

The limiter is **in-memory and per instance** (`lib/rateLimit.ts`, decision P4.8). Every number above must be
read as _per container_. **Before running more than one platform instance, move the store behind Redis**
(keep the `RateLimiter` interface so the call sites do not change): with `N` replicas the effective limit
becomes `N × max`, and a single attacker spread across replicas is no longer bounded. This is the standing
P4.8 decision, restated here because P4.22's fix makes the bucket key trustworthy but does not make the
storage shared.

## References

- `lib/rateLimit.ts` — `resolveClientIp()`/`clientKey()` (P4.22 trust model) · `lib/env.ts` (`rateLimit.trustedProxyHops`) · `docs/env-matrix.md` §3.4 · `__tests__/lib/rateLimit.spec.ts`
- `middleware.ts` · `lib/env.ts` (security flags) · `lib/guardPlatformAdmin.ts` · `lib/recaptcha.ts` · `lib/crypto/erpToken.ts` · `lib/erp/handoff.ts` · `lib/email/utils.ts` (`buildRenewalUrl`)
