import useSWR from 'swr';
import fetcher from '@/lib/fetcher';
import type { ApiResponse } from 'types';

interface AdminAuditLogItem {
  id: string;
  actorId?: string | null;
  actorEmail: string;
  actorName?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED';
  before?: any;
  after?: any;
  metadata?: any;
  errorCode?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditLogsResult {
  items: AdminAuditLogItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export default function useAdminAuditLogs(
  page: number = 1,
  limit: number = 20,
  action?: string,
  targetType?: string
) {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (action) query.set('action', action);
  if (targetType) query.set('targetType', targetType);

  const { data, error, mutate, isLoading } = useSWR<
    ApiResponse<AdminAuditLogsResult>
  >(`/api/admin/audit-logs?${query.toString()}`, fetcher);

  return {
    logs: data?.data,
    isLoading,
    isError: Boolean(error),
    mutate,
  };
}
