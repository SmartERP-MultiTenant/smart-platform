import type { NextApiRequest, NextApiResponse } from 'next';
import { ApiError } from '@/lib/errors';
import {
  requirePlatformAdmin,
  type PlatformAdminActor,
} from '@/lib/guardPlatformAdmin';
import { prisma } from '@/lib/prisma';
import { recordAdminAudit } from '@/lib/adminAudit';

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
  } catch (error: any) {
    const message = error.message || 'Something went wrong';
    const status = error.status || 500;
    res.status(status).json({ error: { message } });
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

  if (typeof disabled === 'undefined' && typeof locked === 'undefined') {
    throw new ApiError(422, 'Must specify disabled or locked status');
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      name: true,
      platformRole: true,
      disabledAt: true,
      lockedAt: true,
    },
  });

  if (!targetUser) {
    throw new ApiError(404, 'User not found');
  }

  // Safety check 1: Reject self-disable or self-lock
  if (targetUserId === actor.id && (disabled === true || locked === true)) {
    throw new ApiError(
      422,
      'Cannot disable or lock your own administrator account'
    );
  }

  // Safety check 2: Reject disabling the last active PLATFORM_ADMIN
  if (disabled === true && targetUser.platformRole === 'PLATFORM_ADMIN') {
    const remainingAdmins = await prisma.user.count({
      where: {
        platformRole: 'PLATFORM_ADMIN',
        disabledAt: null,
        id: { not: targetUserId },
      },
    });

    if (remainingAdmins === 0) {
      throw new ApiError(
        422,
        'Cannot disable the last active platform administrator'
      );
    }
  }

  const updateData: {
    disabledAt?: Date | null;
    lockedAt?: Date | null;
    invalid_login_attempts?: number;
  } = {};

  if (typeof disabled === 'boolean') {
    updateData.disabledAt = disabled ? new Date() : null;
  }

  if (typeof locked === 'boolean') {
    updateData.lockedAt = locked ? new Date() : null;
    if (!locked) {
      updateData.invalid_login_attempts = 0;
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: updateData,
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
    },
  });

  // Audit logging
  if (typeof disabled === 'boolean') {
    await recordAdminAudit({
      actor,
      action: disabled ? 'user.disable' : 'user.enable',
      targetUserId,
      targetUserEmail: targetUser.email,
      status: 'SUCCEEDED',
      details: { disabled },
    });
  }

  if (typeof locked === 'boolean') {
    await recordAdminAudit({
      actor,
      action: locked ? 'user.lock' : 'user.unlock',
      targetUserId,
      targetUserEmail: targetUser.email,
      status: 'SUCCEEDED',
      details: { locked },
    });
  }

  return res.status(200).json({ data: updatedUser });
};
