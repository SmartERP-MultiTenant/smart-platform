import { NextApiRequest, NextApiResponse } from 'next';
import env from '@/lib/env';
import { classifyErpError, erp } from '@/lib/erp';
import { apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import {
  AdminRulesPayload,
  createDegradedRulesPayload,
} from '@/lib/adminRules';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Guard first, before the method guard: an anonymous or non-admin caller
    // must get 401/403 regardless of the verb they used, matching every other
    // `/api/admin/**` route. `requirePlatformAdmin` throws rather than sending,
    // so there is exactly one response path and no double-send.
    await requirePlatformAdmin(req, res);

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({
        error: { message: `Method ${req.method} Not Allowed` },
      });
    }

    return await handleGET(req, res);
  } catch (error) {
    // 4xx `ApiError` messages (401/403 from the guard) stay descriptive; any
    // 5xx collapses to a stable token so internals never leak.
    console.error('[admin-rules] request failed:', error);
    res.status(apiErrorStatus(error)).json({
      error: { message: apiErrorMessage(error) },
    });
  }
}

const handleGET = async (req: NextApiRequest, res: NextApiResponse) => {
  const apiKey = env.erp.platformApiKey;
  if (!apiKey) {
    return res
      .status(200)
      .json({ data: createDegradedRulesPayload('erp-not-configured') });
  }

  try {
    const [packages, systemModules] = await Promise.all([
      erp.getPackagesM2M(apiKey),
      erp.getSystemModulesM2M(apiKey),
    ]);

    const payload: AdminRulesPayload = {
      ok: true,
      packages: Array.isArray(packages) ? packages : [],
      systemModules: Array.isArray(systemModules) ? systemModules : [],
    };

    return res.status(200).json({ data: payload });
  } catch (err) {
    // Deliberate soft-fail: the admin page renders a degraded matrix rather
    // than an error page, so the status stays 200 and `ok: false` carries the
    // signal. Only a bounded, safe code is reported — never the upstream body.
    const { code } = classifyErpError(err);
    console.error(
      `[ADMIN_RULES_ERP_FETCH_ERROR] rules fetch failed (${code}):`,
      err
    );

    return res.status(200).json({ data: createDegradedRulesPayload(code) });
  }
};
