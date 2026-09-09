import { PlatformAdminActor } from './guardPlatformAdmin';
import { prisma } from './prisma';

export type AdminAuditAction =
  | 'user.disable'
  | 'user.enable'
  | 'user.lock'
  | 'user.unlock';

export type AdminAuditStatus = 'STARTED' | 'SUCCEEDED' | 'FAILED';

export interface AdminAuditParams {
  actor: PlatformAdminActor;
  action: AdminAuditAction;
  targetUserId: string;
  targetUserEmail?: string;
  status: AdminAuditStatus;
  details?: Record<string, any>;
}

/**
 * Platform Admin Audit Logging Seam (P5.4 compatible).
 *
 * Logs platform administration mutations with actor identity, target, and status.
 * The AdminAuditLog Prisma model is a deliberate P5.4 follow-up: until that
 * migration lands, every event is emitted as a structured `[ADMIN_AUDIT]`
 * console line. Audit logging must never crash the caller's transaction.
 */
export async function recordAdminAudit({
  actor,
  action,
  targetUserId,
  targetUserEmail,
  status,
  details = {},
}: AdminAuditParams): Promise<void> {
  try {
    // If the P5.4 AdminAuditLog model exists in prisma client at runtime
    if ((prisma as any).adminAuditLog?.create) {
      await (prisma as any).adminAuditLog.create({
        data: {
          actorId: actor.id,
          actorEmail: actor.email,
          action,
          targetUserId,
          targetUserEmail,
          status,
          details: JSON.stringify(details),
        },
      });
      return;
    }

    // Seam fallback: structured log output for platform operator audit trail
    console.info(
      `[ADMIN_AUDIT] actor=${actor.email} (${actor.id}) action=${action} target=${targetUserId} status=${status}`,
      details
    );
  } catch (err) {
    // Audit log errors should never crash the main transaction, but must be logged
    console.error(
      '[ADMIN_AUDIT_ERROR] Failed to record admin audit event:',
      err
    );
  }
}
