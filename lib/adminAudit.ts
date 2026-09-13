import { PlatformAdminActor } from './guardPlatformAdmin';
import {
  AdminAuditAction,
  AdminAuditStatus,
  AdminAuditTargetType,
  createAdminAuditStart,
  completeAdminAudit,
  failAdminAudit,
  sanitizeSubscriptionSnapshot,
  type AuditSnapshot,
} from 'models/adminAuditLog';

export type {
  AdminAuditAction,
  AdminAuditStatus,
  AdminAuditTargetType,
  AuditSnapshot,
};
export { sanitizeSubscriptionSnapshot };

export interface AdminAuditParams {
  actor: PlatformAdminActor;
  action: AdminAuditAction;
  targetUserId?: string;
  targetUserEmail?: string;
  targetType?: AdminAuditTargetType;
  targetId?: string;
  status: AdminAuditStatus;
  /**
   * Row id returned by the matching `status: 'STARTED'` call. Required to make
   * the terminal event resolve on the SAME row; omit it only for callers that
   * log a standalone terminal event (no `STARTED` was written).
   */
  logId?: string | null;
  before?: AuditSnapshot | Record<string, unknown> | null;
  after?: AuditSnapshot | Record<string, unknown> | null;
  details?: Record<string, unknown>;
  errorCode?: string;
}

/**
 * Platform Admin Audit Logging Seam.
 *
 * Two-phase usage (preferred — one row per operation):
 *
 *   const logId = await recordAdminAudit({ actor, action, status: 'STARTED', … });
 *   // … perform the mutation …
 *   await recordAdminAudit({ actor, action, status: 'SUCCEEDED', logId, … });
 *
 * Single-phase usage (standalone `SUCCEEDED`/`FAILED`, no preceding `STARTED`)
 * creates a terminal row and returns its id.
 *
 * Returns the affected audit row id (or `null` when the audit store rejected
 * the write). Audit logging must never crash the caller's mutation.
 */
export async function recordAdminAudit({
  actor,
  action,
  targetUserId,
  targetUserEmail,
  targetType = 'user',
  targetId = targetUserId || '',
  status,
  logId = null,
  before,
  after,
  details = {},
  errorCode,
}: AdminAuditParams): Promise<string | null> {
  // `targetUserEmail` used to be accepted and silently dropped by every write
  // path, losing the actor's identity context for user-targeted actions. Fold
  // it into the persisted metadata so no caller loses data.
  const metadata: Record<string, unknown> = { ...details };

  if (targetUserEmail && metadata.targetUserEmail === undefined) {
    metadata.targetUserEmail = targetUserEmail;
  }
  if (targetUserId && metadata.targetUserId === undefined) {
    metadata.targetUserId = targetUserId;
  }

  try {
    if (status === 'STARTED') {
      return await createAdminAuditStart({
        actor,
        action,
        targetType,
        targetId,
        before,
        metadata,
      });
    }

    if (status === 'SUCCEEDED') {
      return await completeAdminAudit({
        logId,
        actor,
        action,
        targetType,
        targetId,
        before,
        after,
        metadata,
      });
    }

    return await failAdminAudit({
      logId,
      actor,
      action,
      targetType,
      targetId,
      errorCode: errorCode || 'UNKNOWN_ERROR',
      before,
      metadata,
    });
  } catch (err) {
    console.error(
      '[ADMIN_AUDIT_ERROR] Failed to record admin audit event:',
      err
    );
    return logId ?? null;
  }
}
