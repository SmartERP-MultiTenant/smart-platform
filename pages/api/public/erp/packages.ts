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
  // P4.8: limiter first — cheap catalog read, mirror check-subdomain.ts:32.
  if (!limiters.catalog.allow(clientKey(req))) {
    res.status(429).json({ error: { message: 'too-many-requests' } });
    return;
  }

  // PG-20/P4.10b: `erp.getPackages()` rejects a non-array envelope with
  // ERP_MALFORMED_RESPONSE (-> 502) and drops entries that fail the contract,
  // so nothing wrong-shaped can reach the browser or `/pricing`.
  const packages = await erp.getPackages();

  res.json({ data: packages });
};
