import fetcher from '@/lib/fetcher';
import useSWR from 'swr';
import type { ApiResponse } from 'types';

/** Team membership row as returned by GET /api/admin/users. */
interface AdminUserTeamMembership {
  id: string;
  role: string;
  team: {
    id: string;
    name: string;
    slug: string;
  };
}

/**
 * Platform user row returned by GET /api/admin/users (P5.5).
 *
 * The API never selects `password` or other credential material — see
 * pages/api/admin/users/index.ts.
 */
export interface AdminUserListItem {
  id: string;
  name: string | null;
  email: string;
  emailVerified: string | null;
  image: string | null;
  createdAt: string;
  updatedAt: string;
  invalid_login_attempts: number;
  lockedAt: string | null;
  disabledAt: string | null;
  platformRole: 'PLATFORM_ADMIN' | null;
  teamMembers: AdminUserTeamMembership[];
}

interface AdminUsersPayload {
  items: AdminUserListItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export const ADMIN_USERS_PAGE_SIZE = 10;

const buildUsersUrl = (search: string, page: number, limit: number) => {
  const params = new URLSearchParams();

  if (search.trim()) {
    params.set('search', search.trim());
  }

  params.set('page', String(page));
  params.set('limit', String(limit));

  return `/api/admin/users?${params.toString()}`;
};

const useAdminUsers = (search: string, page: number) => {
  const key = buildUsersUrl(search, page, ADMIN_USERS_PAGE_SIZE);

  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<AdminUsersPayload>
  >(key, fetcher);

  return {
    users: data?.data,
    isLoading,
    isError: error,
    mutate,
  };
};

export default useAdminUsers;
