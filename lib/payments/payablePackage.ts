import { erp } from '@/lib/erp';
import {
  mintOrderReference,
  PLATFORM_CURRENCY,
  type OrderTerms,
} from '@/lib/payments/orderIntent';
import type { ErpPackageContract } from '@/lib/zod/erp';

/**
 * Resolves what a payment is actually FOR, from the ERP's own catalogue (PG-06).
 *
 * ## Why the price is looked up and never accepted
 *
 * The amount is the one field an attacker most wants to control, and it is the
 * one field the server is best placed to know: the package catalogue the funnel
 * renders its own UI from is the same catalogue this reads. Resolving here means
 * the price has exactly one source, and it is not the caller.
 *
 * ## Which packages are payable
 *
 * A package is payable when the catalogue gives it a **finite, strictly positive**
 * `priceMonthly` and does not explicitly mark it inactive. Everything else is
 * refused, and the two refusals are distinguished because they mean different
 * things:
 *
 *  - `package-not-found` — the id is not in the catalogue at all. Either a stale
 *    page (the package was withdrawn between render and pay) or a fabricated id.
 *  - `package-not-payable` — the id is real but must not produce a charge: no
 *    price, a zero price, a negative or non-finite one, or `isActive: false`.
 *
 * The free-package case is worth stating explicitly because it looks like it
 * should succeed: a package with no price is a **trial-only** plan. The funnel
 * already renders no payment step for it (`components/erp/PaymentActivation.tsx`
 * returns `null` when `priceMonthly <= 0`), so a payment request for one is
 * never a legitimate continuation of the funnel — it is someone asking the
 * platform to charge an amount it cannot derive, which is precisely the request
 * that must not become a payable order.
 *
 * ## `isActive` is checked in one direction only
 *
 * `erpPackageSchema` DROPS a malformed `isActive` rather than rejecting the
 * entry, so an absent value is indistinguishable from "the ERP did not say" —
 * and most catalogue entries do not carry one. Only an explicit `false` refuses
 * the package. That keeps the check fail-closed on data the ERP actually
 * asserted, without turning a missing optional field into a funnel outage.
 */

/**
 * A resolved, server-authoritative order: the terms plus what they are for.
 *
 * Internal to this module — it is reached through `PayableOrderResult`, which
 * is the exported shape callers actually consume.
 */
interface PayableOrder extends OrderTerms {
  packageName: string;
}

/** Why a package id could not become a payable order. */
type PayableOrderFailure = 'package-not-found' | 'package-not-payable';

export type PayableOrderResult =
  | { ok: true; order: PayableOrder }
  | { ok: false; reason: PayableOrderFailure };

/**
 * Pure resolution over an already-fetched catalogue.
 *
 * Split from `resolvePayableOrder` so the decision table can be tested
 * exhaustively without a fake `fetch`, and so the minting of the reference stays
 * visible at the point where the order is actually created.
 */
export function toPayableOrder(
  packages: readonly ErpPackageContract[],
  packageId: string
): PayableOrderResult {
  const found = packages.find((pkg) => pkg.id === packageId);

  if (!found) return { ok: false, reason: 'package-not-found' };

  if (found.isActive === false)
    return { ok: false, reason: 'package-not-payable' };

  const price = found.priceMonthly;

  // `!Number.isFinite` is not redundant next to the contract's `.finite()`: this
  // function is also reachable with a catalogue built by a caller that did not
  // go through the schema, and a NaN would otherwise sail past a bare `<= 0`
  // comparison and be signed into an intent.
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return { ok: false, reason: 'package-not-payable' };
  }

  return {
    ok: true,
    order: {
      orderReference: mintOrderReference(),
      amount: price,
      currency: PLATFORM_CURRENCY,
      packageId: found.id,
      packageName: found.name,
    },
  };
}

/**
 * Reads the ERP catalogue and resolves `packageId` against it.
 *
 * Catalogue failures are NOT swallowed: `erp.getPackages()` throws
 * `ErpApiError` (503 when the ERP is unreachable, 502 when it answers something
 * that is not a catalogue), and both must reach the caller so the funnel can
 * distinguish "we cannot price this right now" from "this is not payable". A
 * swallowed error here would look identical to `package-not-found`, which is the
 * one outcome that must never be guessed at.
 */
export async function resolvePayableOrder(
  packageId: string
): Promise<PayableOrderResult> {
  const packages = await erp.getPackages();

  return toPayableOrder(packages, packageId);
}
