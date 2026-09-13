import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getAdminDashboardData,
  parseAdminDashboardQuery,
} from '@/lib/adminDashboard';
import { apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';

/**
 * GET /api/admin/dashboard?page=&pageSize=&search=&status=
 *
 * Paginated on purpose: the GLOBAL subscription summary needs a full sweep
 * (per-tenant ERP reads only — there is no aggregate endpoint yet), but shipping
 * every tenant row to the browser does not. The sweep is cached in-process and
 * sliced here, and `search`/`status` are applied server-side so they match
 * against the WHOLE dataset rather than one page.
 */
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

    // 3. Validate the query (invalid input → 422, per this route family's
    //    error contract) BEFORE paying for a sweep.
    const query = parseAdminDashboardQuery(req.query);

    // 4. Return dashboard data (ERP outage handled internally, returning 200
    //    with health.ok=false)
    const data = await getAdminDashboardData(query);

    return res.status(200).json({ data });
  } catch (error) {
    const status = apiErrorStatus(error);
    const message = apiErrorMessage(error);

    return res.status(status).json({
      error: { message },
    });
  }
}
