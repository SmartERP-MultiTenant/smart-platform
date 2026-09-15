# Payment security review — PCI scope, CSP, rate limits, enumeration, PII

> **Artifact for:** PG-52 · `123q2bpew2t` (payment security review) and P4.24 · `123q2bpebbj`
> (CSP `unsafe-*` / COEP audit + server-side payment-domain allow-list).
> **Baseline:** `smart-platform` `main` @ `5544330`. Every claim below was read off that commit. The
> before/after framing is kept deliberately: the baseline is what production ran while this review was
> written, and it is what most of the findings describe.
> **Scope of the code reviewed:** the `smart-platform` BFF and browser surfaces only
> (`pages/api/public/erp/**`, `lib/erp.ts`, `lib/zod/erp.ts`, `lib/rateLimit.ts`, `middleware.ts`,
> `components/erp/**`). The ERP side (`SmartAndPro.ERP.WebAPI` — `PaymentService`, the gateway providers, the
> `Payments` tables, the secret store) is a **different repository and is NOT covered here**; where a finding
> depends on it, it is marked as such.

## 0. How to read this document

Two states plus one escape hatch are used, and they are **not** interchangeable:

| Marker                 | Meaning                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **BEFORE THIS CHANGE** | True of the baseline `main` @ `5544330` — what production ran while this review was written, and what its findings describe. |
| **IN THIS CHANGE**     | True of the tree this document ships in.                                                                                     |
| **UNVERIFIED**         | Could not be established from this repository. The document says what would settle it.                                       |

> **Reader:** this review was written to assess the baseline, and it now ships in the same change as the fixes
> it recommends. A claim marked **IN THIS CHANGE** is true of the code in this commit; a claim marked
> **BEFORE THIS CHANGE** describes the state the finding was raised against. Nothing was re-labelled from
> "open" to "fixed" without re-reading the code.

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

| Route                      | Verb | Limiter site (the `if (!limiters…` line) | Rate limit        | Reaches                                             |
| -------------------------- | ---- | ---------------------------------------- | ----------------- | --------------------------------------------------- |
| `/api/public/erp/packages` | GET  | `pages/api/public/erp/packages.ts:31`    | `catalog` 60/min  | `GET /platform/TenantRegistration/catalog/packages` |
| `/api/public/erp/methods`  | GET  | `pages/api/public/erp/methods.ts:31`     | `catalog` 60/min  | `GET /payments/methods?country=SA`                  |
| `/api/public/erp/payments` | POST | `pages/api/public/erp/payments.ts:31`    | `payments` 10/min | `POST /payments`                                    |
| `/api/public/erp/verify`   | GET  | `pages/api/public/erp/verify.ts:32`      | `verify` 60/min   | `GET /payments/verify/{reference}`                  |
| `/api/public/erp/orders`   | POST | `pages/api/public/erp/orders.ts:64`      | `payments` 10/min | `GET /platform/TenantRegistration/catalog/packages` |

> **`/api/public/erp/orders` (IN THIS CHANGE)** is the server-authoritative order creation added by PG-06, and
> it is the only way to obtain a payable order — the payment route will not price a request without an
> `intent` from it (or a `packageId` it can look up). It shares `limiters.payments` rather than owning a
> bucket, because it performs the same class of work as payment creation: one priced ERP read per call.
> Adding a route to this inventory is exactly the kind of omission this section exists to prevent, so it is
> recorded here in the same change that ships it. It did not exist on the baseline, which is why the original
> four-route inventory above and the §8.1 count needed revisiting.

Plus the registration-funnel reads (`check-email`, `check-subdomain`, `register` — `checks` 30/min,
`register` additionally captcha-gated) which are outside the payment scope.

Bucket definitions: `lib/rateLimit.ts:43-62`. All five payment routes take the limiter **first**, before
validation, so a malformed request still consumes budget.

## 3. Rate-limiting model

### 3.1 The bypass (BEFORE THIS CHANGE — highest-severity finding in this review)

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

### 3.2 The corrected model (IN THIS CHANGE)

The key is read from the **right** end of the chain, behind an explicit hop count
(`RATE_LIMIT_TRUSTED_HOPS`, default 2, matching the confirmed Cloudflare → nginx → app topology). A caller can
only ever **append** to the chain, never shorten it, so no configuration returns an attacker-chosen value.

The value must equal the real proxy count, and the two directions of error are **not** symmetric. Set **too
low**, the key becomes coarser than intended (clients behind one proxy share a bucket) — a self-inflicted
throttle, never spoofable. Set **too high**, the key can land on the **caller's own** entries, which is a full
bypass. When in doubt, lower it, never raise it. A boundary test pins this.

