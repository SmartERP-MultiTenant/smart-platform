import fetcher from '@/lib/fetcher';
import type { TeamClientSafeWithCount } from '@/lib/teamSafe';
import useSWR, { mutate } from 'swr';
import type { ApiResponse } from 'types';

const useTeams = () => {
  const url = `/api/teams`;

  const { data, error, isLoading } = useSWR<
    ApiResponse<TeamClientSafeWithCount[]>
  >(url, fetcher);

  const mutateTeams = async () => {
    mutate(url);
  };

  return {
    isLoading,
    isError: error,
    teams: data?.data,
    mutateTeams,
  };
};

export default useTeams;
