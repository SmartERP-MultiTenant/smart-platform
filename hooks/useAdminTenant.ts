import { ApiError } from '@/lib/errors';
import { AdminTenantRecord } from 'models/adminDashboard';
import useSWR from 'swr';
import type { ApiResponse } from 'types';

/**
 * Tenant-scoped fetcher. The shared `lib/fetcher.ts` collapses every failure
 * into a bare `Error`, which would make a nonexistent team id (404)
 * indistinguishable from a real outage. Throwing an `ApiError` keeps the HTTP
 * status available to the page so it can render a dedicated not-found state.
 */
const tenantFetcher = async (url: string) => {
  const response = await fetch(url);

  let json: any = {};
  try {
    json = await response.json();
  } catch {
    json = {};
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      json?.error?.message || 'An error occurred while fetching the data'
    );
  }

  return json;
};

/**
 * P5.3 tenant drill-down. Reads the guarded `/api/admin/tenants/[teamId]`
 * route, which resolves the ERP id server-side from the platform `Team.id`.
 * Passing `null` as the key keeps SWR idle until a teamId is known.
 *
 * `isNotFound` separates "this team does not exist" (API 404 — a bad link)
 * from "something broke" (any other failure), so the page can say so.
 */
const useAdminTenant = (teamId?: string) => {
  const { data, error, isLoading } = useSWR<ApiResponse<AdminTenantRecord>>(
    teamId ? `/api/admin/tenants/${teamId}` : null,
    tenantFetcher
  );

  return {
    tenant: data?.data,
    isLoading,
    error,
    isNotFound: error instanceof ApiError && error.status === 404,
  };
};

export default useAdminTenant;
