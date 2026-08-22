import { NextApiRequest, NextApiResponse } from 'next';

import env from '@/lib/env';
import { erp } from '@/lib/erp';
import { throwIfNoTeamAccess } from 'models/team';

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

// Cancel the linked tenant's subscription via the ERP M2M billing API
const handlePOST = async (req: NextApiRequest, res: NextApiResponse) => {
  const teamMember = await throwIfNoTeamAccess(req, res);
  const team = teamMember.team;

  if (!team.erpTenantId) {
    res.status(400).json({ error: { message: 'not-linked' } });
    return;
  }

  await erp.cancelTenantSubscription(
    env.erp.platformApiKey,
    team.erpTenantId
  );

  res.json({ data: { ok: true } });
};