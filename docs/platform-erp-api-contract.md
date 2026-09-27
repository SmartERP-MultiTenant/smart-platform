# Platform ↔ ERP API Contract

> **Scope:** three distinct surfaces, and they must not be confused.
>
> | Part                       | Auth                               | Used by                        | Section |
> | -------------------------- | ---------------------------------- | ------------------------------ | ------- |
> | **M2M rules & modules**    | `X-Platform-ApiKey`                | the platform admin console     | §3      |
> | **Public funnel payments** | **none** (rate-limited, anonymous) | the customer-facing funnel BFF | §5      |
> | **Tenant status (JWT)**    | **ERP user `Bearer` JWT**          | the team billing page          | §7      |
>
> **Baseline:** read off `smart-platform` `main` @ `5544330`. Every endpoint and rule described here ships in
> the same change as this document. §6 records which of them the baseline lacked, so an older commit is not
> mistaken for a compliant one.

## 1. Overview & Architecture

This contract establishes the communication protocol between the SaaS Platform (`smart-platform`) and the ERP Backend (`SmartAndPro.ERP.WebAPI`).
The M2M endpoints in §3 are protected by the header `X-Platform-ApiKey` and do NOT require human user login or bearer sessions. The public funnel endpoints in §5 are anonymous by design and are protected by rate limiting instead of authentication.

## 2. Authentication

- **Header**: `X-Platform-ApiKey: <ERP_PLATFORM_API_KEY>`
- **ERP Validation**: Constant-time key comparison against configuration key `Platform:ApiKey`. Mismatch results in HTTP `401 Unauthorized`.

---

## 3. Endpoints

### 3.1 Get All System Modules

- **Method**: `GET /api/platform/billing/system-modules`
- **Response (200 OK)**:

```json
[
  {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "code": "ACCOUNTING",
    "name": "المحاسبة العامة",
    "description": "إدارة شجرة الحسابات والقيود اليومية والتقارير الختامية",
    "priceMonthly": 50.0,
    "priceYearly": 500.0,
    "isActive": true
  }
]
```

### 3.2 Get All Packages (Plans)

- **Method**: `GET /api/platform/billing/packages`
- **Response (200 OK)**:

```json
[
  {
    "id": "4fa85f64-5717-4562-b3fc-2c963f66afa7",
    "name": "الأساسية (Basic)",
    "description": "باقة مناسبة للمنشآت الصغيرة",
    "priceMonthly": 100.0,
    "priceYearly": 1000.0,
    "trialDays": 14,
    "isActive": true,
    "createdAt": "2026-09-01T00:00:00Z",
    "systemModules": [
      {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "code": "ACCOUNTING",
        "name": "المحاسبة العامة"
      }
    ],
    "systemModuleCodes": ["ACCOUNTING"]
  }
]
```

### 3.3 Get Package by ID

- **Method**: `GET /api/platform/billing/packages/{id}`
- **Response (200 OK)**: Single package object (same shape as above).
- **Response (404 Not Found)**: `{ "error": "Package not found." }`

### 3.4 Update Package Modules (Per-Plan Module Toggles)

- **Method**: `PUT /api/platform/billing/packages/{id}/modules`
- **Request Body**:

```json
{
  "systemModuleIds": [
    "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "7fa85f64-5717-4562-b3fc-2c963f66afa8"
  ],
  "syncExistingSubscriptions": true
}
```

- **Response (200 OK)**: Updated package object.
- **Propagation Semantics**:
  - When `syncExistingSubscriptions` is `true`, all active and trial subscriptions (`Status == Active || Status == Trial`) associated with this package have their `SubscriptionModules` updated: revoked modules are removed, and newly enabled modules are added.

### 3.5 Sync Subscription Modules

- **Method**: `POST /api/platform/billing/subscriptions/sync-modules`
- **Request Body**:

```json
{
  "packageId": "4fa85f64-5717-4562-b3fc-2c963f66afa7" // optional, null/empty syncs all packages
}
```

- **Response (200 OK)**:

```json
{
  "message": "Synchronized modules for 12 active subscriptions across 1 packages."
}
```

---

## 4. Single Source of Truth

- The ERP database (`Packages`, `SystemModules`, `PackageModules`, `SubscriptionModules`) is the canonical billing and rules source of truth.
- The Platform admin UI manages these rules exclusively through the M2M endpoints defined above.

---

## 5. Public Funnel Payment Endpoints (anonymous)

