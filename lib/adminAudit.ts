import { PlatformAdminActor } from './guardPlatformAdmin';
import {
  AdminAuditAction,
  AdminAuditStatus,
  createAdminAuditStart,
  completeAdminAudit,
  failAdminAudit,
  sanitizeSubscriptionSnapshot,
  type AuditSnapshot,
} from 'models/adminAuditLog';

export type { AdminAuditAction, AdminAuditStatus, AuditSnapshot };
export { sanitizeSubscriptionSnapshot };

export interface AdminAuditParams {
  actor: PlatformAdminActor;
  action: AdminAuditAction;
  targetUserId?: string;
  targetUserEmail?: string;
  targetType?: 'tenant' | 'subscription' | 'user' | 'package';
  targetId?: string;
  status: AdminAuditStatus;
  before?: AuditSnapshot | Record<string, unknown> | null;
  after?: AuditSnapshot | Record<string, unknown> | null;
  details?: Record<string, any>;
  errorCode?: string;
}

/**
 * Platform Admin Audit Logging Seam (P5.4 compatible).
 * Logs platform administration mutations with actor identity, target, and status.
 */
export async function recordAdminAudit({
  actor,
  action,
  targetUserId,
  targetType = 'user',
  targetId = targetUserId || '',
  status,
  before,
  after,
  details = {},
  errorCode,
}: AdminAuditParams): Promise<void> {
  try {
    if (status === 'STARTED') {
      await createAdminAuditStart({
        actor,
        action,
        targetType,
        targetId,
        before,
        metadata: details,
      });
    } else if (status === 'SUCCEEDED') {
      await completeAdminAudit({
        logId: null,
        actor,
        action,
        targetType,
        targetId,
        before,
        after,
        metadata: details,
      });
    } else {
      await failAdminAudit({
        logId: null,
        actor,
        action,
        targetType,
        targetId,
        errorCode: errorCode || 'UNKNOWN_ERROR',
        before,
        metadata: details,
      });
    }
  } catch (err) {
    console.error(
      '[ADMIN_AUDIT_ERROR] Failed to record admin audit event:',
      err
    );
  }
}
