import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDashboardData } from '@/lib/adminDashboard';
import { apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // 1. Must be authenticated as a PLATFORM_ADMIN
    await requirePlatformAdmin(req, res);

    // 2. Only GET is supported
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({
        error: { message: `Method ${req.method} Not Allowed` },
      });
    }

    // 3. Return dashboard data (ERP outage handled internally, returning 200 with health.ok=false)
    const data = await getAdminDashboardData();

    return res.status(200).json({ data });
  } catch (error) {
    const status = apiErrorStatus(error);
    const message = apiErrorMessage(error);

    return res.status(status).json({
      error: { message },
    });
  }
}
