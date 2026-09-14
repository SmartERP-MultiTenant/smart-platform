# Platform ↔ ERP API Contract

> **Scope:** two distinct surfaces, and they must not be confused.
>
> | Part                       | Auth                               | Used by                        | Section |
> | -------------------------- | ---------------------------------- | ------------------------------ | ------- |
> | **M2M rules & modules**    | `X-Platform-ApiKey`                | the platform admin console     | §3      |
> | **Public funnel payments** | **none** (rate-limited, anonymous) | the customer-facing funnel BFF | §5      |
>
> **Baseline:** read off `smart-platform` `main` @ `5544330`. Endpoints marked _(proposed)_ exist only on an
> unmerged branch — see §6.

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
- **Platform wrapper:** `lib/erp.ts:393-397`
- **Platform BFF:** `POST /api/public/erp/payments` — `pages/api/public/erp/payments.ts:31`, `payments` bucket 10/min
- **Request body:** `ErpPaymentRequest` — `lib/erp.ts:70-80`, validated by `erpPaymentSchema` (`lib/zod/erp.ts:21-42`)

| Field            | Required | Rule at baseline                                                   | Intended rule (§6)                                                       |
| ---------------- | -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `orderReference` | yes      | 8–64 chars, `[a-zA-Z0-9_-]` — **shape only**, client-supplied      | **server-minted**; a client-supplied value is rejected                   |
| `amount`         | yes      | `z.number().positive()` — **any positive number**, client-supplied | **server-derived** from `packageId`; a client-supplied value is rejected |
| `currency`       | no       | max 8 chars, defaults `SAR`                                        | unchanged                                                                |
| `paymentMethod`  | yes      | 3–20 chars, `[a-z0-9_]+`                                           | must exist in the ERP method catalogue                                   |
| `customerName`   | no       | max 100                                                            | unchanged                                                                |
| `customerEmail`  | no       | valid email, max 100                                               | unchanged                                                                |
| `customerPhone`  | no       | max 20                                                             | unchanged                                                                |
| `description`    | no       | max 200                                                            | unchanged                                                                |
| `callbackUrl`    | no       | `z.string().url().max(500)` — **any well-formed URL**              | must be same-origin with the platform (host allow-list)                  |
| `packageId`      | —        | **not sent**                                                       | **required**, so the ERP can resolve the price                           |
| `recaptchaToken` | no       | declared; the route never validates it                             | unchanged                                                                |

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

## 6. Contract status — shipped vs proposed

> **⚠️ Read this before implementing against §5.** Several intended rules above are **not** in `main` @
> `5544330`. They exist only on unmerged branches. Treating them as shipped will produce code that does not
> work against production.

| Intended rule                                                                                                          | Status                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `available: false` (and missing `available`) filtered out of the method catalogue; response validated against a schema | **Proposed** — `feat/erp-response-contract` (PR #73), unmerged       |
| Public BFF answers a stable error code instead of upstream `error.message`                                             | **Proposed** — `feat/erp-response-contract` (PR #73), unmerged       |
| `status` shared schema + fixture-driven contract test                                                                  | **Proposed** — `feat/erp-response-contract` (PR #73), unmerged       |
| `orderReference` server-minted; `amount` derived server-side from `packageId`; both rejected from the client           | **Proposed** — `feat/server-authoritative-orders`, unmerged          |
| Server-side `paymentUrl` / `callbackUrl` host allow-list                                                               | **Proposed** — `feat/server-authoritative-orders`, unmerged          |
| Trusted-proxy rate-limit key (`RATE_LIMIT_TRUSTED_HOPS`) instead of the spoofable leftmost `X-Forwarded-For`           | **Proposed** — `feat/rate-limit-trust` (PR #70), unmerged            |
| `/pricing` survives a malformed-but-parseable 200 body from the ERP                                                    | **Proposed** — `feat/erp-response-contract` (PR #73), unmerged       |
| The ERP's own obligations (authenticated webhooks, server-side confirmation, provider authenticity, refunds)           | **ERP repo, out of scope here** — `PG-11`, `PG-12`, `PG-13`, `PG-14` |

### 6.1 Test coverage of this contract

`tests/e2e/support/erp-stub.cjs` is the hermetic ERP stub used by the e2e suite. It currently implements the
**M2M platform-billing surface only** (`/api/platform/billing/subscriptions/**`) — it defines **no** route for
`/payments`, `/payments/methods` or `/payments/verify`. Those endpoints are therefore exercised through module
mocks and Playwright request interception, **not** through a hermetic contract fixture. Per-gateway contract
tests are tracked as `PG-55`.

---

## 7. Related documents

| Document                                   | Covers                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `docs/decisions/pg16-hosted-redirect.md`   | Why the payer surface is a hosted redirect and not an embedded SDK (PCI scope) |
| `docs/security/payment-security-review.md` | PCI scope, CSP matrix, rate limits, enumeration, PII redaction, findings       |
| `.agents/context/shared/payments.md`       | The platform's verify/poll flow at a glance                                    |
| `docs/env-matrix.md`                       | Every env var, including the ERP and rate-limit keys                           |
