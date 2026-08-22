import { NextApiRequest, NextApiResponse } from 'next';

import { erp } from '@/lib/erp';

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
  } catch (error: any) {
    const message = error.message || 'Something went wrong';
    const status = error.status || 500;

    res.status(status).json({ error: { message } });
  }
}

const handleGET = async (req: NextApiRequest, res: NextApiResponse) => {
  const { subdomain } = req.query;

  if (typeof subdomain !== 'string' || !SUBDOMAIN_PATTERN.test(subdomain)) {
    res.status(400).json({ error: { message: 'invalid-subdomain' } });
    return;
  }

  const availability = await erp.checkSubdomain(subdomain);

  res.json({ data: availability });
};
