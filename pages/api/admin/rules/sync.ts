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
 *
 * Reused for BOTH message hooks below rather than minting a second code: a
 * wrong-typed `packageId` and a malformed one are the same operator-facing
 * problem ("the package id you sent is not usable"), and a second code would
 * need its own locale key and map entry for no additional meaning.
 */
const PACKAGE_ID_MESSAGE = 'invalid-package-id';

/**
 * `packageId` is OPTIONAL: absent means "synchronize every package's
 * subscriptions", which the ERP DTO expresses by typing it `Guid?`.
 *
 * When present it must be UUID-shaped. The value is forwarded to the ERP *and*
 * becomes the audit row's `targetId`, so an unchecked client string would reach
 * both — the same class as the team-resolution defect, where a raw
 * client-supplied id could be forwarded as an ERP tenant id. The ERP would
 * reject a non-Guid, but the platform must not be the component that forwards
 * it.
 *
 * `z.string().uuid()` is a syntactic shape check, not RFC-4122: measured against
 * the installed zod (3.25.64) it accepts a version-9 UUID, the all-zero UUID and
 * a wrong variant. That strength is deliberate — it rejects obviously malformed
 * input at the edge, while the ERP's `Guid` parsing remains the real authority.
 *
 * Defined locally, like `updatePlanModulesSchema` in
 * `pages/api/admin/rules/plans/[planId].ts`, because it is this route's own
 * request shape.
 *
 * `invalid_type_error` is set as well as the `.uuid()` message. Setting only
 * the refinement message left every WRONG-TYPED value (`42`, `{}`, `[…]`)
 * falling through to zod's own prose — `Expected string, received number` —
 * which is not code-shaped, so `adminErrorCopy` could not map it and the
 * operator got the generic "action failed" banner instead of a precise
 * sentence. Same three-way coverage `lib/zod/admin.ts` already has.
 *
 * `required_error` is deliberately NOT set: `.optional()` handles an absent key
 * before the inner schema runs, so that hook is unreachable — and absence is
 * meaningful here (see above), not an error.
 */
const syncModulesSchema = z.object({
  packageId: z
    .string({ invalid_type_error: PACKAGE_ID_MESSAGE })
    .uuid(PACKAGE_ID_MESSAGE)
    .optional(),
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
