import { NextApiRequest, NextApiResponse } from 'next';

import { signOrderIntent } from '@/lib/payments/orderIntent';
import { resolvePayableOrder } from '@/lib/payments/payablePackage';
import { respondErpError } from '@/lib/payments/publicErpError';
import { clientKey, limiters } from '@/lib/rateLimit';
import { erpOrderIntentSchema } from '@/lib/zod/erp';

/**
 * `POST /api/public/erp/orders` — the server's own order creation (PG-06).
 *
 * ## What this endpoint is for
 *
 * It is the ONLY way to obtain a payable order. The client asks for a price, the
 * server resolves it from the ERP catalogue, mints an unguessable reference, and
 * returns both inside a signed token. The payment route then charges what the
 * token says and nothing the browser says.
 *
 * ## Why a separate route rather than an extra field on `/payments`
 *
 * The funnel needs the reference BEFORE it submits the payment, because the
 * reference has to travel in the gateway `callbackUrl` — that is how the success
 * page knows which order to poll. A single route that minted the reference
 * internally could not return it in time, and the client would be back to
 * inventing one. Splitting them keeps "decide the terms" and "charge the terms"
 * as two auditable steps.
 *
 * ## What the response may contain
 *
 * Exactly the terms being agreed to, and the token that proves they were agreed:
 * the reference, the amount, the currency, the package id and name (so the
 * caller can render/send a human-readable description) and the expiry. No
 * customer data, no ERP ids, no upstream text.
 *
 * ## Rate limiting
 *
 * `limiters.payments` (10/min) rather than a new bucket: this route performs the
 * same class of work as payment creation — one priced ERP read per call — and a
 * separate limiter would only mean two counters to reason about for one flow.
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
    // PG-52: never echo `error.message` — it is lifted verbatim from the ERP
    // response body. `respondErpError` answers with a stable code instead.
    respondErpError(res, error);
  }
}

const handlePOST = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!limiters.payments.allow(clientKey(req))) {
    res.status(429).json({ error: { message: 'too-many-requests' } });
    return;
  }

  const parsed = erpOrderIntentSchema.safeParse(req.body);

  if (!parsed.success) {
    // The message is a stable code, never zod's prose: zod's own messages are
    // English sentences that any consumer rendering `error.message` would show
    // in the Arabic funnel. The per-field detail stays in `issues`, which is safe
    // because it describes the caller's own request and nothing from the ERP.
    res.status(400).json({
      error: { message: 'invalid-request' },
      issues: parsed.error.flatten(),
    });
    return;
  }

  const resolved = await resolvePayableOrder(parsed.data.packageId);

  if (!resolved.ok) {
    // Both refusals are 400 because both are the caller asking for something
    // that cannot be charged, and neither is retryable as sent. They are kept
    // as distinct codes so an operator reading a log can tell "that plan does
    // not exist" from "that plan cannot be priced" without guessing.
    //
    // `package-not-found` deliberately reuses the generic `invalid-request`
    // code: it means the client is holding a package id the catalogue does not
    // contain, which is either a stale page or a fabricated id, and the
    // customer-facing remedy for both is to reload the funnel. A dedicated
    // "this plan is no longer available" message would be better copy, and is
    // tracked as a follow-up rather than smuggled in here as a new locale key
    // that the taxonomy's exhaustive-coverage test would then have to know about.
    res.status(400).json({
      error: {
        message:
          resolved.reason === 'package-not-payable'
            ? 'invalid-amount'
            : 'invalid-request',
      },
    });
    return;
  }

  const { order } = resolved;
  const { intent, expiresAt } = signOrderIntent(order);

  res.json({
    data: {
      orderReference: order.orderReference,
      amount: order.amount,
      currency: order.currency,
      packageId: order.packageId,
      packageName: order.packageName,
      expiresAt,
      intent,
    },
  });
};
