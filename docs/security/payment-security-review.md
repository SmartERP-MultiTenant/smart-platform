# Payment security review — PCI scope, CSP, rate limits, enumeration, PII

> **Artifact for:** PG-52 · `123q2bpew2t` (payment security review) and P4.24 · `123q2bpebbj`
> (CSP `unsafe-*` / COEP audit + server-side payment-domain allow-list).
> **Baseline:** `smart-platform` `main` @ `5544330`. Every claim below was read off that commit.
> **Scope of the code reviewed:** the `smart-platform` BFF and browser surfaces only
> (`pages/api/public/erp/**`, `lib/erp.ts`, `lib/zod/erp.ts`, `lib/rateLimit.ts`, `middleware.ts`,
> `components/erp/**`). The ERP side (`SmartAndPro.ERP.WebAPI` — `PaymentService`, the gateway providers, the
> `Payments` tables, the secret store) is a **different repository and is NOT covered here**; where a finding
> depends on it, it is marked as such.

## 0. How to read this document

Three states are used, and they are **not** interchangeable:

| Marker          | Meaning                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **ON MAIN**     | True of `5544330`. This is the shipped production behaviour.                                                               |
| **OPEN BRANCH** | Fixed or changed on an **unmerged** branch that existed while this review was written. It is **not** production behaviour. |
| **UNVERIFIED**  | Could not be established from this repository. The document says what would settle it.                                     |

> **⚠️ Reviewer:** every **OPEN BRANCH** row is a claim about a pull request, not about the product. Do not
> read this document as evidence that the fix is live. A confidently-wrong security review is worse than a
> short one, so each such row names the branch explicitly.

## 1. PCI scope

**Statement: the `smart-platform` origin is not in the cardholder-data environment.**

The payer surface is a **hosted redirect** (see `docs/decisions/pg16-hosted-redirect.md`): the kit asks the ERP
to create a payment, receives a `paymentUrl`, and performs a full-page navigation to the gateway's own origin,
where the customer enters their card details.

Verified in this repository:

| Check                                         | Command                                                                                                                       | Result                                                                                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| No card-data field is rendered                | `grep -rniE 'cardNumber\|card-number\|card_number\|\bcvc\b\|\bcvv\b\|\bpan\b\|securityCode\|expiryDate' components pages lib` | **0 hits**                                                                                                                                           |
| No gateway SDK is loaded                      | `grep -rniE 'moyasar\|tabby\|tamara\|oppwa\|hyperpay\|paymob' components pages lib`                                           | Only a host **allow-list** (`components/erp/PaymentActivation.tsx:21-26`), brand **labels**, and legal prose. No SDK, no `<script src>` to a gateway |
| No embedded payer frame                       | `grep -rn '<iframe' components pages lib`                                                                                     | **0 hits**                                                                                                                                           |
| The redirect is a navigation, not a form post | `components/erp/PaymentActivation.tsx:163` `window.location.assign(targetUrl)`                                                | Confirmed                                                                                                                                            |

**Consequence:** SAQ-A-class posture for this origin. This holds **only** while the hosted-redirect decision
stands — embedding a form SDK would invalidate it (`docs/decisions/pg16-hosted-redirect.md` §5).

**Not covered by this statement:** the ERP's own PCI position, the gateway's, and anything about card data at
rest. Those live in other systems and other repositories.

## 2. Anonymous payment surface inventory

All five routes are reachable without authentication — `middleware.ts:238` allow-lists `/api/public/erp/**` in
`unAuthenticatedRoutes`.

| Route                      | Verb | Limiter site (the `if (!limiters…` line) | Rate limit (ON MAIN) | Reaches                                             |
| -------------------------- | ---- | ---------------------------------------- | -------------------- | --------------------------------------------------- |
| `/api/public/erp/packages` | GET  | `pages/api/public/erp/packages.ts:31`    | `catalog` 60/min     | `GET /platform/TenantRegistration/catalog/packages` |
| `/api/public/erp/methods`  | GET  | `pages/api/public/erp/methods.ts:31`     | `catalog` 60/min     | `GET /payments/methods?country=SA`                  |
| `/api/public/erp/payments` | POST | `pages/api/public/erp/payments.ts:31`    | `payments` 10/min    | `POST /payments`                                    |
| `/api/public/erp/verify`   | GET  | `pages/api/public/erp/verify.ts:32`      | `verify` 60/min      | `GET /payments/verify/{reference}`                  |
| `/api/public/erp/orders`   | POST | `pages/api/public/erp/orders.ts:64`      | `payments` 10/min    | `GET /platform/TenantRegistration/catalog/packages` |

