import fetcher from '@/lib/fetcher';
import { AdminTenantRecord } from 'models/adminDashboard';
import useSWR from 'swr';
import type { ApiResponse } from 'types';

/**
 * P5.3 tenant drill-down. Reads the guarded `/api/admin/tenants/[teamId]`
 * route, which resolves the ERP id server-side from the platform `Team.id`.
 * Passing `null` as the key keeps SWR idle until a teamId is known.
 */
const useAdminTenant = (teamId?: string) => {
  const { data, error, isLoading } = useSWR<ApiResponse<AdminTenantRecord>>(
    teamId ? `/api/admin/tenants/${teamId}` : null,
    fetcher
  );

  return {
    tenant: data?.data,
    isLoading,
    error,
  };
};

export default useAdminTenant;
