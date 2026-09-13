import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import env from '@/lib/env';
import { classifyErpError, erp } from '@/lib/erp';
import { apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import { validateWithSchema } from '@/lib/zod';
import {
  requirePlatformAdmin,
  type PlatformAdminActor,
} from '@/lib/guardPlatformAdmin';
import { recordAdminAudit } from '@/lib/adminAudit';

const GUID_LIST_MESSAGE = 'systemModuleIds must be an array of GUIDs';

/**
 * PUT body contract, mirroring the ERP's `PackageModulesUpdateDto`
 * (`SystemModuleIds: List<Guid>`, `SyncExistingSubscriptions: bool`).
 *
 * `syncExistingSubscriptions` keeps the `true` default the previous inline
 * destructuring applied. The ERP DTO's own default is `false`, so this is a
 * deliberate platform-side choice and must not drift silently.
 *
 * An EMPTY `systemModuleIds` array is valid on purpose: it is how the
 * "deselect all" + save flow revokes every module from a plan.
 */
const updatePlanModulesSchema = z.object({
  systemModuleIds: z.array(z.string().uuid(GUID_LIST_MESSAGE), {
    required_error: GUID_LIST_MESSAGE,
    invalid_type_error: GUID_LIST_MESSAGE,
  }),
  syncExistingSubscriptions: z.boolean().default(true),
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

    if (req.method !== 'PUT') {
      res.setHeader('Allow', 'PUT');
      return res.status(405).json({
        error: { message: `Method ${req.method} Not Allowed` },
      });
    }

    return await handlePUT(req, res, actor);
  } catch (error) {
    console.error('[admin-rules-plan] request failed:', error);
    res.status(apiErrorStatus(error)).json({
      error: { message: apiErrorMessage(error) },
    });
  }
}

const handlePUT = async (
  req: NextApiRequest,
  res: NextApiResponse,
  actor: PlatformAdminActor
) => {
  const { planId } = req.query;

  if (!planId || typeof planId !== 'string') {
    return res.status(400).json({ error: { message: 'Invalid plan ID' } });
  }

  // Validated with zod rather than the previous bare `Array.isArray` check: the
  // ERP DTO types this as `List<Guid>`, and the old check accepted ANY array
  // while its 422 message already promised GUIDs.
  const { systemModuleIds, syncExistingSubscriptions } = validateWithSchema(
    updatePlanModulesSchema,
    req.body || {}
  );

  const apiKey = env.erp.platformApiKey;
  if (!apiKey) {
    return res.status(503).json({ error: { message: 'erp-not-configured' } });
  }

  let logId: string | null = null;

  try {
    logId = await recordAdminAudit({
      actor,
      action: 'package.modules_update',
      targetType: 'package',
      targetId: planId,
      status: 'STARTED',
      details: {
        newSystemModuleIds: systemModuleIds,
        syncExistingSubscriptions,
      },
    });

    const updatedPackage = await erp.updatePackageModulesM2M(
      apiKey,
      planId,
      systemModuleIds,
      syncExistingSubscriptions
    );

    await recordAdminAudit({
      actor,
      action: 'package.modules_update',
      targetType: 'package',
      targetId: planId,
      status: 'SUCCEEDED',
      logId,
      after: {
        packageId: updatedPackage.id,
        packageName: updatedPackage.name,
        systemModuleCodes: updatedPackage.systemModuleCodes,
      },
      details: {
        syncExistingSubscriptions,
        modulesCount: systemModuleIds.length,
      },
    });

    return res.status(200).json({
      ok: true,
      package: updatedPackage,
      // Stable token instead of inline Arabic copy: the admin UI localizes its
      // own success text (`admin-rules-save-success`), so nothing renders this.
      message: 'package-modules-updated',
    });
  } catch (err) {
    // Bounded, safe code only — never the raw upstream message.
    const { status, code } = classifyErpError(err);
    console.error(`[admin-rules-plan] ERP call failed (${code}):`, err);

    await recordAdminAudit({
      actor,
      action: 'package.modules_update',
      targetType: 'package',
      targetId: planId,
      status: 'FAILED',
      logId,
      errorCode: code,
      details: {
        attemptedSystemModuleIds: systemModuleIds,
      },
    });

    return res.status(status).json({ error: { message: code } });
  }
};