> **OPEN BRANCH (`integrate/all-tickets`):** `/api/public/erp/orders` does **not** exist on main. It is the
> server-authoritative order creation added by PG-06, and it is the only way to obtain a payable order — the
> payment route will not price a request without an `intent` from it (or a `packageId` it can look up). It
> shares `limiters.payments` rather than owning a bucket, because it performs the same class of work as
> payment creation: one priced ERP read per call. Adding a route to this inventory is exactly the kind of
> omission this section exists to prevent, so it is recorded here in the same change that ships it.

Plus the registration-funnel reads (`check-email`, `check-subdomain`, `register` — `checks` 30/min,
`register` additionally captcha-gated) which are outside the payment scope.

Bucket definitions: `lib/rateLimit.ts:43-62`. All five payment routes take the limiter **first**, before
validation, so a malformed request still consumes budget.

## 3. Rate-limiting model

### 3.1 The bypass (ON MAIN — highest-severity finding in this review)

`lib/rateLimit.ts:66-71` derives the bucket key from the **leftmost** `x-forwarded-for` hop:

```ts
const forwarded = req.headers['x-forwarded-for']?.toString();
const ip = forwarded?.split(',')[0]?.trim();
return ip || req.socket?.remoteAddress || 'unknown';
```

`X-Forwarded-For` is **append-only**: each proxy appends the address it saw. The leftmost entry is therefore
the **first** value in the chain — i.e. whatever the caller sent. A caller who rotates one header mints a fresh
bucket per request, which makes the `payments` (10/min) and `verify` (60/min) ceilings — and every other public
limit — **fully bypassable**.

### 3.2 The corrected model (OPEN BRANCH — `feat/rate-limit-trust`, PR #70)

The key is read from the **right** end of the chain, behind an explicit hop count
(`RATE_LIMIT_TRUSTED_HOPS`, default 2, matching the confirmed Cloudflare → nginx → app topology). A caller can
only ever **append** to the chain, never shorten it, so no configuration returns an attacker-chosen value.

> **ON MAIN this is not in effect.** Until #70 merges, treat every limit in §2 as advisory and treat
> `/api/public/erp/payments` as unthrottled against a determined attacker.

### 3.3 Residual (both states)

The limiter is **in-process and per-instance** — `RateLimiter` holds a plain in-memory `Map<string, number[]>`
(`lib/rateLimit.ts:18-19`), and `limiters` (`:43-62`) is a module-level singleton. With more than one app container the
effective limit multiplies by the replica count, and a restart resets every bucket. A shared store (Redis) is
the standard remedy; it is **not implemented** and is recorded as an open item in §9.

## 4. Content-Security-Policy matrix

Generated by `generateCSP()` in `middleware.ts:95-196`, minted per request with a fresh nonce
(`middleware.ts:26-33`), delivered as a request header and read back by `pages/_document.tsx:38-41`, which
forwards it to `Head` and `NextScript` (`:66`, `:76`). `upgrade-insecure-requests` is appended only on https
origins (`middleware.ts:44-46`, `:191-193`) — on a plain-http origin that rewrite destroys same-origin form
POSTs.

