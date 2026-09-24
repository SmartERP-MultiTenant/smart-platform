import { NextApiRequest, NextApiResponse } from 'next';

import env from '@/lib/env';
import { erp, type ErpPaymentRequest } from '@/lib/erp';
import { ApiError } from '@/lib/errors';
import {
  buildCallbackUrl,
  isAllowedCallbackUrl,
  isAllowedGatewayUrl,
} from '@/lib/payments/allowlist';
import { verifyOrderIntent, type OrderTerms } from '@/lib/payments/orderIntent';
import { resolvePayableOrder } from '@/lib/payments/payablePackage';
import { respondErpError } from '@/lib/payments/publicErpError';
import { clientKey, limiters } from '@/lib/rateLimit';
import { erpPaymentSchema, type ErpPaymentInput } from '@/lib/zod/erp';

/**
 * `POST /api/public/erp/payments` — creates a gateway payment (PG-06, P4.24).
 *
 * ## What changed, and why it is the whole point of PG-06
 *
 * This route used to be a proxy: it validated the SHAPE of the body and handed
 * it to the ERP. Both `amount` and `orderReference` came from the browser, so a
 * hand-rolled POST priced a tenant at any number the caller chose. Nothing
 * upstream could catch it — the ERP bills what it is told to bill, and the price
 * the funnel displayed was fetched from the same catalogue this route never
 * consulted.
 *
 * The route now decides both. `amount` and `orderReference` in the request body
 * are still accepted (a client that sends them is not failed on an unknown-key
 * rule) and are still shape-validated, but they are **never read**: the terms
 * come from either a verified signed intent or a server-side catalogue lookup,
 * and the ERP request is built explicitly from those. There is no code path in
 * which a caller-supplied number reaches `erp.createPayment`.
 *
 * ## The two ways to obtain authoritative terms
 *
 *  - **`intent`** (preferred) — a token issued by `/api/public/erp/orders`,
 *    carrying a reference and an amount the server already agreed to. Preferred
 *    because it binds BOTH, so a reference and an amount from two different
 *    requests cannot be combined.
 *  - **`packageId`** — priced here against the ERP catalogue. Kept because it
 *    makes the funnel correct without the client having to learn about intents
 *    first: it derives a fresh reference and — because the server also builds
 *    the callback URL — the client does not need to know the reference at all.
 *
 * A request carrying **neither** is refused (400). That is the fail-closed rule
 * PG-06 asks for: with no package id and no intent there is nothing to price, and
 * a request whose price is unknowable must never become a charge.
 *
 * ## P4.24: both directions of the callback are validated here
 *
 * The inbound `callbackUrl` must be on our own origin or the request is REJECTED
 * (400 rather than a silent rewrite, so the attempt is visible). The outbound
 * `paymentUrl` from the ERP must be on a known gateway host or the response is
 * refused as a malformed upstream body: the component's own check runs in the
 * customer's browser and is not a trust boundary.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'POST':
        await handlePOST(req, res);
        break;
      default:
        res.setHeader('Allow', 'POST');
        res.status(405).json({
          error: { message: `Method ${req.method} Not Allowed` },
        });
    }
  } catch (error: unknown) {
    // PG-52: `error.message` is lifted verbatim from the ERP response body, so
    // echoing it published upstream failure text to an unauthenticated caller.
    respondErpError(res, error);
  }
}

/**
 * Resolves the authoritative terms, or explains why it could not.
 *
 * Returns a discriminated result rather than throwing so the two failure classes
 * ("this request cannot be priced" versus "the ERP is unreachable") stay at the
 * caller, where they map to different status codes and different customer copy.
 */
type TermsResolution =
  | { ok: true; terms: OrderTerms }
  | { ok: false; code: 'invalid-request' | 'invalid-amount' };

const resolveTerms = async (
  input: ErpPaymentInput
): Promise<TermsResolution> => {
  if (input.intent) {
    const terms = verifyOrderIntent(input.intent);

    // A bad signature, a wrong payload version and an expired token are the same
    // answer on purpose: the caller's only correct move is to re-price the order.
    if (!terms) return { ok: false, code: 'invalid-request' };

    // An intent that disagrees with the package id or billing cycle sent alongside it
    // is not a stale client — it is an attempt to attach one terms to another
    // order. Refused rather than reconciled.
    if (input.packageId && input.packageId !== terms.packageId) {
      return { ok: false, code: 'invalid-request' };
    }

    if (input.billingCycle && input.billingCycle !== terms.billingCycle) {
      return { ok: false, code: 'invalid-request' };
    }

    // The price is deliberately NOT re-read from the catalogue here. The intent
    // is a server-signed commitment with a 30-minute TTL, and honouring it for
    // that window is the point of issuing one; re-pricing on every attempt would
    // make the token decorative while adding an ERP round trip to the hot path.
    // The bound that matters is the TTL, not the re-check.
    return { ok: true, terms };
  }

  if (input.packageId) {
    const resolved = await resolvePayableOrder(
      input.packageId,
      input.billingCycle
    );

    if (!resolved.ok) {
      return {
        ok: false,
        code:
          resolved.reason === 'package-not-payable'
            ? 'invalid-amount'
            : 'invalid-request',
      };
    }

    return { ok: true, terms: resolved.order };
  }

  return { ok: false, code: 'invalid-request' };
};

