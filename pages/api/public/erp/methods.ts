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
    // PG-52: never echo `error.message` — it is lifted verbatim from the ERP
    // response body. `respondErpError` answers with a stable code instead.
    respondErpError(res, error);
  }
}

const handleGET = async (req: NextApiRequest, res: NextApiResponse) => {
  // P4.8: limiter first — cheap catalog read, mirror check-subdomain.ts:32.
  if (!limiters.catalog.allow(clientKey(req))) {
    res.status(429).json({ error: { message: 'too-many-requests' } });
    return;
  }

  // PG-20: `erp.getMethods()` already drops every entry the ERP did not mark
  // `available` and every entry that fails the response contract, so this route
  // only has to publish what survived. The filter is deliberately NOT here: the
  // catalogue's honesty is a property of the ERP boundary, and putting it in
  // the transport layer would leave the next consumer of `getMethods()`
  // unguarded.
  const methods = await erp.getMethods();

  res.json({ data: methods });
};
