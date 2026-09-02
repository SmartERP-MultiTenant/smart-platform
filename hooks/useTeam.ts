import fetcher from '@/lib/fetcher';
import type { TeamClientSafe } from '@/lib/teamSafe';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import type { ApiResponse } from 'types';

const useTeam = (slug?: string) => {
  const { query, isReady } = useRouter();

  const teamSlug = slug || (isReady ? query.slug : null);

  const { data, error, isLoading } = useSWR<ApiResponse<TeamClientSafe>>(
    teamSlug ? `/api/teams/${teamSlug}` : null,
    fetcher
  );

  return {
    isLoading,
    isError: error,
    team: data?.data,
  };
};

export default useTeam;