const handlePOST = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!limiters.payments.allow(clientKey(req))) {
    res.status(429).json({ error: { message: 'too-many-requests' } });
    return;
  }

  const parsed = erpPaymentSchema.safeParse(req.body);

  if (!parsed.success) {
    // PG-54/PG-52: the message is a stable code, not the raw zod issue. Zod's
    // messages are prose (`String must contain at least 8 character(s)`), and
    // any consumer that renders `error.message` verbatim would show an English
    // sentence in the Arabic funnel. The per-field detail is not lost — it stays
    // in `issues`, which is safe to publish because it describes the CALLER's
    // own request and carries nothing from the ERP.
    res.status(400).json({
      error: { message: 'invalid-request' },
      issues: parsed.error.flatten(),
    });
    return;
  }

  const input = parsed.data;

  // PG-31 — fail-closed gate on annual orders, request side.
  //
  // `YEARLY_BILLING_ENABLED` is off unless it is explicitly `true` (lib/env.ts),
  // so a request asking for 'yearly' is refused before any pricing work: it must
  // not spend an ERP catalogue read, and an unreachable ERP must not turn the
  // refusal into a 503. Raised as a coded `ApiError` so it leaves through the
  // route's existing error responder (`respondErpError`, the catch below) with
  // the same `invalid-request` code every other unchargeable request gets here.
  if (input.billingCycle === 'yearly' && !env.yearlyBillingEnabled) {
    throw new ApiError(400, 'invalid-request');
  }

  // P4.24 — reject, do not rewrite. An off-allowlist callback is either a
  // misconfiguration or an attempt to land a paying customer on someone else's
  // page with a valid-looking order; both deserve a visible 400 rather than a
  // silently corrected destination.
  if (input.callbackUrl && !isAllowedCallbackUrl(input.callbackUrl)) {
    res.status(400).json({ error: { message: 'invalid-request' } });
    return;
  }

  const resolved = await resolveTerms(input);

  if (!resolved.ok) {
    res.status(400).json({ error: { message: resolved.code } });
    return;
  }

  const { terms } = resolved;

  // PG-31 — the same gate on the RESOLVED terms, which is what closes the intent
  // path. An intent is self-describing: `{ intent }` alone is priced from the
  // cycle inside the token, so a yearly intent is payable here even when the
  // request body never mentions a cycle — including one minted in the 30-minute
  // TTL window before the switch was turned off. Gating the request field alone
  // would leave that route open, so the check is on the cycle that would
  // actually have reached the ERP.
  if (terms.billingCycle === 'yearly' && !env.yearlyBillingEnabled) {
    throw new ApiError(400, 'invalid-request');
  }

  const callbackUrl = buildCallbackUrl(input.callbackUrl, terms.orderReference);

  // A missing platform origin is a configuration fault. Paying without a
  // callback would strand the customer after the gateway, so refuse instead of
  // sending a payment the success page can never resolve.
  if (!callbackUrl) {
    res.status(503).json({ error: { message: 'erp-unavailable' } });
    return;
  }

  // Built field by field, deliberately NOT spread from the request body: a
  // spread is how a future field added to `erpPaymentSchema` would silently
  // become an ERP input, and it is exactly how `amount` and `orderReference`
  // used to travel. `amount`, `currency`, `billingCycle` and `packageId` come only
  // from the resolved terms.
  const order: ErpPaymentRequest = {
    orderReference: terms.orderReference,
    amount: terms.amount,
    currency: terms.currency,
    billingCycle: terms.billingCycle,
    // PG-31 — the package the terms were priced for, so the ERP can validate the
    // price instead of trusting it. Read from `terms` (the verified intent or the
    // catalogue result), never from `input.packageId`.
    packageId: terms.packageId,
    paymentMethod: input.paymentMethod,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    description: input.description,
    callbackUrl,
  };

  const result = await erp.createPayment(order);

  // P4.24 — the outbound redirect target. Only a PRESENT-but-untrusted value is
  // refused; an absent `paymentUrl` keeps its existing meaning (the ERP accepted
  // the request but produced no redirect) and is left for the client to treat as
  // "no payment to complete", unchanged by this ticket.
  if (result.paymentUrl && !isAllowedGatewayUrl(result.paymentUrl)) {
    res.status(502).json({ error: { message: 'erp-malformed-response' } });
    return;
  }

  res.json({ data: result });
};
