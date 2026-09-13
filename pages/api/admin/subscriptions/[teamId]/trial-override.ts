import type { NextApiRequest, NextApiResponse } from 'next';
import env from '@/lib/env';
import { classifyErpError, ERP_M2M_READ_TIMEOUT_MS, erp } from '@/lib/erp';
import { ApiError, apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import { prisma } from '@/lib/prisma';
import { validateWithSchema } from '@/lib/zod';
import { trialOverrideSchema } from '@/lib/zod/admin';
import {
  createAdminAuditStart,
  completeAdminAudit,
  failAdminAudit,
  sanitizeSubscriptionSnapshot,
  type AuditSnapshot,
} from 'models/adminAuditLog';

const ACTION = 'subscription.trial_override' as const;

/**
 * Resolves the platform `Team` behind a `teamId` path segment.
 *
 * Precedence is explicit: platform `Team.id` first (the identifier the admin UI
 * sends), then `slug`, then the ERP tenant id. A single
 * `findFirst({ OR: [...] })` left the winner up to the database's row order
 * whenever two teams collided across those columns (one team's slug happening to
 * equal another team's id), which is not something an audited mutation should
 * leave to chance. The `erpTenantId` lookup is the only non-unique one, so it is
 * ordered to stay stable.
 *
 * Throws instead of falling back to the raw client string: an unmatched `teamId`
 * must NOT be forwarded to the ERP, or an admin could mutate the subscription of
 * an arbitrary ERP tenant that has no platform `Team` linkage, and the audit
 * row's `targetId` would be unchecked client input.
 */
const resolveTeam = async (
  teamId: string
): Promise<{ id: string; erpTenantId: string }> => {
  const select = { id: true, erpTenantId: true };

  const team =
    (await prisma.team.findUnique({ where: { id: teamId }, select })) ??
    (await prisma.team.findUnique({ where: { slug: teamId }, select })) ??
    (await prisma.team.findFirst({
      where: { erpTenantId: teamId },
      select,
      orderBy: { createdAt: 'asc' },
    }));

  if (!team) {
    throw new ApiError(404, 'team-not-found');
  }

  if (!team.erpTenantId) {
    throw new ApiError(400, 'erp-not-linked');
  }

  return { id: team.id, erpTenantId: team.erpTenantId };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const actor = await requirePlatformAdmin(req, res);

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({
        error: { message: `Method ${req.method} Not Allowed` },
      });
    }

    const { teamId } = req.query;
    if (!teamId || typeof teamId !== 'string') {
      throw new ApiError(400, 'invalid-team-id');
    }

    const body = validateWithSchema(trialOverrideSchema, req.body);

    const apiKey = env.erp.platformApiKey;
    if (!apiKey) {
      // `expose` because this message is a stable action code, not an internal
      // detail: collapsing it to `internal-error` would hide the one thing the
      // operator can fix. See `lib/errors.ts`.
      throw new ApiError(503, 'erp-not-configured', { expose: true });
    }

    const team = await resolveTeam(teamId);
    const tenantId = team.erpTenantId;

    let beforeState: AuditSnapshot | null = null;
    let beforeFetchError: string | null = null;
    try {
      const rawBefore = await erp.getTenantBillingSubscription(
        apiKey,
        tenantId,
        // Best-effort read: bounded so a hung ERP socket cannot stall the
        // operator's mutation. The catch below turns a timeout into
        // `beforeFetchError` and the mutation still proceeds.
        AbortSignal.timeout(ERP_M2M_READ_TIMEOUT_MS)
      );
      beforeState = sanitizeSubscriptionSnapshot(rawBefore);
    } catch (err) {
      const failure = classifyErpError(err);
      if (failure.code !== 'erp-not-found') {
        beforeFetchError = failure.code;
        console.warn(
          `[admin-subscriptions-trial-override] before-state read failed (${failure.code}):`,
          err
        );
      }
    }

    const auditContext: Record<string, unknown> = {
      teamId: team.id,
      erpTenantId: tenantId,
      newTrialEndDate: body.newTrialEndDate,
      ...(beforeFetchError ? { beforeFetchError } : {}),
    };

    const logId = await createAdminAuditStart({
      actor,
      action: ACTION,
      targetType: 'tenant',
      targetId: tenantId,
      before: beforeState,
      metadata: auditContext,
    });

    try {
      const result = await erp.trialOverrideTenantSubscription(
        apiKey,
        tenantId,
        body.newTrialEndDate
      );

      let afterState: AuditSnapshot | null = null;
      try {
        const rawAfter = await erp.getTenantBillingSubscription(
          apiKey,
          tenantId,
          AbortSignal.timeout(ERP_M2M_READ_TIMEOUT_MS)
        );
        afterState = sanitizeSubscriptionSnapshot(rawAfter);
      } catch (err) {
        console.warn(
          '[admin-subscriptions-trial-override] after-state read failed; falling back to the mutation response:',
          err
        );
        afterState = sanitizeSubscriptionSnapshot(result);
      }

      await completeAdminAudit({
        logId,
        actor,
        action: ACTION,
        targetType: 'tenant',
        targetId: tenantId,
        after: afterState,
        metadata: auditContext,
      });

      return res.status(200).json({ data: result });
    } catch (err) {
      // Upstream detail stays server-side: `ErpApiError.message` is lifted
      // verbatim from the ERP response body, so echoing it would leak upstream
      // internals and let an upstream 401/500 reach the browser as the admin's
      // own status.
      const { status, code } = classifyErpError(err);
      console.error(
        `[admin-subscriptions-trial-override] ERP call failed (${code}):`,
        err
      );

      await failAdminAudit({
        logId,
        actor,
        action: ACTION,
        targetType: 'tenant',
        targetId: tenantId,
        errorCode: code,
        metadata: auditContext,
      });

      return res.status(status).json({
        error: { message: code },
      });
    }
  } catch (error) {
    console.error('[admin-subscriptions-trial-override] error:', error);
    res.status(apiErrorStatus(error)).json({
      error: { message: apiErrorMessage(error) },
    });
  }
}
