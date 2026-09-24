/**
 * In-flight payment marker for the registration funnel (PG-24).
 *
 * The funnel's payment step is a **full-page redirect** to a gateway
 * (`window.location.assign` in `components/erp/PaymentActivation.tsx`), which
 * means the tab leaves the app entirely. Everything React held in memory is
 * gone by the time the customer comes back, so if they hit Back, refresh, or
 * reopen the tab before the callback URL arrives, the app had no way to tell
 * "this customer has a payment in flight" apart from "this customer opened a
 * page with no order reference".
 *
 * This module is that memory. Just before the redirect, the funnel records the
 * order reference it just created; the callback page (`pages/payment/success`)
 * can then offer to resume checking that reference instead of claiming the
 * payment could not be verified.
 *
 * Deliberate design choices:
 *
 * - **`sessionStorage`, not `localStorage`.** It survives reloads and
 *   back/forward within the tab (which is exactly the recovery window) but is
 *   scoped to one tab and dies with it, so it cannot leak one customer's order
 *   reference into another tab's session or linger on a shared machine.
 * - **The URL stays the source of truth.** This record is only ever used to
 *   *rebuild* the `?order=` link. Once the callback URL carries the reference,
 *   the marker has done its job and is cleared — the stored value never
 *   overrides the query string.
 * - **Reads are total.** Every failure mode (absent, unparseable, wrong shape,
 *   stale, clock-skewed) returns `null` rather than throwing. A missing marker
 *   costs the customer a resume affordance; it must never break the page.
 * - **Writes are non-fatal.** Blocked or full storage silently degrades.
 * - **The record also carries the charge (PG-31).** The callback URL carries
 *   only the order reference and the `verify` response carries neither package
 *   nor amount, so the billing cycle and the server-priced amount recorded
 *   here are the only way the success page can state what a customer was
 *   charged. Both are optional: markers written before the cycle work do not
 *   have them, and `readPaymentInFlight` resolves that case instead of guessing.
 */

import type { ErpBillingCycle } from '@/lib/erp';

export const PAYMENT_IN_FLIGHT_KEY = 'erpPaymentInFlight';

/**
 * How long a recorded attempt may still be offered as "in flight". Session
 * storage lives as long as the tab, and a tab can stay open for days; past
 * this bound the attempt is abandoned, not pending, so resurfacing it would be
 * misleading.
 */
export const PAYMENT_IN_FLIGHT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** What a caller records, just before handing the customer to the gateway. */
export interface PaymentInFlightRecord {
  /** The order reference the funnel minted for this attempt. */
  orderReference: string;
  packageId: string;
  methodKey: string;
  /** ISO-8601 instant the attempt was recorded. */
  startedAt: string;
  /**
   * The billing cycle the server priced this attempt for. Optional because the
   * marker outlived more than one shape of client: a caller that knows nothing
   * about periods must still be able to record an attempt.
   */
  billingCycle?: ErpBillingCycle;
  /** The amount the server priced for this attempt, from `/orders`. */
  amount?: number;
}

/**
 * What a reader gets: the optional fields above resolved into something a
 * consumer can act on without repeating the upgrade rules.
 */
export interface PaymentInFlight extends Omit<
  PaymentInFlightRecord,
  'billingCycle' | 'amount'
> {
  /**
   * The period this attempt was priced for:
   *
   * - a recognised cycle, when the marker recorded one;
   * - `'monthly'`, when the marker predates the cycle work — every order that
   *   could have written such a marker was priced monthly, the same mapping the
   *   signed intent's v1 arm uses, so this is an upgrade path and not a guess;
   * - `null`, when the marker DID carry a value that is not a cycle this build
   *   knows (a newer client's cycle, or a hand-edited marker). The period then
   *   cannot be named, and a receipt must show no amount rather than the wrong
   *   one — a null period is deliberately distinguishable from a monthly one.
   */
  billingCycle: ErpBillingCycle | null;
  /** The server-priced amount, or `null` when the marker predates it. */
  amount: number | null;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

/**
 * Resolves the stored cycle to a period this build can name.
 *
 * The two literals are repeated here rather than imported: `lib/zod/erp` owns
 * the canonical enum, but this module is loaded in the browser and must not
 * pull a validation library into the funnel's bundle for a two-value check. A
 * cycle added to the schema and not here degrades to `null` — the fail-closed
 * direction, since an unnamed period costs a receipt row and never a wrong one.
 */
const readCycle = (value: unknown): ErpBillingCycle | null => {
  if (value === undefined || value === null) return 'monthly';

  return value === 'monthly' || value === 'yearly' ? value : null;
};

/** The recorded amount, or `null` when it is absent or unusable. */
const readAmount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;

/**
 * `sessionStorage` can throw on *access* (not just on read) when the browser
 * is configured to block site data, so even reaching for it is guarded.
 */
function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Records the attempt about to be handed to the gateway. Never throws. */
export function savePaymentInFlight(record: PaymentInFlightRecord): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(PAYMENT_IN_FLIGHT_KEY, JSON.stringify(record));
  } catch {
    // Quota or a blocked write. Losing the marker only costs the resume
    // affordance, so it must not be allowed to abort a payment.
  }
}

/**
 * Returns the recorded attempt, or `null` when there is nothing usable.
 *
 * `now` is injectable so the staleness bounds are testable without fake
 * timers.
 */
export function readPaymentInFlight(
  now: number = Date.now()
): PaymentInFlight | null {
  const storage = getStorage();
  if (!storage) return null;

  let parsed: unknown;
  try {
    const raw = storage.getItem(PAYMENT_IN_FLIGHT_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  const { orderReference, packageId, methodKey, startedAt } = record;

  if (
    !isNonEmptyString(orderReference) ||
    !isNonEmptyString(packageId) ||
    !isNonEmptyString(methodKey) ||
    !isNonEmptyString(startedAt)
  ) {
    return null;
  }

  const startedAtMs = Date.parse(startedAt);
  if (Number.isNaN(startedAtMs)) return null;

  // Too old to still be in flight...
  if (now - startedAtMs > PAYMENT_IN_FLIGHT_MAX_AGE_MS) return null;
  // ...and a record dated in the future is a clock artefact or tampering, not
  // evidence of a real attempt. Bounded both ways so a hand-edited timestamp
  // cannot resurrect a marker forever.
  if (startedAtMs - now > PAYMENT_IN_FLIGHT_MAX_AGE_MS) return null;

  return {
    orderReference,
    packageId,
    methodKey,
    startedAt,
    billingCycle: readCycle(record.billingCycle),
    amount: readAmount(record.amount),
  };
}

/** Drops the marker once the URL carries the reference. Never throws. */
export function clearPaymentInFlight(): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.removeItem(PAYMENT_IN_FLIGHT_KEY);
  } catch {
    // Non-fatal: a stale marker is bounded and re-validated on every read.
  }
}
