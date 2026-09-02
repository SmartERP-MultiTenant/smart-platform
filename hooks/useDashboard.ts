import fetcher from '@/lib/fetcher';
import { DashboardPayload } from '@/lib/dashboard';
import useSWR from 'swr';
import type { ApiResponse } from 'types';

const useDashboard = (slug?: string) => {
  const url = slug ? `/api/teams/${slug}/dashboard` : null;

  const { data, error, isLoading } = useSWR<ApiResponse<DashboardPayload>>(
    url,
    fetcher
  );

  return {
    data,
    isLoading,
    error,
  };
};

export default useDashboard;
