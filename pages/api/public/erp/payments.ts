import { NextApiRequest, NextApiResponse } from 'next';

import { erp } from '@/lib/erp';
import { respondErpError } from '@/lib/payments/publicErpError';
import { clientKey, limiters } from '@/lib/rateLimit';
import { erpPaymentSchema } from '@/lib/zod/erp';

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

  const result = await erp.createPayment(parsed.data);

  res.json({ data: result });
};