| Directive                   | Line       | Sources                                                                                                                   | Why                                                                                                                  | Load-bearing today?                                      |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `default-src`               | `:110`     | `'self'`                                                                                                                  | Deny-by-default floor                                                                                                | Yes                                                      |
| `img-src`                   | `:111-123` | `'self'`, `boxyhq.com`, `*.boxyhq.com`, `*.dicebear.com`, `data:`, + 6 gateway families                                   | Demo avatars (Dicebear), BYOHQ SSO marks, `data:` inline images; gateway hosts are **defensive**                     | Partly — gateway entries are inert (see §4.1)            |
| `script-src`                | `:124-134` | `'self'` + `'nonce-…'` [+ `'unsafe-eval'` in **development only**], `*.gstatic.com`, `*.google.com`, + 6 gateway families | reCAPTCHA; nonce authorises anything Next inlines; gateway hosts defensive                                           | Yes (self/nonce/google); gateway entries inert           |
| `style-src`                 | `:135-144` | `'self'`, **`'unsafe-inline'`**, + 6 gateway families                                                                     | JSX `style={{ … }}` props are used across the UI                                                                     | Yes — this is the one remaining `unsafe-*` in production |
| `connect-src`               | `:145-158` | `'self'`, `*.google.com`, `*.gstatic.com`, `boxyhq.com`, `*.ingest.sentry.io`, `*.mixpanel.com`, + 6 gateway families     | reCAPTCHA, Jackson, Sentry, Mixpanel; gateway hosts defensive                                                        | Yes (self/sentry/mixpanel)                               |
| `frame-src`                 | `:159-169` | `'self'`, `*.google.com`, `*.gstatic.com`, + 6 gateway families                                                           | reCAPTCHA challenge frame; gateway hosts defensive                                                                   | Partly                                                   |
| `font-src`                  | `:170`     | `'self'`, `*.moyasar.com` (**no Tabby/Tamara/others**)                                                                    | —                                                                                                                    | **No** — see §4.2                                        |
| `object-src`                | `:171`     | `'none'`                                                                                                                  | Kills Flash/PDF-plugin vectors                                                                                       | Yes                                                      |
| `base-uri`                  | `:172`     | `'self'`                                                                                                                  | Blocks `<base>` hijacking                                                                                            | Yes                                                      |
| `form-action`               | `:173-182` | `'self'`, ERP client origin(s) from config (`:61-83`), + 6 gateway families                                               | The ERP token handoff is a cross-origin hidden POST form; `form-action` — not `connect-src`/`frame-src` — governs it | Yes (self + ERP client); gateway entries inert           |
| `frame-ancestors`           | `:183`     | `'none'`                                                                                                                  | Anti-clickjacking                                                                                                    | Yes                                                      |
| `upgrade-insecure-requests` | `:191-193` | https origins only                                                                                                        | Force https sub-resources                                                                                            | Yes in production                                        |

### 4.1 Finding: the gateway sources are defensive, not load-bearing

Under the hosted-redirect decision (`docs/decisions/pg16-hosted-redirect.md`) **no gateway resource is loaded
into the kit origin**: the payer page is a different origin entirely. So the six gateway families in
`script-src`, `style-src`, `connect-src`, `frame-src` and `form-action` are **inert** — they are not what makes
the current flow work.

They are harmless (an allow-list entry that is never used grants nothing), and they make a future embed
possible without a CSP change. But they should not be read as evidence that the kit integrates the gateways, and
they are the reason the `font-src` asymmetry below is **not** a defect.

The one place a gateway source _could_ become load-bearing is `img-src`: the ERP method catalogue carries an
`iconUrl` (`lib/erp.ts:67`), and **if** the picker renders gateway-hosted icons, `img-src` must allow that host.
**ON MAIN** `iconUrl` is declared but **never rendered** (`grep -rn iconUrl components pages lib` → only the
type declaration), so this is latent, not live. (Rendering them also requires the host in
`next.config.js` `images.remotePatterns`, which today contains only `files.stripe.com`.)

### 4.2 Finding: `font-src` covers Moyasar only — **NOT a defect**, but recorded

`middleware.ts:170` is `font-src 'self' *.moyasar.com`. Tabby, Tamara, Paymob, HyperPay/oppwa fonts are not
allowed.

**Verdict: no change required, and none was made.** Tabby/Tamara are never embedded, so no Tabby/Tamara font is
ever requested from the kit origin — the directive would only matter if a gateway were framed, which the hosted
redirect decision rules out. Widening the policy would grow the attack surface to permit a request that cannot
occur. Evidence: no `<iframe>` in the app (§1) and no gateway SDK is loaded (§1).

**What would settle it:** a paid-funnel re-test against the real gateways with the browser console open,
asserting **zero** CSP violations. That test is **blocked on the ERP's live gateway keys** (`PG-11`, `PG-12`)
and is the outstanding item on `P2.13`. Until it runs, the correct state is "unverified against live gateways",
not "known good".

### 4.3 Finding: dev-only `'unsafe-eval'`

`middleware.ts:101-103` pushes `'unsafe-eval'` into `script-src` when `NODE_ENV === 'development'`. Production
is unaffected. The e2e guard does not catch a regression here because `playwright.config.ts` runs the
**production** server (`npm run start`), so `tests/e2e/security/csp.spec.ts` asserts the production shape.

