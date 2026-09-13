import type { NextApiRequest, NextApiResponse } from 'next';
import { apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import { getAdminAuditLogs } from 'models/adminAuditLog';

/** Page size used when the caller does not ask for one. */
const DEFAULT_LIMIT = 20;

/**
 * Hard ceiling on `?limit=`. Without it a single request can ask Prisma for an
 * unbounded `findMany` on the platform's hottest admin path, and a negative
 * value reaches `take`/`skip` unchecked.
 */
const MAX_LIMIT = 100;

const parsePage = (raw: unknown): number => {
  const parsed = Number.parseInt(String(raw ?? ''), 10);

  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
};

const parseLimit = (raw: unknown): number => {
  const parsed = Number.parseInt(String(raw ?? ''), 10);

  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;

  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
};

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

    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
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
