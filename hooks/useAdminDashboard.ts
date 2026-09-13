import fetcher from '@/lib/fetcher';
import { AdminDashboardPayload } from 'models/adminDashboard';
import useSWR from 'swr';
import type { ApiResponse } from 'types';

const useAdminDashboard = () => {
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<AdminDashboardPayload>
  >('/api/admin/dashboard', fetcher, {
    refreshInterval: 30000, // Refresh every 30 seconds for live monitoring
    revalidateOnFocus: true,
    // One dashboard sweep costs a full-team scan + one ERP read per linked
    // tenant (bounded concurrency, 3s per row) — see
    // `getAdminDashboardData`. Matching the dedupe window to the refresh
    // interval collapses overlapping refreshes (slow sweep + focus revalidate
    // + manual mutate) into a single request instead of stacking sweeps.
    dedupingInterval: 30000,
  });

  return {
    dashboard: data?.data,
    isLoading,
    error,
    mutate,
  };
};

export default useAdminDashboard;
