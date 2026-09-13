import { NextApiRequest, NextApiResponse } from 'next';
import env from '@/lib/env';
import { erp } from '@/lib/erp';
import { apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import {
  aggregateRevenueData,
  createDegradedRevenuePayload,
  resolveRevenueSource,
} from '@/lib/adminRevenue';

/**
 * Stable, non-sensitive codes carried in a degraded payload's `error` field.
 *
 * These used to be inline Arabic sentences handed straight to the client, which
 * an admin on the English locale would still read (and which duplicated copy
 * that already lives in the locale files). The field stays a string — the
 * e2e flakiness contract in `tests/e2e/admin/admin-revenue.spec.ts` asserts
 * `typeof error === 'string'` whenever `ok` is false — but `AdminRevenueTable`
 * now maps the code onto localized copy instead of rendering it verbatim.
 */
const DEGRADED_ERP_NOT_CONFIGURED = 'erp-not-configured';
const DEGRADED_ERP_UNREACHABLE = 'erp-unreachable';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Guard first, before the method switch: an anonymous or non-admin caller
    // must get 401/403 regardless of the verb they used. This route previously
    // checked `req.method` in the handler and only guarded inside `handleGET`,
    // so an anonymous `POST /api/admin/revenue` answered 405 instead of 401 —
    // the only admin route that leaked verb information before auth.
    await requirePlatformAdmin(req, res);

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
  } catch (error) {
    // Same discipline as every other `/api/admin/**` route: `apiErrorStatus`
    // bounds the status and `apiErrorMessage` collapses anything 5xx / non-
    // `ApiError` to `internal-error`. Echoing `error.message` directly used to
    // forward `ErpApiError` text (lifted verbatim from the ERP response body) to
    // the browser.
    res.status(apiErrorStatus(error)).json({
      error: { message: apiErrorMessage(error) },
    });
  }
}

const handleGET = async (req: NextApiRequest, res: NextApiResponse) => {
  // `requirePlatformAdmin` already ran in the handler, before the method
  // switch. Do not call it again here: a second call costs another DB select on
  // every render.
  try {
    const apiKey = env.erp.platformApiKey;
    if (!apiKey) {
      // Degraded state when platform API key is not configured
      const payload = createDegradedRevenuePayload(DEGRADED_ERP_NOT_CONFIGURED);
      res.status(200).json({ data: payload });
      return;
    }

    const rawData = await erp.listSubscriptionsM2M(apiKey);
    // Source label comes from `lib/adminRevenue.ts` (single source of truth).
    // No mode is passed: only the M2M aggregate endpoint is wired today.
    const payload = aggregateRevenueData(rawData, resolveRevenueSource());
    res.status(200).json({ data: payload });
  } catch (erpErr: any) {
    // Log the real error so we can diagnose it in the Next.js terminal
    console.error('[admin/revenue] ERP call failed:', {
      status: erpErr?.status,
      message: erpErr?.message,
      url: `${process.env.ERP_API_URL}/platform/billing/subscriptions`,
    });
    // Return 200 with degraded payload so the UI never crashes
    const payload = createDegradedRevenuePayload(DEGRADED_ERP_UNREACHABLE);
    res.status(200).json({ data: payload });
  }
};
