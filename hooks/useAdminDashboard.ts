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
  });

  return {
    dashboard: data?.data,
    isLoading,
    error,
    mutate,
  };
};

export default useAdminDashboard;