These are the ERP endpoints the customer-facing funnel consumes through the platform's BFF. They are
**anonymous** — an unauthenticated visitor must be able to see prices and pay — so the platform protects them
with rate limiting (`lib/rateLimit.ts:43-62`) rather than authentication. `middleware.ts:238` allow-lists
`/api/public/erp/**` in `unAuthenticatedRoutes`.

### 5.0 Provenance and authority

The point of this table is that **the platform's BFF is not the authority for the things it forwards**.

| Value                           | Produced by           | Authority                | Notes                                                                                                                                                                                                                       |
| ------------------------------- | --------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package catalogue & prices      | ERP                   | **ERP**                  | `GET /platform/TenantRegistration/catalog/packages`; the platform renders it, never edits it                                                                                                                                |
| Method catalogue & availability | ERP                   | **ERP**                  | `GET /payments/methods?country=SA`; `available` is the ERP's claim about its own gateways                                                                                                                                   |
| `orderReference`                | **the browser today** | _intended:_ ERP/platform | `components/erp/PaymentActivation.tsx:120` mints it client-side. Intended contract (§6): server-minted, high-entropy, unique                                                                                                |
| `amount`                        | **the browser today** | _intended:_ ERP/platform | `components/erp/PaymentActivation.tsx:133` sends `pkg.priceMonthly` from the client's catalogue copy; `lib/zod/erp.ts:28` only requires `positive()`. No `packageId` is sent, so the server cannot re-derive the price (§6) |
| `paymentUrl`                    | ERP gateway           | **ERP**                  | The only payer artifact the platform consumes                                                                                                                                                                               |
| Payment `status`                | ERP                   | **ERP**                  | The platform polls; it never decides                                                                                                                                                                                        |

### 5.1 Get payment methods

- **Method:** `GET /api/payments/methods?country=SA`
- **Platform wrapper:** `lib/erp.ts:390-391`
- **Platform BFF:** `GET /api/public/erp/methods` — `pages/api/public/erp/methods.ts:31`, `catalog` bucket 60/min
- **Response (200 OK):** `ErpPaymentMethod[]` — `lib/erp.ts:62-68`

```json
[
  {
    "key": "mada",
    "label": "mada",
    "provider": "moyasar",
    "available": true,
    "iconUrl": "https://..."
  }
]
```

- **`available` semantics.** The platform's _intended_ contract is that `available: false` means **do not
  offer this method**, and that a **missing** `available` is treated as unavailable (fail-closed) rather than
  as a promise. At baseline the BFF proxies the ERP body with no validation and no filtering, so an
  `available: false` method reaches the customer (§6).
- **`iconUrl`** is declared (`lib/erp.ts:67`) but **not rendered** at baseline.

### 5.2 Create a payment

- **Method:** `POST /api/payments`
- **Platform wrapper:** `lib/erp.ts:534-538`
- **Platform BFF:** `POST /api/public/erp/payments` — `pages/api/public/erp/payments.ts:31`, `payments` bucket 10/min
- **Request body:** `ErpPaymentRequest` — `lib/erp.ts:88-106`, validated by `erpPaymentSchema` (`lib/zod/erp.ts:21-42`)

| Field            | Required | Rule at baseline                                                   | Intended rule (§6)                                                                                                                            |
| ---------------- | -------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `orderReference` | yes      | 8–64 chars, `[a-zA-Z0-9_-]` — **shape only**, client-supplied      | **server-minted**; a client-supplied value is rejected                                                                                        |
| `amount`         | yes      | `z.number().positive()` — **any positive number**, client-supplied | **server-derived** from `packageId`; a client-supplied value is rejected                                                                      |
| `currency`       | no       | max 8 chars, defaults `SAR`                                        | unchanged                                                                                                                                     |
| `paymentMethod`  | yes      | 3–20 chars, `[a-z0-9_]+`                                           | must exist in the ERP method catalogue                                                                                                        |
| `customerName`   | no       | max 100                                                            | unchanged                                                                                                                                     |
| `customerEmail`  | no       | valid email, max 100                                               | unchanged                                                                                                                                     |
| `customerPhone`  | no       | max 20                                                             | unchanged                                                                                                                                     |
| `description`    | no       | max 200                                                            | unchanged                                                                                                                                     |
| `callbackUrl`    | no       | `z.string().url().max(500)` — **any well-formed URL**              | must be same-origin with the platform (host allow-list)                                                                                       |
| `packageId`      | no       | **sent** — the resolved terms' package id, never the caller's      | **required**, so the ERP can resolve the price                                                                                                |
| `billingCycle`   | no       | **sent** — the resolved terms' cycle, never the caller's value     | **server-derived** from the verified terms — `monthly` or `yearly`, never the caller's value. The ERP consumes it once PG-31's ERP half lands |
| `recaptchaToken` | no       | declared; the route never validates it                             | unchanged                                                                                                                                     |

