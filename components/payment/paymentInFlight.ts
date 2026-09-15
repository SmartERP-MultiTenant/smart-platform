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
 */

export const PAYMENT_IN_FLIGHT_KEY = 'erpPaymentInFlight';

/**
 * How long a recorded attempt may still be offered as "in flight". Session
 * storage lives as long as the tab, and a tab can stay open for days; past
 * this bound the attempt is abandoned, not pending, so resurfacing it would be
 * misleading.
 */
export const PAYMENT_IN_FLIGHT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PaymentInFlight {
  /** The order reference the funnel minted for this attempt. */
  orderReference: string;
  packageId: string;
  methodKey: string;
  /** ISO-8601 instant the attempt was recorded. */
  startedAt: string;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

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
export function savePaymentInFlight(record: PaymentInFlight): void {
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

  const { orderReference, packageId, methodKey, startedAt } = parsed as Record<
    string,
    unknown
  >;

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

  return { orderReference, packageId, methodKey, startedAt };
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
