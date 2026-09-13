import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import env from '@/lib/env';
import { classifyErpError, erp } from '@/lib/erp';
import { ApiError, apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import { validateWithSchema } from '@/lib/zod';
import {
  requirePlatformAdmin,
  type PlatformAdminActor,
} from '@/lib/guardPlatformAdmin';
import { recordAdminAudit } from '@/lib/adminAudit';

/**
 * Stable code surfaced inside the 422 body by `validateWithSchema`, which wraps
 * every schema message as `Validation Error: <message>`.
 *
 * This used to be the prose sentence `'systemModuleIds must be an array of
 * GUIDs'`. Prose is not code-shaped, so `adminErrorCopy` could not map it and an
 * operator saw the generic "action failed" banner instead of being told the
 * module list was the problem. One code covers every malformed shape (missing,
 * null, non-array, non-UUID element) on purpose: the operator's next step is the
 * same in all of them, and the field is named in the copy.
 */
const INVALID_SYSTEM_MODULE_IDS = 'invalid-system-module-ids';

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
  systemModuleIds: z.array(z.string().uuid(INVALID_SYSTEM_MODULE_IDS), {
    required_error: INVALID_SYSTEM_MODULE_IDS,
    invalid_type_error: INVALID_SYSTEM_MODULE_IDS,
  }),
  syncExistingSubscriptions: z.boolean().default(true),
});

/**
 * `planId` is a path segment that is forwarded to the ERP *and* persisted as the
 * audit row's `targetId`, so an unchecked client string would reach both — the
 * same class as the team-resolution defect, where a raw client-supplied id was
 * forwarded as an ERP tenant id. Validated as a UUID to match the standard
 * `rules/sync.ts` applies to `packageId`: the mechanics differ (a query param,
 * not a body field), the standard does not. As there, this is a syntactic shape
 * check rather than RFC-4122 — zod 3.25.64 accepts a version-9 UUID, the all-zero
 * UUID and a wrong variant — so the ERP's `Guid` parsing remains the real
 * authority.
 *
 * A repeated query param arrives as an array and a missing one as `undefined`,
 * so a single `z.string()` check covers every malformed shape.
 */
const planIdSchema = z.string().uuid('invalid-plan-id');

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
  // Emitted as a code rather than the previous prose ("Invalid plan ID"): every
  // other admin route answers with a stable token, and a human sentence is
  // passed through by `adminErrorCopy` as-is, which rendered English prose in
  // the Arabic UI.
  const parsedPlanId = planIdSchema.safeParse(req.query.planId);
  if (!parsedPlanId.success) {
    throw new ApiError(400, 'invalid-plan-id');
  }

  const planId = parsedPlanId.data;

  // Validated with zod rather than the previous bare `Array.isArray` check: the
  // ERP DTO types this as `List<Guid>`, and the old check accepted ANY array
  // while its 422 message already promised GUIDs. A malformed list is reported
  // as `invalid-system-module-ids`, which `adminErrorCopy` turns into copy.
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
