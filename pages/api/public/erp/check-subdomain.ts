import { NextApiRequest, NextApiResponse } from 'next';

import { erp } from '@/lib/erp';
import { respondErpError } from '@/lib/payments/publicErpError';
import { clientKey, limiters } from '@/lib/rateLimit';

const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

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
  if (!limiters.checks.allow(clientKey(req))) {
    res.status(429).json({ error: { message: 'too-many-requests' } });
    return;
  }

  const { subdomain } = req.query;

  if (typeof subdomain !== 'string' || !SUBDOMAIN_PATTERN.test(subdomain)) {
    res.status(400).json({ error: { message: 'invalid-subdomain' } });
    return;
  }

  const availability = await erp.checkSubdomain(subdomain);

  res.json({ data: availability });
};