**Status: accepted exception.** It is required by the Next.js dev overlay / react-refresh runtime. Risk is
confined to developer machines. Recorded so the policy's "no `unsafe-eval`" claim is understood as
production-only.

### 4.4 Finding: `style-src 'unsafe-inline'` remains in production

`middleware.ts:137`. The rationale is documented in the code (`:91-94`, decision D2): JSX `style={{ … }}` props
are used across the UI, and React does not currently support CSP3 nonces/`style-src-attr` hashes for inline
style attributes.

**Status: accepted exception, dated.** The follow-up is the CSP3 `style-src-attr` split. It is **not
implemented** and is recorded in §9. Real risk is low (style injection, not script execution) but non-zero.

## 5. Security-headers reality check — COEP is currently never sent

`SECURITY_HEADERS` (`middleware.ts:10-16`) includes `Cross-Origin-Embedder-Policy: require-corp`,
`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-site`. They are applied in
exactly two places, **both gated on `env.securityHeadersEnabled`**:

- `nextWithCsp(req, includeSecurityHeaders)` — the set is added only when `includeSecurityHeaders` is true
  (`middleware.ts:296`), and the public funnel calls it with `false` (`:398`);
- `withSecurityHeaders()` for denied responses (`middleware.ts:266`).

`env.securityHeadersEnabled` is `process.env.SECURITY_HEADERS_ENABLED ?? false` (`lib/env.ts:7`), and
`SECURITY_HEADERS_ENABLED` is:

- **absent from `.env`** (verified: `grep -n SECURITY_HEADERS_ENABLED .env .env.e2e` → no match),
- **absent from `.env.example`** — documented as such in `docs/env-matrix.md:99`,
- **absent from the CI workflow** (`.github/workflows/main.yml`).

**Therefore, ON MAIN, `require-corp` / `same-origin` / `same-site` are never sent in any environment.** The
public funnel receives the **CSP only**, by design (`middleware.ts:275-281` defers COEP on public pages because
they may embed third-party payment iframes).

Two things follow, and they pull in opposite directions:

1. **No live COEP breakage.** A COEP `require-corp` policy is the classic cause of "our images/iframes stopped
   loading"; it is not actually on, so there is no such outage. The P4.24 concern about
   `require-corp` risk is **real in principle but not currently exercised**.
2. **A fail-open configuration trap.** The value is read as a **raw string**. Setting
   `SECURITY_HEADERS_ENABLED=false` yields the string `"false"`, which is **truthy** in JavaScript, so the
   headers would be **enabled** by a value that reads as "disabled". Nothing in the repo sets it, so this is a
   latent trap rather than an active misconfiguration. **UNVERIFIED:** what the production VPS `.env` contains
   — the deploy job renders only `ENV_*` secrets, so this key must be hand-set on the box if it is set at all.
   **What would settle it:** `grep SECURITY_HEADERS_ENABLED /var/www/multitenant-smart-and-pro/.env` on the VPS.

**Recommendation (not implemented here — it is a behaviour change, not an audit):** coerce the value
(`process.env.SECURITY_HEADERS_ENABLED === 'true'`) and decide the COEP route scope explicitly. Both are
listed in §9.

## 6. Enumeration

`GET /api/public/erp/verify` (`pages/api/public/erp/verify.ts:32-50`) accepts a reference of **1–100
characters** with **no format constraint** and no authentication. The only control is the `verify` bucket
(60/min, `lib/rateLimit.ts:61`).

**ON MAIN** that control is bypassable (§3.1) **and** the reference space is small and guessable: the client
mints it as `` `pay-${packageId.slice(0,8)}-${Date.now()}` `` (`components/erp/PaymentActivation.tsx:120`) —
a fixed prefix, an 8-character slice of a package UUID, and a millisecond timestamp. An attacker who knows (or
enumerates) a package id can generate a narrow candidate window around a plausible payment time.

What an attacker learns from a hit is `{ success, status }` (`ErpVerifyResult`, `lib/erp.ts:90-93`) — a boolean
and a tri-state, not customer PII. **Impact: low.** The reference is not a bearer credential: it does not
authenticate anything and does not let the attacker act on the payment.

