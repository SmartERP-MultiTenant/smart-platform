import fetcher from '@/lib/fetcher';
import { AdminRevenuePayload } from '@/lib/adminRevenue';
import useSWR from 'swr';
import type { ApiResponse } from 'types';

const useAdminRevenue = () => {
  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<AdminRevenuePayload>
  >('/api/admin/revenue', fetcher);

  return {
    revenue: data?.data,
    isLoading,
    isError: error,
    mutate,
  };
};

export default useAdminRevenue;
