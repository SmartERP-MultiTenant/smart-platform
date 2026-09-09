import type { NextApiRequest, NextApiResponse } from 'next';
import { ApiError, apiErrorStatus, apiErrorMessage } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import { recordAdminAudit, type AdminAuditAction } from '@/lib/adminAudit';
import { applyAdminUserStateChange } from 'models/admin-users';

type AdminUserAction = 'disable' | 'enable' | 'lock' | 'unlock';

const ADMIN_USER_ACTIONS: AdminUserAction[] = [
  'disable',
  'enable',
  'lock',
  'unlock',
];

const ACTION_TO_AUDIT: Record<AdminUserAction, AdminAuditAction> = {
  disable: 'user.disable',
  enable: 'user.enable',
  lock: 'user.lock',
  unlock: 'user.unlock',
};

const ACTION_TO_STATE: Record<
  AdminUserAction,
  { disabled?: boolean; locked?: boolean }
> = {
  disable: { disabled: true },
  enable: { disabled: false },
  lock: { locked: true },
  unlock: { locked: false },
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

    const { id, action } = req.query;
    const targetUserId = id as string;
    const rawAction = ((action as string) || '').toLowerCase();

    if (!(ADMIN_USER_ACTIONS as string[]).includes(rawAction)) {
      throw new ApiError(404, `Unknown action: ${rawAction}`);
    }

    const actionStr = rawAction as AdminUserAction;
    const auditAction = ACTION_TO_AUDIT[actionStr];

    try {
      const { updatedUser, targetUser } = await applyAdminUserStateChange({
        actorId: actor.id,
        targetUserId,
        ...ACTION_TO_STATE[actionStr],
      });

      await recordAdminAudit({
        actor,
        action: auditAction,
        targetUserId,
        targetUserEmail: targetUser.email,
        status: 'SUCCEEDED',
        details: { action: actionStr },
      });

      return res.status(200).json({ data: updatedUser });
    } catch (error) {
      await recordAdminAudit({
        actor,
        action: auditAction,
        targetUserId,
        status: 'FAILED',
        details: {
          reason: error instanceof Error ? error.message : 'unknown',
          httpStatus: apiErrorStatus(error),
        },
      });
      throw error;
    }
  } catch (error) {
    console.error('[admin-users] request failed:', error);
    res.status(apiErrorStatus(error)).json({
      error: { message: apiErrorMessage(error) },
    });
  }
}