**Mitigation status:** server-minted, high-entropy references are part of **PG-06** and are implemented on the
branch `feat/server-authoritative-orders` — **OPEN BRANCH, not merged**. Until then the enumeration window
above stands.

## 7. Input authority — who sets the price? (ON MAIN: the client)

This is the most consequential payment-specific finding in this review, and it is a correctness/abuse issue
rather than a classic injection.

`POST /api/public/erp/payments` accepts `amount` and `orderReference` **from the request body**:

- `lib/zod/erp.ts:21-42` — `erpPaymentSchema` validates `orderReference` **shape only** (8–64 chars,
  `[a-zA-Z0-9_-]`) and `amount` only as `z.number().positive()`. There is no cross-check against the package.
- `pages/api/public/erp/payments.ts:48` forwards the parsed body to the ERP **verbatim**.
- `components/erp/PaymentActivation.tsx:120` mints the reference client-side and `:133` sends
  `amount: pkg.priceMonthly` from the client's own copy of the catalogue.

**No `packageId` is sent to the server**, so the server cannot re-derive the price. A crafted request can
therefore name its own price for any known package. Whether that is exploitable **depends on the ERP
re-validating the amount server-side** — which is **not verifiable from this repository** and is the ERP half
of PG-06.

**Mitigation status:** server-minted `orderReference`, the price resolved server-side from `packageId`, and
rejection of client-supplied `amount`/`orderReference` are implemented on `feat/server-authoritative-orders`
(**OPEN BRANCH, not merged**).

## 8. PII and error redaction

### 8.1 ON MAIN — the public BFF echoes upstream error text

All four routes share the same catch-all:

```ts
const message = error.message || 'Something went wrong';
res.status(status).json({ error: { message } });
```

(`pages/api/public/erp/payments.ts:22-27`, `:verify.ts:21-26`, `:methods.ts:21-26`, `:packages.ts:21-26`.)

`ErpApiError.message` is populated **verbatim** from the ERP response body
(`lib/erp.ts:342-347`: `data?.error` / `data.error.message` / `data.message`). So an anonymous caller receives
upstream failure text — including whatever an upstream error page or exception handler chose to say. A
classifier that produces stable, non-revealing codes already exists (`classifyErpError`, `lib/erp.ts:260`) and
is used by the **admin** routes (e.g. `pages/api/admin/rules/index.ts:65`) but **not** by the public BFF
(`grep -rn classifyErpError pages/api/public` → 0 hits).

