import { NextApiRequest, NextApiResponse } from 'next';

import { erp } from '@/lib/erp';

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
  const reference = req.query.reference;

  if (
    typeof reference !== 'string' ||
    reference.length < 1 ||
    reference.length > 100
  ) {
    res.status(400).json({ error: { message: 'missing-reference' } });
    return;
  }

  const result = await erp.verifyPayment(reference);

  res.json({ data: result });
};