- **Response (200 OK):** `ErpPaymentResult` — `lib/erp.ts:82-88`

```json
{
  "paymentUrl": "https://api.moyasar.com/v1/payments/...",
  "externalId": "...",
  "provider": "moyasar",
  "status": "initiated",
  "internalId": "..."
}
```

- **`paymentUrl` handling.** The platform validates the host against a gateway allow-list **client-side only**
  (`components/erp/PaymentActivation.tsx:29-42`) and then performs a full-page `window.location.assign`
  (`:163`). A server-side allow-list is required — see §6 and
  `docs/decisions/pg16-hosted-redirect.md`.
- **No card data is ever sent.** The platform does not transmit PAN/CVC/expiry — the payer enters them on the
  gateway's own origin. See `docs/security/payment-security-review.md` §1.

### 5.3 Verify a payment

- **Method:** `GET /api/payments/verify/{reference}`
- **Platform wrapper:** `lib/erp.ts:399-401`
- **Platform BFF:** `GET /api/public/erp/verify?reference=…` — `pages/api/public/erp/verify.ts:32`, `verify` bucket 60/min
- **Path/query constraint:** `reference` is 1–100 characters; **no format constraint** at baseline.
- **Response (200 OK):** `ErpVerifyResult` — `lib/erp.ts:90-93`

```json
{ "success": true, "status": "Paid" }
```

- **`status` enum:** `"Pending" | "Paid" | "Failed"`, optional and **PascalCase**. The union is declared
  platform-side at `lib/erp.ts:92`.
  **UNVERIFIED:** the ERP's actual serialisation of this field is **not establishable from this repository**.
  PascalCase is _expected_ because the sibling subscription status is a PascalCase string —
  `tests/e2e/support/erp-stub.cjs:25-31` documents that convention — but that is an inference from a
  **different endpoint**, not evidence about `/payments/verify`, and it is recorded as such. Settled by
  capturing a real `GET /payments/verify/{reference}` response from a running WebAPI, which is `PG-30`'s
  remaining ERP-half item.
- **Authority.** The platform's success page polls this endpoint and treats `Paid` as the only value that
  completes the order. `success` is the platform's own conservative boolean; `status` is the ERP's. When they
  are absent or unrecognised the platform must **never** read the payment as Paid.
- **`Failed` semantics:** terminal failure — the customer must not be able to resume the same reference.

### 5.4 Error responses (platform BFF)

Every public route answers the envelope `{ "error": { "message": "<value>" } }`.

**At baseline `<value>` is the upstream error text** — `ErpApiError.message` is lifted verbatim from the ERP
body (`lib/erp.ts:342-347`) and echoed at
`pages/api/public/erp/payments.ts:22-27`, `verify.ts:21-26`, `methods.ts:21-26` and `packages.ts:21-26`.
That is a disclosure defect (§6).

**Intended contract:** a **stable, non-revealing code** from the same vocabulary the admin routes already use
(`classifyErpError`, `lib/erp.ts:260`). Names in use include `ERP_MALFORMED_RESPONSE` (`lib/erp.ts:356-360`),
`too-many-requests` (429, all routes), `invalid-request` / `invalid-email` / `invalid-subdomain` (400), and
`missing-reference` (`verify.ts:44`).

---

## 6. Contract status

> **Read this before implementing against §5.** The rules below were written while the payment work was
> spread across separate branches, and they are listed with a status so a reader could tell intention from
> shipping. **All of them now ship in the same change as this document.** The baseline (`main` @ `5544330`)
> did **not** have them, so a build taken from an older commit still behaves as the "baseline" column of
> `docs/security/payment-security-review.md` describes.

