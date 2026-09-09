import { ApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

const UPDATED_USER_SELECT = {
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
} as const;

/**
 * Shared, transactional engine for platform-admin user mutations
 * (disable/enable/lock/unlock) — single source of truth for the safety rules
 * that used to be duplicated across the PATCH and POST action handlers.
 *
 * Safety properties (all enforced inside one interactive transaction):
 * 1. An administrator can never disable or lock their own account.
 * 2. Disabling the last active PLATFORM_ADMIN is rejected. Racing disables are
 *    serialized by locking every currently-active PLATFORM_ADMIN row
 *    (`SELECT ... FOR UPDATE`) before the authoritative recount, so two
 *    concurrent disables cannot both pass the guard.
 * 3. Disabling a user also deletes all of their persisted sessions (database
 *    session strategy), revoking access immediately.
 * 4. Transient transaction conflicts (P2034) are retried up to 3 times before
 *    surfacing a typed 409 conflict.
 */
export const applyAdminUserStateChange = async ({
  actorId,
  targetUserId,
  disabled,
  locked,
}: {
  actorId: string;
  targetUserId: string;
  disabled?: boolean;
  locked?: boolean;
}) => {
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

  // Safety check 1: reject self-disable / self-lock.
  if (targetUserId === actorId && (disabled === true || locked === true)) {
    throw new ApiError(
      422,
      'Cannot disable or lock your own administrator account'
    );
  }

  const buildUpdateData = (): {
    disabledAt?: Date | null;
    lockedAt?: Date | null;
    invalid_login_attempts?: number;
  } => {
    const data: {
      disabledAt?: Date | null;
      lockedAt?: Date | null;
      invalid_login_attempts?: number;
    } = {};

    if (typeof disabled === 'boolean') {
      data.disabledAt = disabled ? new Date() : null;
    }

    if (typeof locked === 'boolean') {
      data.lockedAt = locked ? new Date() : null;
      if (!locked) {
        data.invalid_login_attempts = 0;
      }
    }

    return data;
  };

  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Safety check 2: authoritative last-admin guard. Locking every
        // currently-active PLATFORM_ADMIN row serializes concurrent disables:
        // the loser's recount below runs after the winner commits and observes
        // the post-commit state (ReadCommitted re-read after the lock wait).
        if (disabled === true && targetUser.platformRole === 'PLATFORM_ADMIN') {
          await tx.$queryRaw`
            SELECT id FROM "User"
            WHERE "platformRole" = 'PLATFORM_ADMIN' AND "disabledAt" IS NULL
            FOR UPDATE
          `;

          const remainingAdmins = await tx.user.count({
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

        const updatedUser = await tx.user.update({
          where: { id: targetUserId },
          data: buildUpdateData(),
          select: UPDATED_USER_SELECT,
        });

        // Safety check 3: revoke persisted (database-strategy) sessions.
        if (disabled === true) {
          await tx.session.deleteMany({
            where: { userId: targetUserId },
          });
        }

        return { updatedUser, targetUser };
      });
    } catch (error: unknown) {
      // P2034 = transaction conflict / timeout. Rows are locked in this tx so
      // this only happens on infrastructure blips; retry, then surface a
      // typed conflict response.
      const code = (error as { code?: string } | null)?.code;
      if (code === 'P2034' && attempt < MAX_ATTEMPTS) {
        continue;
      }
      if (code === 'P2034') {
        throw new ApiError(409, 'Concurrent update conflict, please retry');
      }
      throw error;
    }
  }

  // Unreachable: every iteration either returns or throws.
  throw new ApiError(409, 'Concurrent update conflict, please retry');
};
