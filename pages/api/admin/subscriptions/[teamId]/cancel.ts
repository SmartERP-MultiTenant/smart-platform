import type { NextApiRequest, NextApiResponse } from 'next';
import env from '@/lib/env';
import { classifyErpError, ERP_M2M_READ_TIMEOUT_MS, erp } from '@/lib/erp';
import { ApiError, apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import { prisma } from '@/lib/prisma';
import { validateWithSchema } from '@/lib/zod';
import { cancelSubscriptionSchema } from '@/lib/zod/admin';
import {
  createAdminAuditStart,
  completeAdminAudit,
  failAdminAudit,
  sanitizeSubscriptionSnapshot,
  type AuditSnapshot,
} from 'models/adminAuditLog';

const ACTION = 'subscription.cancel' as const;

/**
 * Subscription statuses on which a cancel is meaningful. The ERP returns 404
 * ("No active subscription for tenant") for anything else, which is
 * indistinguishable from the platform's own `team-not-found` 404 once it
 * crosses the wire — so the platform decides first, from the state it read.
 */
const CANCELLABLE_STATUSES = new Set(['active', 'trial']);

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

    const body = validateWithSchema(cancelSubscriptionSchema, req.body || {});

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
          `[admin-subscriptions-cancel] before-state read failed (${failure.code}):`,
          err
        );
      }
    }

    const auditContext: Record<string, unknown> = {
      teamId: team.id,
      erpTenantId: tenantId,
      ...(body.reason ? { reason: body.reason } : {}),
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

    // ---------------------------------------------------------------------
    // Business guard, deliberately evaluated AFTER the STARTED row so a refused
    // attempt is itself auditable, and answered explicitly rather than thrown so
    // no `instanceof` check is needed to separate it from an ERP failure.
    //
    // 409 (not 404) because the subscription exists but is not in a state where
    // the operation applies — and because the ERP's own 404 for this case is
    // already taken by `team-not-found`.
    //
    // Fail-open when the pre-read failed (`beforeState === null` with a
    // `beforeFetchError`): the ERP stays the authority, and blocking a
    // legitimate cancel because of a transient read failure would be worse than
    // letting the ERP answer.
    // ---------------------------------------------------------------------
    const currentStatus = beforeState?.status?.toLowerCase();
    if (currentStatus && !CANCELLABLE_STATUSES.has(currentStatus)) {
      const code = 'subscription-not-active';

      await failAdminAudit({
        logId,
        actor,
        action: ACTION,
        targetType: 'tenant',
        targetId: tenantId,
        errorCode: code,
        metadata: auditContext,
      });

      return res.status(409).json({ error: { message: code } });
    }

    try {
      const result = await erp.cancelTenantSubscription(apiKey, tenantId);

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
          '[admin-subscriptions-cancel] after-state read failed; falling back to the mutation response:',
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
        `[admin-subscriptions-cancel] ERP call failed (${code}):`,
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
    console.error('[admin-subscriptions-cancel] error:', error);
    res.status(apiErrorStatus(error)).json({
      error: { message: apiErrorMessage(error) },
    });
  }
}
