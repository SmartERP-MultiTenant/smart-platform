import type { NextApiRequest, NextApiResponse } from 'next';
import env from '@/lib/env';
import { erp } from '@/lib/erp';
import { ApiError, apiErrorMessage, apiErrorStatus } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import { prisma } from '@/lib/prisma';
import { validateWithSchema } from '@/lib/zod';
import { addSubscriptionSchema } from '@/lib/zod/admin';
import {
  createAdminAuditStart,
  completeAdminAudit,
  failAdminAudit,
  sanitizeSubscriptionSnapshot,
  type AuditSnapshot,
} from 'models/adminAuditLog';

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
      throw new ApiError(400, 'Invalid team identifier');
    }

    const body = validateWithSchema(addSubscriptionSchema, req.body);

    const apiKey = env.erp.platformApiKey;
    if (!apiKey) {
      throw new ApiError(503, 'ERP Platform API Key is not configured');
    }

    // Resolve tenantId
    const team = await prisma.team.findFirst({
      where: {
        OR: [{ id: teamId }, { slug: teamId }, { erpTenantId: teamId }],
      },
    });

    const tenantId = team?.erpTenantId || team?.id || teamId;

    // Read before state
    let beforeState: AuditSnapshot | null = null;
    try {
      const rawBefore = await erp.getTenantBillingSubscription(apiKey, tenantId);
      beforeState = sanitizeSubscriptionSnapshot(rawBefore);
    } catch {
      // Ignored if tenant does not have a subscription yet
    }

    const logId = await createAdminAuditStart({
      actor,
      action: 'subscription.create',
      targetType: 'tenant',
      targetId: tenantId,
      before: beforeState,
      metadata: { body, teamId },
    });

    try {
      const result = await erp.createTenantSubscription(apiKey, tenantId, {
        packageId: body.packageId,
        startDate: body.startDate,
        endDate: body.endDate,
        trialDays: body.trialDays,
        isTrial: body.isTrial,
      });

      // Read after state
      let afterState: AuditSnapshot | null = null;
      try {
        const rawAfter = await erp.getTenantBillingSubscription(apiKey, tenantId);
        afterState = sanitizeSubscriptionSnapshot(rawAfter);
      } catch {
        afterState = sanitizeSubscriptionSnapshot(result);
      }

      await completeAdminAudit({
        logId,
        actor,
        action: 'subscription.create',
        targetType: 'tenant',
        targetId: tenantId,
        after: afterState,
        metadata: { body, teamId },
      });

      return res.status(200).json({ data: result });
    } catch (err: any) {
      const status = err.status || 502;
      const message = err.message || 'Failed to create subscription in ERP';

      await failAdminAudit({
        logId,
        actor,
        action: 'subscription.create',
        targetType: 'tenant',
        targetId: tenantId,
        errorCode: `ERP_${status}`,
        metadata: { error: message, teamId },
      });

      return res.status(status).json({
        error: { message },
      });
    }
  } catch (error) {
    console.error('[admin-subscriptions-create] error:', error);
    res.status(apiErrorStatus(error)).json({
      error: { message: apiErrorMessage(error) },
    });
  }
}
