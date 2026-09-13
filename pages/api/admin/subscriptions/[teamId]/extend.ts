import type { NextApiRequest, NextApiResponse } from 'next';
import env from '@/lib/env';
import { classifyErpError, ERP_M2M_READ_TIMEOUT_MS, erp } from '@/lib/erp';
import { ApiError, apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import { prisma } from '@/lib/prisma';
import { validateWithSchema } from '@/lib/zod';
import { extendSubscriptionSchema, parseStrictIsoDate } from '@/lib/zod/admin';
import {
  createAdminAuditStart,
  completeAdminAudit,
  failAdminAudit,
  sanitizeSubscriptionSnapshot,
  type AuditSnapshot,
} from 'models/adminAuditLog';

const ACTION = 'subscription.extend' as const;

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

/**
 * Epoch millis for an ERP-supplied date string, or `null` when it cannot be
 * understood.
 *
 * The platform's strict ISO parser is tried first so a well-formed value is read
 * exactly as sent. The WebAPI does not guarantee an offset on every serialized
 * `DateTime`, so a lenient fallback keeps a date-only or offset-less value from
 * silently disabling the comparison below.
 */
const toEpochMs = (value?: string | null): number | null => {
  if (!value) return null;

  const strict = parseStrictIsoDate(value);
  if (strict !== null) return strict;

  const fallback = Date.parse(value);
  return Number.isNaN(fallback) ? null : fallback;
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

    const body = validateWithSchema(extendSubscriptionSchema, req.body);

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
          `[admin-subscriptions-extend] before-state read failed (${failure.code}):`,
          err
        );
      }
    }

    const auditContext: Record<string, unknown> = {
      teamId: team.id,
      erpTenantId: tenantId,
      newEndDate: body.newEndDate,
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
    // Business guards. These run AFTER the STARTED row so a refused mutation
    // attempt is itself auditable ("operator X tried to extend Y"), and they
    // respond explicitly rather than by throwing, so no `instanceof` check is
    // needed to tell a platform rejection apart from an ERP failure.
    //
    // 422 is the platform's validation status (see `validateWithSchema`).
    // ---------------------------------------------------------------------
    // Awaited at every call site below (`return await reject(...)`). Without the
    // await the returned promise escapes this handler's `try/catch`: a
    // rejection — `res.status().json()` throwing on an already-sent response,
    // say — would surface as an unhandled rejection instead of being handled by
    // the route's error path.
    const reject = async (status: number, code: string) => {
      await failAdminAudit({
        logId,
        actor,
        action: ACTION,
        targetType: 'tenant',
        targetId: tenantId,
        errorCode: code,
        metadata: auditContext,
      });

      return res.status(status).json({ error: { message: code } });
    };

    const requestedEnd = parseStrictIsoDate(body.newEndDate);
    if (requestedEnd === null) {
      return await reject(422, 'invalid-iso-date');
    }

    // An "extend" that lands in the past expires the subscription instead of
    // lengthening it. Note this also rejects a date of *today*: the admin UI
    // sends local midnight for a picked date, which is already behind `now` on
    // most timezones.
    if (requestedEnd <= Date.now()) {
      return await reject(422, 'end-date-not-in-future');
    }

    // Shortening an existing subscription through the "extend" action is never
    // intended — plan changes own that (P3.2).
    //
    // Deliberately fail-open when the current end date is unknown (the
    // pre-read failed, or the ERP reported no subscription): the check above
    // already prevents the harmful case of extending into the past, and the ERP
    // remains the authority on whether the requested end date is valid. A
    // missing pre-read is recorded on the audit row as `beforeFetchError`
    // instead of blocking the operator.
    const currentEnd = toEpochMs(beforeState?.endDate);
    if (currentEnd !== null && requestedEnd <= currentEnd) {
      return await reject(422, 'end-date-not-after-current-end');
    }

    try {
      const result = await erp.extendTenantSubscription(
        apiKey,
        tenantId,
        body.newEndDate
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
          '[admin-subscriptions-extend] after-state read failed; falling back to the mutation response:',
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
        `[admin-subscriptions-extend] ERP call failed (${code}):`,
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
    console.error('[admin-subscriptions-extend] error:', error);
    res.status(apiErrorStatus(error)).json({
      error: { message: apiErrorMessage(error) },
    });
  }
}