> **The precondition this fix depends on is NOT enforced by this repository.** The model assumes every request
> actually traverses the proxies. A request reaching the container **directly** (no Cloudflare, no nginx) has
> `p = 0`, and then **no** header-based scheme can separate caller data from real chain entries — the key is
> attacker-controlled whatever the hop count is. `docker-compose.prod.yml:42` publishes `5032:4002` on all
> interfaces; whether that path is reachable is a **deployment** fact. **UNVERIFIED from here** — recorded as
> finding 14 in §9. What would settle it: confirm the host firewall restricts 5032 to the proxy, or bind it to
> loopback (`127.0.0.1:5032:4002`).

### 3.3 Residual — the limiter store (unchanged by this change)

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

**`img-src` is the exception, and it is no longer latent.** The ERP method catalogue carries an `iconUrl`, and
**IN THIS CHANGE** two surfaces render it: the payment-method picker
(`components/erp/PaymentActivation.tsx:434`, `<MethodIcon src={resolveMethodIconUrl(method.iconUrl)} />`) and
the landing trust strip (`components/landing/TrustStrip.tsx:48-51`). The six gateway families in `img-src` are
therefore load-bearing for any gateway-hosted icon the ERP returns, not merely defensive. The original review
read `iconUrl` as declared-but-never-rendered; that was true of the baseline.

Both renderers guard the value identically and stop at the same boundary: **https only**. A `data:` value or a
relative URL is refused (`resolveMethodIconUrl`, `components/erp/PaymentActivation.tsx:79-93`; `readIconUrl`,
`lib/paymentBrands.ts:97-113`), because a `data:` icon would be attacker-controlled markup in our own DOM.
Neither applies a **host** allow-list. The ERP supplies the URL, so the only control keeping an unexpected host
out of the page is CSP `img-src` itself — which fails the request and (for the picker) hides the image rather
than showing a broken glyph. That is an acceptable outcome, but it is a CSP-only control and is recorded here
rather than left implicit.

Neither renderer uses `next/image`: the ERP icon host is absent from `next.config.js` `images.remotePatterns`,
and `next/image` throws at runtime for a non-allowlisted remote host. Adding that host is the correct fix and
would also let the optimizer serve the icons.

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

**Therefore, in this tree, `require-corp` / `same-origin` / `same-site` are never sent in any environment.** The
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

**Mitigation status: IN THIS CHANGE.** The reference a customer's order actually carries is now minted by the
server — `ord_` + 24 random bytes base64url (`lib/payments/orderIntent.ts:170`) — and the client no longer
invents one: `components/erp/PaymentActivation.tsx` takes it from the `/orders` response. There is therefore no
timestamp to bracket and no fixed prefix to guess, and the window described above no longer stands.

`GET /api/public/erp/verify` itself still accepts a 1–100 character reference with no format constraint. That
is unchanged here and is recorded rather than closed: against a high-entropy reference a shape constraint would
add little, but a caller probing an unrelated reference space still consumes the `verify` bucket (60/min) —
which §3.2 now keys on a value the caller cannot mint.

## 7. Input authority — who sets the price? (BEFORE THIS CHANGE: the client)

This is the most consequential payment-specific finding in this review, and it is a correctness/abuse issue
rather than a classic injection.

`POST /api/public/erp/payments` accepts `amount` and `orderReference` **from the request body**:

- `lib/zod/erp.ts:21-42` — `erpPaymentSchema` validates `orderReference` **shape only** (8–64 chars,
  `[a-zA-Z0-9_-]`) and `amount` only as `z.number().positive()`. There is no cross-check against the package.
- `pages/api/public/erp/payments.ts:48` forwards the parsed body to the ERP **verbatim**.
- `components/erp/PaymentActivation.tsx:120` mints the reference client-side and `:133` sends
  `amount: pkg.priceMonthly` from the client's own copy of the catalogue.

**No `packageId` is sent to the server**, so the server cannot re-derive the price. A crafted request can
therefore name its own price for any known package. Whether that was exploitable **depends on the ERP
re-validating the amount server-side** — which is **not verifiable from this repository** and is the ERP half
of PG-06.

**Mitigation status: IN THIS CHANGE.** The server mints the `orderReference` and resolves the price
server-side from `packageId`; the client now sends `packageId` (and the signed intent returned by
`/api/public/erp/orders`) rather than relying on its own copy of the catalogue. Client-supplied `amount` and
`orderReference` are no longer read — they are accepted and ignored so the live funnel keeps working, and the
server-derived value always wins. **The ERP half of PG-06 remains out of scope and open**: nothing here
substitutes for the ERP refusing to trust a client-supplied amount, and the request shape the ERP receives is
unchanged.

## 8. PII and error redaction

### 8.1 Upstream error text