**Status: OPEN BRANCH.** `feat/erp-response-contract` (PR #73) routes all four public routes through the
classifier and answers stable codes.

### 8.2 Not transmitted to the browser

No token material reaches a client payload on the payment funnel: `erpAccessToken` and `platformApiKey` are read
server-side only (`pages/api/teams/[slug]/erp.ts:41,47`). The registration funnel does hold the ERP
**auth token** in `sessionStorage` (`components/erp/RegisterFunnel.tsx:193-202`); that is tracked under
P4.23 and is **not** a payment-route concern, but it is adjacent and is listed in §9.

## 9. Findings table

| #   | Finding                                                                                                                                         | Severity                    | ON MAIN state       | Open-branch state                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | `clientKey()` trusts the leftmost `X-Forwarded-For` hop → every public rate limit is bypassable by rotating one header                          | **High**                    | **Open**            | Fixed on `feat/rate-limit-trust` (PR #70)                                                                   |
| 2   | Price authority is client-side — `amount` and `orderReference` are body fields the BFF forwards verbatim                                        | **High**                    | **Open**            | Fixed on `feat/server-authoritative-orders` (server-mints ref, derives price from `packageId`) — PR pending |
| 3   | `paymentUrl` / `callbackUrl` host allow-list is **client-side only**; the server accepts any well-formed URL and forwards it to the ERP         | **High**                    | **Open**            | Addressed on `feat/server-authoritative-orders`                                                             |
| 4   | Public BFF echoes upstream `error.message` to anonymous callers (no `classifyErpError`)                                                         | **Medium**                  | **Open**            | Fixed on `feat/erp-response-contract` (PR #73)                                                              |
| 5   | Rate limiting is in-process and per-replica; no shared store                                                                                    | **Medium**                  | **Open**            | Still open — no branch                                                                                      |
| 6   | `SECURITY_HEADERS_ENABLED` read as a raw string → `"false"` is truthy; and COEP/COOP/CORP are never sent in any environment today               | **Medium**                  | **Open**            | Still open — no branch                                                                                      |
| 7   | `style-src 'unsafe-inline'` in production (`style-src-attr` split not implemented)                                                              | **Low**                     | Accepted, dated     | Still open                                                                                                  |
| 8   | Dev-only `'unsafe-eval'` in `script-src`                                                                                                        | **Low**                     | Accepted (dev only) | n/a                                                                                                         |
| 9   | Order-reference enumeration window (guessable client-minted reference, no format constraint on `verify`)                                        | **Low** (no PII, no action) | **Open**            | Tightened by `feat/server-authoritative-orders`                                                             |
| 10  | `font-src` covers Moyasar only, not Tabby/Tamara/others                                                                                         | **Informational**           | **Not a defect**    | No change made — see §4.2                                                                                   |
| 11  | Gateway sources in `script-src`/`style-src`/`connect-src`/`frame-src`/`form-action` are inert under the hosted-redirect decision                | **Informational**           | By design           | n/a                                                                                                         |
| 12  | ERP auth token held in `sessionStorage` in the registration funnel                                                                              | **Low**                     | **Open**            | Tracked under P4.23                                                                                         |
| 13  | ERP-side controls (webhook authentication, server-side confirmation, provider authenticity, refund implementation, secret storage, idempotency) | **Not assessed**            | —                   | **Out of scope — different repository.** Owned by `PG-11`, `PG-12`, `PG-13`, `PG-14`, `PG-03`, `PG-05`      |

## 10. Open items and how each would be settled

| Item                                                               | Owner               | How to settle                                                                                                                                                                           |
| ------------------------------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Findings 1–4 (open branches)                                       | platform            | Merge the branches, then re-run this review against the new `main`. Re-verify that a rotated `XFF` cannot mint a new bucket and that no upstream message reaches the browser.           |
| Finding 5 — shared rate-limit store                                | platform / ops      | Decide Redis vs single-replica. Trigger: horizontal scaling, or evidence of bucket reset on deploy.                                                                                     |
| Finding 6 — `SECURITY_HEADERS_ENABLED` coercion + COEP route scope | platform / security | Read the production `.env` on the VPS; coerce the boolean; decide explicitly whether public funnel pages take COEP. `redirectUrl`-adjacent risk is nil today because the header is off. |
| Finding 7 — `style-src-attr` split                                 | platform            | Inventory inline `style` attributes; move to classes or adopt CSP3 `style-src-attr`.                                                                                                    |
| Finding 9 — reference format                                       | platform            | Server-minted reference (finding 2) plus a charset/length constraint on `verify`'s `reference` param.                                                                                   |
| Finding 12 — `sessionStorage` token                                | platform            | P4.23. Move to an httpOnly cookie or a short-lived server-side session.                                                                                                                 |
| §4.2 — live-gateway CSP verification                               | platform + ERP      | A paid-funnel re-test against real gateway keys with a console CSP-violation assertion. Blocked on the ERP's live keys (`PG-10`, `PG-11`, `PG-12`).                                     |
| ERP-side controls (finding 13)                                     | ERP team            | Out of scope here. Until that review exists, this document must not be cited as covering the payment system end to end.                                                                 |

## 11. Reproduce

```bash
cd smart-platform && git checkout 5544330

# No card-data field, no SDK, no iframe
grep -rniE 'cardNumber|card-number|card_number|\bcvc\b|\bcvv\b|\bpan\b|securityCode|expiryDate' components pages lib
grep -rniE 'moyasar|tabby|tamara|oppwa|hyperpay|paymob' components pages lib
grep -rn '<iframe' components pages lib

# Client-side-only destination validation
grep -n 'isAllowedPaymentUrl\|window.location.assign' components/erp/PaymentActivation.tsx

# The XFF bypass
sed -n '64,72p' lib/rateLimit.ts

# Client-supplied amount / reference
sed -n '21,44p' lib/zod/erp.ts
sed -n '115,142p' components/erp/PaymentActivation.tsx

# Upstream error echo
sed -n '16,24p' pages/api/public/erp/payments.ts

# COEP gate + its default
sed -n '11,16p' middleware.ts && sed -n '7p' lib/env.ts && grep -rn SECURITY_HEADERS_ENABLED .env .env.example .github/workflows/main.yml
```
