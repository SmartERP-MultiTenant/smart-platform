import type { NextApiRequest, NextApiResponse } from 'next';
import { ApiError, apiErrorStatus, apiErrorMessage } from '@/lib/errors';
import {
  requirePlatformAdmin,
  type PlatformAdminActor,
} from '@/lib/guardPlatformAdmin';
import { prisma } from '@/lib/prisma';
import { recordAdminAudit, type AdminAuditAction } from '@/lib/adminAudit';
import { applyAdminUserStateChange } from 'models/admin-users';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const actor = await requirePlatformAdmin(req, res);

    switch (req.method) {
      case 'GET':
        await handleGET(req, res);
        break;
      case 'PATCH':
        await handlePATCH(req, res, actor);
        break;
      default:
        res.setHeader('Allow', 'GET, PATCH');
        res.status(405).json({
          error: { message: `Method ${req.method} Not Allowed` },
        });
    }
  } catch (error) {
    console.error('[admin-users] request failed:', error);
    res.status(apiErrorStatus(error)).json({
      error: { message: apiErrorMessage(error) },
    });
  }
}

const handleGET = async (req: NextApiRequest, res: NextApiResponse) => {
  const { id } = req.query;
  const userId = id as string;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      createdAt: true,
      updatedAt: true,
      invalid_login_attempts: true,
      lockedAt: true,
      disabledAt: true,
      platformRole: true,
      teamMembers: {
        select: {
          id: true,
          role: true,
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  return res.status(200).json({ data: user });
};

const handlePATCH = async (
  req: NextApiRequest,
  res: NextApiResponse,
  actor: PlatformAdminActor
) => {
  const { id } = req.query;
  const targetUserId = id as string;
  const { disabled, locked } = req.body || {};

  // Audit intent is derived from the request *before* the mutation so that
  // failures can be recorded as FAILED events.
  const intendedActions: AdminAuditAction[] = [];
  if (typeof disabled === 'boolean') {
    intendedActions.push(disabled ? 'user.disable' : 'user.enable');
  }
  if (typeof locked === 'boolean') {
    intendedActions.push(locked ? 'user.lock' : 'user.unlock');
  }

  try {
    const { updatedUser, targetUser } = await applyAdminUserStateChange({
      actorId: actor.id,
      targetUserId,
      disabled,
      locked,
    });

    for (const action of intendedActions) {
      await recordAdminAudit({
        actor,
        action,
        targetUserId,
        targetUserEmail: targetUser.email,
        status: 'SUCCEEDED',
        details: { disabled, locked },
      });
    }

    return res.status(200).json({ data: updatedUser });
  } catch (error) {
    for (const action of intendedActions) {
      await recordAdminAudit({
        actor,
        action,
        targetUserId,
        status: 'FAILED',
        details: {
          reason: error instanceof Error ? error.message : 'unknown',
          httpStatus: apiErrorStatus(error),
        },
      });
    }
    throw error;
  }
};