**BEFORE THIS CHANGE, seven of the public ERP routes echoed upstream error text.** Each ended with the same
catch-all:

```ts
const message = error.message || 'Something went wrong';
res.status(status).json({ error: { message } });
```

The original draft of this review named **four** of them — `payments`, `verify`, `methods`, `packages` — and
**missed three**: `check-subdomain`, `check-email` and `register` carried the identical catch-all. Verified
against the baseline with `git show 5544330:pages/api/public/erp/<route>.ts` → the raw echo is present in all
seven; `orders` did not exist yet. Two of the three missed routes are enumeration probes, which is exactly the
surface a caller uses to read a leak.

`ErpApiError.message` is populated **verbatim** from the ERP response body, so an anonymous caller received
upstream failure text — including whatever an upstream error page or exception handler chose to say.

`register` carried a **second, value-shaped** leak on a different path. The ERP reports a rejected
registration as a **200** carrying `success: false` plus a human sentence, so `erpFetch` never threw and the
catch block never saw it; the route then forwarded `result.message` verbatim in a 400 body. Found while closing
the three missed routes above — not from the original review.

**Status: IN THIS CHANGE.** All **eight** public ERP routes now answer through one shared responder
(`lib/payments/publicErpError.ts`), whose body is always `{ error: { message: '<stable-code>' } }`. Verified in
this tree: `ls pages/api/public/erp/` → 8 route files; `grep -rln 'respondErpError|publicErpError'
pages/api/public/erp/` → all 8; `grep -rn 'error.message ||' pages/api/public/erp/` → **no hits**.

`classifyErpError` is what performs the mapping, reached through that shared responder. The old evidence
sentence — `grep -rn classifyErpError pages/api/public` → 0 hits — is still literally 0, because the call now
lives in `lib/payments/publicErpError.ts` rather than in the routes. The conclusion once drawn from that zero
("the public BFF does not use the classifier") no longer holds, and that grep should not be used as evidence
again.

### 8.2 Not transmitted to the browser

No token material reaches a client payload on the payment funnel: `erpAccessToken` and `platformApiKey` are read
server-side only (`pages/api/teams/[slug]/erp.ts:41,47`).

**IN THIS CHANGE**, the registration funnel no longer persists the ERP auth token at all. It previously wrote
`authToken` + `expiresIn` into `sessionStorage['erpLogin']` so the payment-success page could repeat a one-click
POST handoff minutes later — the gateway redirect destroys in-memory state, so `sessionStorage` was the only
place it could survive. That put a **live** credential in a JS-readable store for the remainder of the tab
session, written at registration and cleared only after the success page read it, so an **abandoned funnel**
left it there — including across a logout. What persists now is `{ subdomain, redirectTo }`
(`components/erp/RegisterFunnel.tsx:213-220`): a public hostname label and an allow-list-checked URL, neither of
which is a credential. The stored key keeps its name; only its contents changed.

## 9. Findings table

| #   | Finding                                                                                                                                                                                                          | Severity                                                                                                    | Baseline state      | State in this change                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | `clientKey()` trusts the leftmost `X-Forwarded-For` hop → every public rate limit is bypassable by rotating one header                                                                                           | **High**                                                                                                    | **Open**            | **Fixed** — rightmost-hop key + `RATE_LIMIT_TRUSTED_HOPS`                                              |
| 2   | Price authority is client-side — `amount` and `orderReference` are body fields the BFF forwards verbatim                                                                                                         | **High**                                                                                                    | **Open**            | **Fixed** — server mints the ref; price derived from `packageId`                                       |
| 3   | `paymentUrl` / `callbackUrl` host allow-list is **client-side only**; the server accepts any well-formed URL and forwards it to the ERP                                                                          | **High**                                                                                                    | **Open**            | **Fixed** — server-side `callbackUrl` / `paymentUrl` allow-lists                                       |
| 4   | Public BFF echoes upstream `error.message` to anonymous callers (no `classifyErpError`)                                                                                                                          | **Medium**                                                                                                  | **Open**            | **Fixed** — shared stable-code responder on all 8 public routes                                        |
| 5   | Rate limiting is in-process and per-replica; no shared store                                                                                                                                                     | **Medium**                                                                                                  | **Open**            | **Still open**                                                                                         |
| 6   | `SECURITY_HEADERS_ENABLED` read as a raw string → `"false"` is truthy; and COEP/COOP/CORP are never sent in any environment today                                                                                | **Medium**                                                                                                  | **Open**            | **Still open**                                                                                         |
| 7   | `style-src 'unsafe-inline'` in production (`style-src-attr` split not implemented)                                                                                                                               | **Low**                                                                                                     | Accepted, dated     | Still open                                                                                             |
| 8   | Dev-only `'unsafe-eval'` in `script-src`                                                                                                                                                                         | **Low**                                                                                                     | Accepted (dev only) | n/a                                                                                                    |
| 9   | Order-reference enumeration window (guessable client-minted reference, no format constraint on `verify`)                                                                                                         | **Low** (no PII, no action)                                                                                 | **Open**            | **Tightened** — server-minted high-entropy reference                                                   |
| 10  | `font-src` covers Moyasar only, not Tabby/Tamara/others                                                                                                                                                          | **Informational**                                                                                           | **Not a defect**    | No change made — see §4.2                                                                              |
| 11  | Gateway sources in `script-src`/`style-src`/`connect-src`/`frame-src`/`form-action` are inert under the hosted-redirect decision                                                                                 | **Informational**                                                                                           | By design           | n/a                                                                                                    |
| 12  | ERP auth token held in `sessionStorage` in the registration funnel                                                                                                                                               | **Low**                                                                                                     | **Open**            | **Fixed** — only `{ subdomain, redirectTo }` persists                                                  |
| 13  | ERP-side controls (webhook authentication, server-side confirmation, provider authenticity, refund implementation, secret storage, idempotency)                                                                  | **Not assessed**                                                                                            | —                   | **Out of scope — different repository.** Owned by `PG-11`, `PG-12`, `PG-13`, `PG-14`, `PG-03`, `PG-05` |
| 14  | The trusted-hop key derivation assumes every request actually traverses the proxies; a request reaching the container **directly** (`p = 0`) controls the entire `X-Forwarded-For` chain, whatever the hop count | **Medium** — conditional on deployment reachability, and not a regression (the baseline was bypassable too) | **Open**            | **Still open** — deployment-side, not code; see §3.2                                                   |

