# D-PG32 — Recurring Billing Strategy: Dual Support (Card-Token Mandate Auto-Renew + Milestone Manual Renewal Dunning)

> **Status:** decided & enabled (recorded 2026-09-29).
> **Ticket:** PG-32 · `123q2bpew28` · "Recurring billing: decision + card-token mandate (Moyasar save_card) or manual renewal".
> **Baseline:** `smart-platform` @ `main`, `SmartAndPro.ERP.Inventory` @ `development`.
> **Owner:** Payments & Billing Engineering (Shared Platform & ERP Inventory Services).
> **Reference:** Extends `docs/decisions/pg16-hosted-redirect.md` §6.

---

## 1. Executive Summary & Product Decision

### Decision: **Dual Support Architecture (Hybrid Policy)**

1. **Auto-Renewal Path (Primary for Supported Gateways)**:
   - When paying with credit card / Mada via Moyasar tokenization (`save_card: true`), the platform captures an audited card mandate consent.
   - Upon successful payment verification, the reusable token (`source.token`) is durably stored (never PAN or CVV/CVC, adhering strictly to PCI-DSS SAQ-A scope).
   - Automated background recurring charge runner executes renewal when the subscription reaches its renewal window.

2. **Manual Renewal & Dunning Path (Default for BNPL / STC Pay & Fallback)**:
   - Methods such as Tabby, Tamara (BNPL), and STC Pay are structurally **one-shot payment methods** with no recurring mandate capability in the Saudi market.
   - For tenants using one-shot methods or where card auto-charge fails, the system executes automated Arabic dunning milestone notifications (`T-7`, `T-1`, `EXPIRED`) via `pages/api/cron/renewal-reminders.ts`.
   - Operators and tenants have self-service / admin extension capabilities (`/api/admin/subscriptions/[teamId]/extend.ts`).

---

## 2. Hard Constraints & Market Reality

| Payment Method | Provider | Mandate Support | Mechanism | Renewal Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **Mada / Credit Card** | Moyasar | **Supported** | `source.save_card` → `source.token` | **Auto-Renew via Token Charge** |
| **Tabby (BNPL)** | Tabby | **None (One-Shot)** | Split installment contract with Tabby | **Manual Renewal + Dunning** |
| **Tamara (BNPL)** | Tamara | **None (One-Shot)** | Split installment contract with Tamara | **Manual Renewal + Dunning** |
| **STC Pay** | Moyasar / STC | **None (One-Shot)** | Direct OTP debit | **Manual Renewal + Dunning** |

---

## 3. Entitlement & Failure Grace Period Policy

When an auto-renewal token charge fails (e.g., card expired, insufficient funds, bank decline):
1. **Grace Period (3 Days)**: The subscription enters a grace period state (`GracePeriodActive`). The tenant retains full access to active modules.
2. **Dunning Notification**: An immediate dunning notification is dispatched to the tenant owner alerting them to update their payment method or renew manually.
3. **Retry Cadence**: Background runner retries charging the token at `T+1` and `T+3`.
4. **Suspension / Expiration**: If the charge fails after 3 days, the subscription transitions to `Expired` / `Suspended`, revoking module entitlements until an explicit manual payment is completed.

---

## 4. UI Transparency & Compliance Copy

To satisfy Saudi regulatory requirements (SAMA / MOCI / ZATCA) and avoid customer surprise:
- Checkout UI clearly distinguishes **Recurring Auto-Renewable** methods from **One-Shot (Manual Renewal)** methods.
- The customer is presented with explicit mandate terms prior to checkout:
  > *"بالدفع عبر البطاقة المحفوظة، فإنك تفوض المنصة بتجديد الاشتراك تلقائياً عند نهاية الفترة. يمكنك إلغاء التجديد التلقائي في أي وقت."*
  *(“By paying with a saved card, you authorize the platform to automatically renew your subscription at the end of each billing cycle. You can cancel auto-renewal at any time.”)*
- One-shot badges (مثل: *دفع لمرة واحدة — تجديد يدوي*) are clearly labelled on Tabby, Tamara, and STC Pay.

---

## 5. Security & PCI Compliance
- **Zero Cardholder Data Storage**: No PAN, CVV, or card track data ever passes through or is saved in application databases.
- Only Moyasar card token references (`tok_xxx`), masked card scheme (`mada`, `visa`, `mastercard`), last 4 digits, and expiration year/month are stored.
