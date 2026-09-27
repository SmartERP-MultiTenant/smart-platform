import type { NextApiRequest, NextApiResponse } from 'next';
import env from '@/lib/env';
import { classifyErpError, ERP_M2M_READ_TIMEOUT_MS, erp } from '@/lib/erp';
import { ApiError, apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import { prisma } from '@/lib/prisma';
import { validateWithSchema } from '@/lib/zod';
import { addSubscriptionSchema } from '@/lib/zod/admin';
import {
  createAdminAuditStart,
  completeAdminAudit,
  failAdminAudit,
  isNoActiveSubscriptionEnvelope,
  sanitizeSubscriptionSnapshot,
  type AuditSnapshot,
} from 'models/adminAuditLog';

const ACTION = 'subscription.create' as const;

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

    const body = validateWithSchema(addSubscriptionSchema, req.body);

    const apiKey = env.erp.platformApiKey;
    if (!apiKey) {
      // `expose` because this message is a stable action code, not an internal
      // detail: collapsing it to `internal-error` would hide the one thing the
      // operator can fix. See `lib/errors.ts`.
      throw new ApiError(503, 'erp-not-configured', { expose: true });
    }

    const team = await resolveTeam(teamId);
    const tenantId = team.erpTenantId;

    // Read the "before" state. A 404 simply means the tenant has no
    // subscription yet, which is the expected starting point for a CREATE —
    // only a genuine failure is recorded, so the audit row can distinguish
    // "there was no subscription" from "we could not read it".
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

      // The read succeeded but nothing in the body matched the whitelist: record
      // it with the same marker the fetch-failure path uses, so a drifted payload
      // cannot masquerade as a subscription with no readable fields.
      //
      // A null subscription is NOT that case. The ERP answers 200 with a null
      // subscription when the tenant has none — including straight after a cancel
      // — so marking it would paint the healthy majority as an error. See
      // `isNoActiveSubscriptionEnvelope`.
      if (!beforeState && !isNoActiveSubscriptionEnvelope(rawBefore)) {
        beforeFetchError = 'erp-malformed-payload';
      }
    } catch (err) {
      const failure = classifyErpError(err);
      if (failure.code !== 'erp-not-found') {
        beforeFetchError = failure.code;
        console.warn(
          `[admin-subscriptions-create] before-state read failed (${failure.code}):`,
          err
        );
      }
    }

    // Explicit whitelist. Dumping the whole request body into the audit store
    // is benign only while today's schema happens to allow safe fields — any
    // future field would flow into the trail automatically.
    const auditContext: Record<string, unknown> = {
      teamId: team.id,
      erpTenantId: tenantId,
      packageId: body.packageId,
      isTrial: body.isTrial,
      ...(body.trialDays !== undefined ? { trialDays: body.trialDays } : {}),
      ...(body.startDate ? { startDate: body.startDate } : {}),
      ...(body.endDate ? { endDate: body.endDate } : {}),
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
      const result = await erp.createTenantSubscription(apiKey, tenantId, {
        packageId: body.packageId,
        startDate: body.startDate,
        endDate: body.endDate,
        trialDays: body.trialDays,
        isTrial: body.isTrial,
      });

      let afterState: AuditSnapshot | null = null;
      // Set when the after-body is the ERP's documented "no active subscription"
      // answer rather than an unreadable one; consulted by the marker below.
      let afterEnvelopeWasEmpty = false;
      // Set when the read itself failed. The drift marker below means "the ERP
      // answered and we could not read it", so it must never fire when we never
      // got an answer at all — that case records the classified failure instead.
      let afterReadFailed = false;
      try {
        const rawAfter = await erp.getTenantBillingSubscription(
          apiKey,
          tenantId,
          AbortSignal.timeout(ERP_M2M_READ_TIMEOUT_MS)
        );
        afterState = sanitizeSubscriptionSnapshot(rawAfter);
        afterEnvelopeWasEmpty = isNoActiveSubscriptionEnvelope(rawAfter);
      } catch (err) {
        afterReadFailed = true;
        // A 3s read timeout or an upstream 5xx is not schema drift. Record the
        // real reason the way the before-site does (`erp-unavailable`,
        // `erp-upstream-failure`, …), or the store claims a permanent contract
        // violation for what was a slow or unreachable ERP — the exact
        // false-alarm class this marker was added to remove.
        //
        // `erp-not-found` is skipped for the same reason the before-site skips
        // it: this endpoint answers 200 with a null subscription when the tenant
        // has none, so a 404 describes the resource's absence rather than a
        // failed read, and `isNoActiveSubscriptionEnvelope` already models that
        // absence as the legible empty state.
        const failure = classifyErpError(err);
        if (failure.code !== 'erp-not-found') {
          auditContext.afterFetchError = failure.code;
        }
        console.warn(
          `[admin-subscriptions-create] after-state read failed (${failure.code}); falling back to the mutation response:`,
          err
        );
        afterState = sanitizeSubscriptionSnapshot(result);
        afterEnvelopeWasEmpty = isNoActiveSubscriptionEnvelope(result);
      }

      // A successful apply whose response we cannot read must not be audited as a
      // clean success with no after-state. Mirrors the before-site marker.
      //
      // The null-subscription carve-out has to be applied at the after-site too,
      // and for the same reason: this is the same endpoint as the before-read, so
      // a null answer here means "the tenant now has no active subscription" — a
      // legible empty state, not a body we failed to read. Marking it would record
      // a contract violation the ERP did not commit.
      //
      // Drift requires an ANSWER we could not read. When the read itself failed,
      // the fallback above sanitizes the mutation ack, which is not a
      // subscription at all, so without the guard every timed-out after-read
      // would be stamped as drift even though the ERP never replied.
      if (!afterReadFailed && !afterState && !afterEnvelopeWasEmpty) {
        auditContext.afterFetchError = 'erp-malformed-payload';
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
        `[admin-subscriptions-create] ERP call failed (${code}):`,
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
    console.error('[admin-subscriptions-create] error:', error);
    res.status(apiErrorStatus(error)).json({
      error: { message: apiErrorMessage(error) },
    });
  }
}
