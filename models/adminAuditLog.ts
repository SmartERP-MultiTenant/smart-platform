import { prisma } from '@/lib/prisma';
import type { PlatformAdminActor } from '@/lib/guardPlatformAdmin';

export type AdminAuditAction =
  | 'user.disable'
  | 'user.enable'
  | 'user.lock'
  | 'user.unlock'
  | 'subscription.create'
  | 'subscription.extend'
  | 'subscription.cancel'
  | 'subscription.trial_override'
  | 'package.modules_update'
  | 'package.modules_sync';

export type AdminAuditStatus = 'STARTED' | 'SUCCEEDED' | 'FAILED';

export interface AuditSnapshot {
  tenantId?: string;
  subdomain?: string;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  planName?: string;
  priceMonthly?: number;
  isTrial?: boolean;
  daysRemaining?: number;
  [key: string]: unknown;
}

/**
 * Whitelist-only sanitizer for subscription snapshots.
 * Strips any tokens, passwords, API keys, headers, or raw bodies.
 */
export function sanitizeSubscriptionSnapshot(raw: any): AuditSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;

  const sub = raw.subscription || raw;
  return {
    tenantId: typeof sub.tenantId === 'string' ? sub.tenantId : undefined,
    subdomain: typeof sub.subdomain === 'string' ? sub.subdomain : undefined,
    status: typeof sub.status === 'string' ? sub.status : undefined,
    startDate: sub.startDate ? String(sub.startDate) : undefined,
    endDate: sub.endDate ? String(sub.endDate) : undefined,
    planName:
      typeof sub.planName === 'string' ? sub.planName : sub.package?.name,
    priceMonthly:
      typeof sub.priceMonthly === 'number' ? sub.priceMonthly : undefined,
    isTrial: typeof sub.isTrial === 'boolean' ? sub.isTrial : undefined,
    daysRemaining:
      typeof sub.daysRemaining === 'number' ? sub.daysRemaining : undefined,
  };
}

export interface StartAdminAuditParams {
  actor: PlatformAdminActor;
  action: AdminAuditAction;
  targetType: 'tenant' | 'subscription' | 'user' | 'package';
  targetId: string;
  before?: AuditSnapshot | Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export async function createAdminAuditStart({
  actor,
  action,
  targetType,
  targetId,
  before,
  metadata = {},
}: StartAdminAuditParams): Promise<string | null> {
  try {
    if ((prisma as any).adminAuditLog?.create) {
      const log = await (prisma as any).adminAuditLog.create({
        data: {
          actorId: actor.id,
          actorEmail: actor.email,
          actorName: actor.name,
          action,
          targetType,
          targetId,
          status: 'STARTED',
          before: before ? JSON.parse(JSON.stringify(before)) : null,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
        },
      });
      return log.id;
    }

    console.info(
      `[ADMIN_AUDIT:STARTED] actor=${actor.email} action=${action} target=${targetType}:${targetId}`,
      { before, metadata }
    );
    return null;
  } catch (err) {
    console.error('[ADMIN_AUDIT_ERROR] Failed to start audit entry:', err);
    return null;
  }
}

export interface CompleteAdminAuditParams {
  logId: string | null;
  actor: PlatformAdminActor;
  action: AdminAuditAction;
  targetType: 'tenant' | 'subscription' | 'user' | 'package';
  targetId: string;
  before?: AuditSnapshot | Record<string, unknown> | null;
  after?: AuditSnapshot | Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export async function completeAdminAudit({
  logId,
  actor,
  action,
  targetType,
  targetId,
  before,
  after,
  metadata = {},
}: CompleteAdminAuditParams): Promise<void> {
  try {
    if (logId && (prisma as any).adminAuditLog?.update) {
      await (prisma as any).adminAuditLog.update({
        where: { id: logId },
        data: {
          status: 'SUCCEEDED',
          after: after ? JSON.parse(JSON.stringify(after)) : null,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
        },
      });
      return;
    }

    if ((prisma as any).adminAuditLog?.create) {
      await (prisma as any).adminAuditLog.create({
        data: {
          actorId: actor.id,
          actorEmail: actor.email,
          actorName: actor.name,
          action,
          targetType,
          targetId,
          status: 'SUCCEEDED',
          before: before ? JSON.parse(JSON.stringify(before)) : null,
          after: after ? JSON.parse(JSON.stringify(after)) : null,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
        },
      });
      return;
    }

    console.info(
      `[ADMIN_AUDIT:SUCCEEDED] actor=${actor.email} action=${action} target=${targetType}:${targetId}`,
      { after, metadata }
    );
  } catch (err) {
    console.error('[ADMIN_AUDIT_ERROR] Failed to complete audit entry:', err);
  }
}

export interface FailAdminAuditParams {
  logId: string | null;
  actor: PlatformAdminActor;
  action: AdminAuditAction;
  targetType: 'tenant' | 'subscription' | 'user' | 'package';
  targetId: string;
  errorCode: string;
  before?: AuditSnapshot | Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export async function failAdminAudit({
  logId,
  actor,
  action,
  targetType,
  targetId,
  errorCode,
  before,
  metadata = {},
}: FailAdminAuditParams): Promise<void> {
  try {
    if (logId && (prisma as any).adminAuditLog?.update) {
      await (prisma as any).adminAuditLog.update({
        where: { id: logId },
        data: {
          status: 'FAILED',
          errorCode,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
        },
      });
      return;
    }

    if ((prisma as any).adminAuditLog?.create) {
      await (prisma as any).adminAuditLog.create({
        data: {
          actorId: actor.id,
          actorEmail: actor.email,
          actorName: actor.name,
          action,
          targetType,
          targetId,
          status: 'FAILED',
          errorCode,
          before: before ? JSON.parse(JSON.stringify(before)) : null,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
        },
      });
      return;
    }

    console.warn(
      `[ADMIN_AUDIT:FAILED] actor=${actor.email} action=${action} target=${targetType}:${targetId} error=${errorCode}`,
      metadata
    );
  } catch (err) {
    console.error('[ADMIN_AUDIT_ERROR] Failed to fail audit entry:', err);
  }
}

export interface GetAdminAuditLogsOptions {
  page?: number;
  limit?: number;
  targetType?: string;
  targetId?: string;
  action?: string;
}

export async function getAdminAuditLogs({
  page = 1,
  limit = 20,
  targetType,
  targetId,
  action,
}: GetAdminAuditLogsOptions = {}) {
  try {
    if ((prisma as any).adminAuditLog?.findMany) {
      const skip = (page - 1) * limit;
      const where: any = {};

      if (targetType) where.targetType = targetType;
      if (targetId) where.targetId = targetId;
      if (action) where.action = action;

      const [items, total] = await Promise.all([
        (prisma as any).adminAuditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        (prisma as any).adminAuditLog.count({ where }),
      ]);

      return {
        items,
        total,
        page,
        limit,
        hasMore: skip + items.length < total,
      };
    }

    return {
      items: [],
      total: 0,
      page,
      limit,
      hasMore: false,
    };
  } catch (err) {
    console.error('[ADMIN_AUDIT_ERROR] Failed to fetch audit logs:', err);
    return {
      items: [],
      total: 0,
      page,
      limit,
      hasMore: false,
    };
  }
}
