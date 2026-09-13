import type { NextApiRequest, NextApiResponse } from 'next';
import { apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import { getAdminAuditLogs } from 'models/adminAuditLog';

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

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const targetType = req.query.targetType as string | undefined;
    const targetId = req.query.targetId as string | undefined;
    const action = req.query.action as string | undefined;

    const result = await getAdminAuditLogs({
      page,
      limit,
      targetType,
      targetId,
      action,
    });

    return res.status(200).json({ data: result });
  } catch (error) {
    console.error('[admin-audit-logs] error:', error);
    res.status(apiErrorStatus(error)).json({
      error: { message: apiErrorMessage(error) },
    });
  }
}
