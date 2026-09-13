import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import env from '@/lib/env';
import { classifyErpError, erp } from '@/lib/erp';
import { apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import {
  requirePlatformAdmin,
  type PlatformAdminActor,
} from '@/lib/guardPlatformAdmin';
import { validateWithSchema } from '@/lib/zod';
import { recordAdminAudit } from '@/lib/adminAudit';

/**
 * Stable validation code surfaced inside the 422 body by `validateWithSchema`.
 * Part of the admin contract — do not reword casually.
 */
const PACKAGE_ID_MESSAGE = 'invalid-package-id';

/**
 * `packageId` is OPTIONAL: absent means "synchronize every package's
 * subscriptions", which the ERP DTO expresses by typing it `Guid?`.
 *
 * When present it must be a UUID. The value is forwarded to the ERP *and* becomes
 * the audit row's `targetId`, so an unchecked client string would reach both —
 * the same class as the team-resolution defect, where a raw client-supplied id
 * could be forwarded as an ERP tenant id. The ERP would reject a non-Guid, but
 * the platform must not be the component that forwards it.
 *
 * Defined locally, like `updatePlanModulesSchema` in
 * `pages/api/admin/rules/plans/[planId].ts`, because it is this route's own
 * request shape.
 */
const syncModulesSchema = z.object({
  packageId: z.string().uuid(PACKAGE_ID_MESSAGE).optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Guard first, before the method guard: an anonymous or non-admin caller
    // must get 401/403 regardless of the verb they used, matching every other
    // `/api/admin/**` route.
    const actor = await requirePlatformAdmin(req, res);

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({
        error: { message: `Method ${req.method} Not Allowed` },
      });
    }

    return await handlePOST(req, res, actor);
  } catch (error) {
    console.error('[admin-rules-sync] request failed:', error);
    res.status(apiErrorStatus(error)).json({
      error: { message: apiErrorMessage(error) },
    });
  }
}

const handlePOST = async (
  req: NextApiRequest,
  res: NextApiResponse,
  actor: PlatformAdminActor
) => {
  // Validated BEFORE the audit row is opened: a malformed body is rejected
  // without leaving a `STARTED` entry behind, matching the order the
  // subscription routes use.
  const { packageId } = validateWithSchema(syncModulesSchema, req.body || {});

  const apiKey = env.erp.platformApiKey;
  if (!apiKey) {
    return res.status(503).json({ error: { message: 'erp-not-configured' } });
  }

  const targetId = packageId || 'ALL_PACKAGES';
  let logId: string | null = null;

  try {
    logId = await recordAdminAudit({
      actor,
      action: 'package.modules_sync',
      targetType: 'package',
      targetId,
      status: 'STARTED',
      details: { packageId },
    });

    // `result.message` is intentionally dropped: it is free-form, English-only
    // ERP copy ("Synchronized modules for 12 active subscriptions across 1
    // packages.") and upstream free text must not be forwarded to the client.
    // The envelope keeps its existing `{ ok, result }` shape so the caller is
    // unaffected; the admin UI renders its own localized success copy.
    await erp.syncSubscriptionsModulesM2M(apiKey, packageId);

    await recordAdminAudit({
      actor,
      action: 'package.modules_sync',
      targetType: 'package',
      targetId,
      status: 'SUCCEEDED',
      logId,
      details: { packageId, synced: true },
    });

    return res.status(200).json({ ok: true, result: { synced: true } });
  } catch (err) {
    // Bounded, safe code only — never the raw upstream message.
    const { status, code } = classifyErpError(err);
    console.error(`[admin-rules-sync] ERP call failed (${code}):`, err);

    await recordAdminAudit({
      actor,
      action: 'package.modules_sync',
      targetType: 'package',
      targetId,
      status: 'FAILED',
      logId,
      errorCode: code,
      details: { packageId },
    });

    return res.status(status).json({ error: { message: code } });
  }
};