## 10. Open items and how each would be settled

| Item                                                               | Owner               | How to settle                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Findings 1–4, 9 and 12                                             | platform            | Re-verify **on the deployed environment** that a rotated `XFF` cannot mint a new bucket and that no upstream message reaches the browser. The code for all of these is in this change; what is outstanding is confirmation in a running environment, not a merge. The `/orders` → `intent` hand-off also needs one paid-path check, because no test drives a real browser through a real gateway. |
| Finding 14 — trusted-hop precondition (direct-port access)         | platform / ops      | Confirm the host firewall restricts port 5032 to the proxy, or bind the published port to loopback (`127.0.0.1:5032:4002`). Until then the hop-count key is only as strong as the network path.                                                                                                                                                                                                   |
| Finding 5 — shared rate-limit store                                | platform / ops      | Decide Redis vs single-replica. Trigger: horizontal scaling, or evidence of bucket reset on deploy.                                                                                                                                                                                                                                                                                               |
| Finding 6 — `SECURITY_HEADERS_ENABLED` coercion + COEP route scope | platform / security | Read the production `.env` on the VPS; coerce the boolean; decide explicitly whether public funnel pages take COEP. `redirectUrl`-adjacent risk is nil today because the header is off.                                                                                                                                                                                                           |
| Finding 7 — `style-src-attr` split                                 | platform            | Inventory inline `style` attributes; move to classes or adopt CSP3 `style-src-attr`.                                                                                                                                                                                                                                                                                                              |
| Finding 9 — reference format                                       | platform            | Server-minted reference (finding 2) plus a charset/length constraint on `verify`'s `reference` param.                                                                                                                                                                                                                                                                                             |
| Finding 12 — `sessionStorage` token                                | platform            | P4.23. Move to an httpOnly cookie or a short-lived server-side session.                                                                                                                                                                                                                                                                                                                           |
| §4.2 — live-gateway CSP verification                               | platform + ERP      | A paid-funnel re-test against real gateway keys with a console CSP-violation assertion. Blocked on the ERP's live keys (`PG-10`, `PG-11`, `PG-12`).                                                                                                                                                                                                                                               |
| ERP-side controls (finding 13)                                     | ERP team            | Out of scope here. Until that review exists, this document must not be cited as covering the payment system end to end.                                                                                                                                                                                                                                                                           |

## 11. Reproduce

```bash
cd smart-platform && git checkout 5544330   # the baseline these findings were raised against

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

To verify the state **this change** ships, the three greps that moved most are:

```bash
# All eight public routes answer through the shared responder; no raw echo remains
ls pages/api/public/erp/ | wc -l                                    # 8
grep -rln 'respondErpError|publicErpError' pages/api/public/erp/    # all 8
grep -rn 'error.message ||' pages/api/public/erp/                   # no hits

# The bucket key is read from the trusted end of the chain
grep -n 'chain\[chain.length - hops\]' lib/rateLimit.ts
```
