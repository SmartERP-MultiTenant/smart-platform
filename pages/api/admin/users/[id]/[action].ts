import type { NextApiRequest, NextApiResponse } from 'next';
import { ApiError } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/guardPlatformAdmin';
import { prisma } from '@/lib/prisma';
import { recordAdminAudit } from '@/lib/adminAudit';

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
    const actionStr = (action as string)?.toLowerCase();

    if (!['disable', 'enable', 'lock', 'unlock'].includes(actionStr)) {
      throw new ApiError(404, `Unknown action: ${actionStr}`);
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

    // Safety checks
    if (
      targetUserId === actor.id &&
      (actionStr === 'disable' || actionStr === 'lock')
    ) {
      throw new ApiError(
        422,
        `Cannot ${actionStr} your own administrator account`
      );
    }

    if (
      actionStr === 'disable' &&
      targetUser.platformRole === 'PLATFORM_ADMIN'
    ) {
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

    switch (actionStr) {
      case 'disable':
        updateData.disabledAt = new Date();
        break;
      case 'enable':
        updateData.disabledAt = null;
        break;
      case 'lock':
        updateData.lockedAt = new Date();
        break;
      case 'unlock':
        updateData.lockedAt = null;
        updateData.invalid_login_attempts = 0;
        break;
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

    await recordAdminAudit({
      actor,
      action: `user.${actionStr}` as any,
      targetUserId,
      targetUserEmail: targetUser.email,
      status: 'SUCCEEDED',
      details: { action: actionStr },
    });

    return res.status(200).json({ data: updatedUser });
  } catch (error: any) {
    const message = error.message || 'Something went wrong';
    const status = error.status || 500;
    res.status(status).json({ error: { message } });
  }
}
