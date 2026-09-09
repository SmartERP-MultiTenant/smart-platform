import { NextApiRequest, NextApiResponse } from 'next';

import { erp } from '@/lib/erp';
import { clientKey, limiters } from '@/lib/rateLimit';
import { validateRecaptcha } from '@/lib/recaptcha';
import { erpRegistrationSchema } from '@/lib/zod/erp';

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
  } catch (error: any) {
    const message = error.message || 'Something went wrong';
    const status = error.status || 500;

    res.status(status).json({ error: { message } });
  }
}

const handlePOST = async (req: NextApiRequest, res: NextApiResponse) => {
  const parsed = erpRegistrationSchema.safeParse(req.body);

  if (!parsed.success) {
    const firstIssue = parsed.error.errors[0];

    res.status(400).json({
      error: { message: firstIssue?.message || 'invalid-request' },
      issues: parsed.error.flatten(),
    });
    return;
  }

  await validateRecaptcha(parsed.data.recaptchaToken);

  if (!limiters.register.allow(clientKey(req))) {
    res.status(429).json({ error: { message: 'too-many-requests' } });
    return;
  }

  const { recaptchaToken: _recaptchaToken, ...registrationData } = parsed.data;
  void _recaptchaToken;
  const result = await erp.registerTenant(registrationData);

  if (!result.success) {
    res.status(400).json({
      error: {
        message: result.message || 'Registration failed',
      },
    });
    return;
  }

  res.json({ data: result });
};
