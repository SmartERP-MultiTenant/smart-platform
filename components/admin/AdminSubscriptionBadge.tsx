import React from 'react';
import Badge from '@/components/shared/Badge';
import { AdminSubscriptionStatus } from 'models/adminDashboard';

interface AdminSubscriptionBadgeProps {
  status?: AdminSubscriptionStatus | null;
  isTrial?: boolean;
  /**
   * Whether the tenant has an ERP link at all (`Team.erpTenantId`). Required to
   * tell a genuinely unlinked tenant apart from a linked one whose ERP lookup
   * failed — both arrive here with `status === undefined`.
   */
  linked?: boolean;
  /** Whether the per-tenant ERP read succeeded. */
  reachable?: boolean;
}

const statusConfig: Record<
  AdminSubscriptionStatus,
  { label: string; color: 'success' | 'warning' | 'error' | 'ghost' | 'info' }
> = {
  active: { label: 'نشط', color: 'success' },
  trial: { label: 'تجريبي', color: 'warning' },
  expired: { label: 'منتهي', color: 'error' },
  cancelled: { label: 'ملغي', color: 'ghost' },
  unknown: { label: 'غير معروف', color: 'ghost' },
};

const AdminSubscriptionBadge = ({
  status,
  isTrial,
  linked = false,
  reachable = false,
}: AdminSubscriptionBadgeProps) => {
  if (!status) {
    // Linked but the ERP read failed: say so instead of claiming the tenant is
    // unlinked. Keeping this distinct is the whole point of the ERP-down
    // acceptance criterion (semantic text + colour, never colour alone).
    if (linked && !reachable) {
      return <Badge color="warning">تعذر جلب الحالة</Badge>;
    }

    // Linked and reachable, but the ERP has no subscription row for it.
    if (linked) {
      return <Badge color="ghost">لا يوجد اشتراك</Badge>;
    }

    return <Badge color="ghost">غير مربوط</Badge>;
  }

  const effectiveStatus = isTrial ? 'trial' : status;
  const config = statusConfig[effectiveStatus] || statusConfig.unknown;

  return <Badge color={config.color}>{config.label}</Badge>;
};

export default AdminSubscriptionBadge;