| Intended rule                                                                                                                         | Status                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `available: false` (and missing `available`) filtered out of the method catalogue; response validated against a schema                | **Shipped** — this change                                                    |
| Public BFF answers a stable error code instead of upstream `error.message`                                                            | **Shipped** — this change; all 8 public routes share one responder           |
| `status` shared schema + fixture-driven contract test                                                                                 | **Shipped** — this change                                                    |
| `orderReference` server-minted; price derived server-side from `packageId`; the client's `amount`/`orderReference` are no longer read | **Shipped** — this change                                                    |
| Server-side `paymentUrl` / `callbackUrl` host allow-list                                                                              | **Shipped** — this change                                                    |
| Trusted-proxy rate-limit key (`RATE_LIMIT_TRUSTED_HOPS`) instead of the spoofable leftmost `X-Forwarded-For`                          | **Shipped** — this change; **requires a deployment precondition**, see below |
| `/pricing` survives a malformed-but-parseable 200 body from the ERP                                                                   | **Shipped** — this change                                                    |
| The ERP's own obligations (authenticated webhooks, server-side confirmation, provider authenticity, refunds)                          | **ERP repo, out of scope here** — `PG-11`, `PG-12`, `PG-13`, `PG-14`         |

> **Deployment precondition for the rate-limit rule.** The trusted-hop key derivation assumes every request
> actually traverses the configured proxies. A request that reaches the container directly controls the whole
> `X-Forwarded-For` chain regardless of the hop count, and `docker-compose.prod.yml:42` publishes `5032:4002`
> on all interfaces. This is a deployment fact, not a code one — see
> `docs/security/payment-security-review.md` §3.2 and its finding 14.

### 6.1 Test coverage of this contract

`tests/e2e/support/erp-stub.cjs` is the hermetic ERP stub used by the e2e suite. It now serves the payment
surface as well as the M2M platform-billing surface: `GET /api/payments/methods`, `GET
/api/payments/verify/{reference}`, `POST /api/payments` and the public catalogue
`GET /api/platform/TenantRegistration/catalog/packages` (`erp-stub.cjs:421`, `:427`, `:446`, `:461`). The
catalogue is served from the **same map** as the M2M packages route, so the public and M2M prices cannot
disagree in a test run.

Two layers assert this contract:

| Layer         | Where                                                                                                                               | What it proves                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Unit contract | `__tests__/contract/erp-gateway-contract.spec.ts` (+ fixtures `tests/fixtures/erp-contract.ts`, `tests/fixtures/erp-gateways.json`) | Per-gateway request/response shapes, importing the **real** schemas so the fixtures cannot drift from the implementation |
| End-to-end    | `tests/e2e/funnel/payment-contract.spec.ts`                                                                                         | Browser → BFF → stub with **no request interception**, so the transport chain is exercised rather than mocked            |

**Residual limitation, stated rather than implied:** the fixtures are **hand-written, not captured** from a
live ERP. They prove our code handles the shape we _believe_ the ERP sends — not that the ERP sends it. One
captured payload per gateway from staging would settle it. The live-gateway leg remains blocked on the ERP's
own work (`PG-10`…`PG-14`).

---

## 7. Tenant status surface (ERP user session)

The tenant-session counterpart of §3: the team billing page (`/teams/[slug]/erp`) asks the kit route
`pages/api/teams/[slug]/erp.ts` for the linked tenant's subscription and modules, and that route calls the ERP
with the stored `erpAccessToken` as a `Bearer` token (`lib/erp.ts:555-557`).

- **Method:** `GET /api/platform/TenantStatus/modules`
- **ERP auth:** `[ApiController]` + `[Authorize]` only — `TenantStatusController` carries **no**
  `[PlatformApiKey]` and no `[AllowAnonymous]`, so the §2 key rule does **not** apply on this surface.
- **Response (200 OK):**

```json
{
  "subscriptionId": "9f2c1a44-…",
  "packageId": "1f1b3311-…",
  "packageName": "Starter",
  "status": "Active",
  "enabledModules": [
    { "id": "3fa85f64-…", "code": "POS", "name": "نقطة البيع - POS" }
  ],
  "enabledModuleCodes": ["POS"]
}
```

- **Canonical module field: `enabledModules`** — an array of objects carrying `id`, `code` and `name`
  (`SystemModuleSummaryResponseDto`), mirrored by the flat `enabledModuleCodes: string[]`. `enabledModules` is
  the field the platform normalizes; `enabledModuleCodes` is a sibling, **not** a fallback: it mirrors the code
  every entry already carries, so reading it would add nothing and would substitute codes whenever the
  canonical array is legitimately empty. `status: "NoActiveSubscription"` is a normal answer, and then
  `enabledModules` is empty.
