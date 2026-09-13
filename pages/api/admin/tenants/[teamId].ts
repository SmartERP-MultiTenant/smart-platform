import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminTenantById } from '@/lib/adminDashboard';
import { apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await requirePlatformAdmin(req, res);

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({
        error: { message: `Method ${req.method} Not Allowed` },
      });
    }

    const { teamId } = req.query;

    // Plan Task 10 error contract: 422 is the code for invalid ID/query input
    // (400 is reserved for malformed request bodies).
    if (!teamId || typeof teamId !== 'string') {
      return res.status(422).json({
        error: { message: 'Invalid team ID' },
      });
    }

    const tenant = await getAdminTenantById(teamId);

    if (!tenant) {
      return res.status(404).json({
        error: { message: 'Team not found' },
      });
    }

    return res.status(200).json({ data: tenant });
  } catch (error) {
    const status = apiErrorStatus(error);
    const message = apiErrorMessage(error);

    return res.status(status).json({
      error: { message },
    });
  }
}
