# D-PG16 — Payment payer surface: hosted redirect over an embedded SDK

> **Status:** decided (recorded 2026-09-14; the behaviour has been in the code since the funnel shipped).
> **Ticket:** PG-16 · `123q2bpew27` · "Decide + implement hosted invoice vs Moyasar form SDK (method fidelity vs PCI surface)".
> **Baseline:** `smart-platform` `main` @ `5544330`.
> **Owner:** platform (this repo). The ERP-side payer integration is owned by `SmartAndPro.ERP.WebAPI`.

## 1. Decision

**The platform uses a hosted-redirect payer surface. No payment SDK is embedded in the `smart-platform`
origin, and no cardholder data ever enters it.**

The kit asks the ERP to create a payment, receives a `paymentUrl`, and performs a **full-page navigation** to
that URL. The customer enters their card details on the gateway's own origin. The gateway returns the customer
to a page on the kit origin, where the kit confirms the outcome by **re-fetching** the status server-side.

The alternative — embedding the Moyasar form SDK (or a gateway iframe) inside the kit's payment step — is
**rejected** for now. §4 records the trigger that would force a re-evaluation.

## 2. Options considered

| #   | Option                                                                                    | Method fidelity                                                                                                                                         | PCI surface in the kit origin                                                                                                                                                               | Verdict                      |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| A   | **Hosted redirect** — ERP returns `paymentUrl`, kit navigates, gateway hosts the payer UI | As good as the gateway's own page — every method the gateway enables (mada, Visa/Mastercard, Apple Pay, STC Pay, BNPL) is offered by the gateway itself | **None.** The kit never renders a card field, never receives a PAN, never proxies card data                                                                                                 | **CHOSEN**                   |
| B   | **Embedded Moyasar form SDK** — kit renders the gateway's JS form                         | Equivalent to A on the gateway's own page, but the kit must control which methods it renders → method fidelity becomes _our_ maintenance burden         | **Materially higher.** Gateway JS executes in our origin; our CSP must open `script-src`/`frame-src`/`connect-src` to the gateway; the kit origin becomes part of the card-data environment | Rejected                     |
| C   | Gateway iframe embedded in the kit payment step                                           | Same as B, with a smaller (but non-zero) surface                                                                                                        | Higher than A, lower than B                                                                                                                                                                 | Rejected — no benefit over A |

## 3. Why A, in order of weight

1. **It is already implemented and working.** `lib/erp.ts:393` `createPayment()` posts to the ERP `/payments`
   endpoint and returns `ErpPaymentResult.paymentUrl` (`lib/erp.ts:82-88`).
   `components/erp/PaymentActivation.tsx:163` performs `window.location.assign(targetUrl)` — a full-page
   navigation, not a form embed. Choosing B would mean **replacing** the working path, not adding to it.
2. **PCI scope.** With A the kit origin is not in the card-data environment: no card field is rendered
   (`grep -rniE 'cardNumber|cvc|cvv|\bpan\b|securityCode' components pages lib` → 0 hits) and no card data is
   transmitted through or stored by it. That keeps the platform in the **SAQ-A** family instead of pulling the
   payment step into a SAQ-A-EP / SAQ-D discussion. This is the single strongest argument, and it is the one
   the ticket frames as "method fidelity vs PCI surface".
3. **Method fidelity is delegated to the gateway, which is where it belongs.** Saudi-market method coverage
   moves faster than this repo ships (mada, Apple Pay, STC Pay, Tabby, Tamara). With A, enabling a method is a
   gateway/ERP configuration change; with B it requires a kit release plus a CSP change.
4. **It composes with the existing CSP.** No gateway resource is loaded into the kit origin under A, so the
   gateway sources already present in `middleware.ts`'s policy are defensive rather than load-bearing (see
   `docs/security/payment-security-review.md` §4).

## 4. Consequences

- **The kit is not a payment surface.** Any future requirement to render a card field, capture a saved-card
  token in the browser, or embed gateway JS is a **re-open of this decision**, not an incremental feature.
- **The gateway allow-list is a security control, not a UI nicety.** Because the kit performs the redirect, the
  destination must be validated. Today that check is **client-side only**
  (`components/erp/PaymentActivation.tsx:29-42` `isAllowedPaymentUrl`, called at `:155`). A server-side
  equivalent is required — tracked as part of P4.24 and implemented on the branch
  `feat/server-authoritative-orders` (**open PR, not merged as of this record**).
- **Method availability is an ERP fact the kit must not second-guess.** Under A the gateway decides what to
  offer, so the kit's own catalogue display must reflect ERP availability rather than hardcode brands.
- **The redirect is a navigation**, so `form-action` does **not** govern it. The gateway entries in
  `form-action` (`middleware.ts:173-182`) are inert; that directive's load-bearing source is the ERP client
  origin used by the token handoff (`middleware.ts:61-81`, `lib/erp/handoff.ts`).

## 5. Revisit triggers

Re-open this decision if **any** of the following becomes true:

1. The ERP begins issuing **per-method hosted invoices** (a different hosted URL per payment method), which
   would restore method fidelity without embedding anything. — This would _strengthen_ option A.
2. The business requires an **on-page card form** (e.g. conversion data shows the redirect loses customers),
   or **saved-card/mandate capture in the browser** for recurring billing. — This forces option B and a PCI
   re-assessment.
3. A gateway requires **3-D Secure handling inside our origin** rather than on its own hosted page.
4. The gateway stops supporting **hosted** checkout for a method the business needs.

## 6. What this decision does NOT cover

- **Which gateway** is used for a given method — that is the ERP's catalogue (`PG-05`, `PG-20`).
- **Recurring billing / card mandates** (`PG-32`) — a separate, still-undecided question. If it lands on
  `save_card`, it interacts with §5 trigger 2.
- **Refunds** (`PG-14`) — server-to-server, unaffected by the payer surface.
- **VAT / ZATCA e-invoicing** (`PG-36`) — separate.

## 7. Evidence index

| Claim                                                         | Evidence                                                                                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Kit creates a payment server-side and returns a URL           | `lib/erp.ts:393-397`                                                                                                                   |
| The URL is the only payer artifact                            | `ErpPaymentResult` — `lib/erp.ts:82-88` (`paymentUrl`, `externalId`, `provider`, `status`, `internalId`)                               |
| Client performs a **full-page** navigation                    | `components/erp/PaymentActivation.tsx:163` `window.location.assign(targetUrl)`                                                         |
| Destination is validated before navigating (client-side only) | `components/erp/PaymentActivation.tsx:29-42`, called at `:155`                                                                         |
| No card-data field is rendered or handled                     | `grep -rniE 'cardNumber\|card-number\|card_number\|\bcvc\b\|\bcvv\b\|\bpan\b\|securityCode\|expiryDate' components pages lib` → 0 hits |
| No iframe is used anywhere in the app                         | `grep -rn '<iframe' components pages lib` → 0 hits                                                                                     |
| Kit's CSP already tolerates a future embed                    | `middleware.ts:159-169` (`frame-src`), `:173-182` (`form-action`)                                                                      |