- **Platform caller:** `normalizeTenantModules` (`pages/api/teams/[slug]/erp.ts`), pinned by
  `__tests__/api/teams-erp-modules.spec.ts`. It narrows every surviving entry to **`{ code, name }`** and
  forwards nothing else, so the raw entry (its `id`, and any field the DTO gains later) never reaches the
  browser. The entry's `displayName` / `title` tolerance folds into `name`, because only `code` and `name` are
  published.
- **Width guarantee — per field, not per entry:** every forwarded field is at most `MAX_MODULE_NAME_LENGTH`
  (64) characters. An over-long field is **blanked** rather than made fatal, so an over-long `code` does not
  take a renderable entry down with it (the entry survives on its `name`, which is what the route rendered
  before this contract existed), and an over-long `name` cannot ride along behind a short `code` — which
  matters because `name` is exactly what step 2 below renders. An entry is dropped only when both fields are
  unusable. Both directions are pinned by cases, and the invariant is additionally asserted over the emitted
  `modules` array, so a future uncapped module field fails the suite. That assertion is deliberately scoped to
  `modules`: the sibling `subscription` object is forwarded raw by this route, as it was before this contract,
  and is not narrowed here — so it is neither covered by that invariant nor claimed to be.
- **Dedupe — the key changed with this contract.** Duplicates still collapse case-insensitively keeping the
  first-seen casing, but the key is now the surviving primary label `code || name`, where it used to be the
  single resolved display label. Visible consequence: two entries whose codes differ only by case (`SALES` and
  `sales`) **carrying distinct names** now collapse to one badge instead of two. The qualification is load-
  bearing: under the old key the compared value was already the lowercased resolved label, so two _nameless_
  case-variant entries collapsed on the old contract too — the delta appears only when the two carry different
  names, which is the ERP-shaped case, since every real entry ships a name. The collapse is intended — the
  localizer matches codes case-insensitively, so both would have rendered the same label anyway — and a mixed
  payload collapses as the same documented consequence: `[{ code: 'POS', name: 'A' }, { name: 'POS' }]` keeps one
  badge, because the second entry's primary label is also `POS`. The reverse case also improved: two
  entries sharing a name but carrying different codes, which the old key wrongly merged, are now kept. Not
  reachable from the ERP's own payload — its 14 seeded codes are unique — so this is a documented semantic
  change rather than an observable one today.
- **Label resolution (browser):** the billing page turns that pair into one string, in this order:
  1. the curated translation for `code` (`getLocalizedModuleName` → `erp-module-*`);
  2. otherwise the ERP's own `name` — the Arabic label the ERP ships;
  3. otherwise the raw `code`.
     Step 2 is deliberate: a module the platform has never translated — an admin-created `SystemModules` row, or
     one added to the seeder upstream — stays legible rather than rendering a bare Latin token in the Arabic UI.
     **Known trade:** step 2 resolves on the entry's whole `name`, and the name is deliberately not itself looked
     up in the branch table — so an entry whose _name_ happens to coincide with a branch token
     (`{ code: 'crm_pro', name: 'CRM' }`) renders the raw `CRM` in both locales rather than the curated
     `إدارة علاقات العملاء`. Branching on names as well would reintroduce the ambiguity this ordering exists to
     remove, because a name is not a code; the trade is accepted and recorded here rather than fixed.
     Branch membership is decided by whether the localizer actually reached `t`, **not** by comparing the label
     against the code, which would misread `erp-module-crm` (its English label **is** `CRM`) as an untranslated
     code. The order lives in `lib/erpModuleLabel.ts`; the branch table itself stays in the page.
- `lib/erp.ts` already declared this entry shape for the change-plan response
  (`ErpChangePlanResponse.enabledModules:153`), corroborating `enabledModules` as canonical here.

**Provenance:** the shape above is read off the ERP C# (`TenantStatusController.GetEnabledModules`,
`TenantEnabledModulesResponseDto`, `SystemModuleSummaryResponseDto`) plus the camelCase policy at
`Program.cs:90`. It is **not** a captured live response — the same limitation §6.1 records for the payment
fixtures.

---

## 8. Related documents

| Document                                   | Covers                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `docs/decisions/pg16-hosted-redirect.md`   | Why the payer surface is a hosted redirect and not an embedded SDK (PCI scope) |
| `docs/security/payment-security-review.md` | PCI scope, CSP matrix, rate limits, enumeration, PII redaction, findings       |
| `.agents/context/shared/payments.md`       | The platform's verify/poll flow at a glance                                    |
| `docs/env-matrix.md`                       | Every env var, including the ERP and rate-limit keys                           |
