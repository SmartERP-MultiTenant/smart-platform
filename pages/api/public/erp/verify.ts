import { NextApiRequest, NextApiResponse } from 'next';

import { erp } from '@/lib/erp';
import { respondErpError } from '@/lib/payments/publicErpError';
import { clientKey, limiters } from '@/lib/rateLimit';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'GET':
        await handleGET(req, res);
        break;
      default:
        res.setHeader('Allow', 'GET');
        res.status(405).json({
          error: { message: `Method ${req.method} Not Allowed` },
        });
    }
  } catch (error: unknown) {
    // PG-52: never echo `error.message` — see publicErpError.ts.
    respondErpError(res, error);
  }
}

const handleGET = async (req: NextApiRequest, res: NextApiResponse) => {
  // P4.8: limiter first — protects the ERP from order-reference enumeration
  // and caps polling abuse (see the `verify` bucket note in lib/rateLimit.ts).
  if (!limiters.verify.allow(clientKey(req))) {
    res.status(429).json({ error: { message: 'too-many-requests' } });
    return;
  }

  const reference = req.query.reference;

  if (
    typeof reference !== 'string' ||
    reference.length < 1 ||
    reference.length > 100
  ) {
    res.status(400).json({ error: { message: 'missing-reference' } });
    return;
  }

  // PG-30: `erp.verifyPayment` validates the body against
  // `erpVerifyResponseSchema` before returning it, so the poller only ever sees
  // an object whose `success` is boolean-or-absent and whose `status` is a
  // string-or-absent. An unrecognised `status` is passed through verbatim and is
  // NOT an error — see the schema for why rejecting it would be a fail-open.
  const result = await erp.verifyPayment(reference);

  res.json({ data: result });
};
