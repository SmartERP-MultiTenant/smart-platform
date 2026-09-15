import fetcher from '@/lib/fetcher';
import {
  ADMIN_DASHBOARD_DEFAULT_PAGE_SIZE,
  AdminDashboardPayload,
  AdminTenantStatusFilter,
} from 'models/adminDashboard';
import useSWR from 'swr';
import type { ApiResponse } from 'types';

/**
 * Server-side query parameters for the paginated dashboard.
 *
 * Not exported: the public contract is the signatures of `buildAdminDashboardUrl`
 * and `useAdminDashboard`, which already type these parameters, and no module
 * imports this shape (P4.21 export sweep).
 */
interface AdminDashboardParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: AdminTenantStatusFilter;
}

interface UseAdminDashboardOptions {
  /**
   * When false the SWR key is `null`, so NO request is made.
   *
   * Exists for `pages/admin.tsx`: the hook is called before the `forbidden`
   * early-return (hooks cannot be conditional), so without this a signed-in
   * non-admin would still fire a guaranteed-403 `GET /api/admin/dashboard`.
   */
  enabled?: boolean;
}

/**
 * Builds the dashboard URL. Parameters are always spelled out (in the contract's
 * order) so the SWR key is stable and per-page / per-filter cacheable.
 */
export const buildAdminDashboardUrl = (
  params: AdminDashboardParams = {}
): string => {
  const searchParams = new URLSearchParams();

  searchParams.set(
    'page',
    String(params.page && params.page > 0 ? params.page : 1)
  );
  searchParams.set(
    'pageSize',
    String(params.pageSize ?? ADMIN_DASHBOARD_DEFAULT_PAGE_SIZE)
  );

  const search = params.search?.trim();
  if (search) {
    searchParams.set('search', search);
  }

  if (params.status && params.status !== 'all') {
    searchParams.set('status', params.status);
  }

  return `/api/admin/dashboard?${searchParams.toString()}`;
};

/**
 * Live dashboard data for the platform-admin console.
 *
 * `keepPreviousData` keeps the current page rendered while the next page /
 * filter result loads, so paginating never blanks the table (a full sweep can
 * take seconds); `isPaging` (NOT `isValidating`) is what disables the pager
 * during that window — see its documentation below.
 */
const useAdminDashboard = (
  params: AdminDashboardParams = {},
  options: UseAdminDashboardOptions = {}
) => {
  const enabled = options.enabled ?? true;
  const key = enabled ? buildAdminDashboardUrl(params) : null;
  // Mirrors `buildAdminDashboardUrl`'s own normalisation, so the requested page
  // below is always the one that ends up in the query string.
  const requestedPage = params.page && params.page > 0 ? params.page : 1;

  const { data, error, isLoading, isValidating, mutate } = useSWR<
    ApiResponse<AdminDashboardPayload>
  >(key, fetcher, {
    refreshInterval: 30000, // Refresh every 30 seconds for live monitoring
    revalidateOnFocus: true,
    // One dashboard sweep costs a full-team scan + one ERP read per linked
    // tenant (bounded concurrency, 3s per row) — see
    // `getAdminDashboardSweep`. Matching the dedupe window to the refresh
    // interval collapses overlapping refreshes (slow sweep + focus revalidate
    // + manual mutate) into a single request instead of stacking sweeps. The
    // server additionally reuses a completed sweep for
    // `ADMIN_DASHBOARD_SWEEP_TTL_MS`, so paginating through pages does not
    // re-sweep the ERP.
    dedupingInterval: 30000,
    keepPreviousData: true,
  });

  const dashboard = data?.data;

  // The payload echoes the page it was built for (`tenants.page`), so a
  // mismatch means "the page the operator asked for has not been answered yet"
  // — `keepPreviousData` is still rendering the previous page in exactly that
  // window.
  //
  // Deliberately NOT derived from `isValidating`: every background refresh
  // (`refreshInterval: 30000`, `revalidateOnFocus`) re-fetches the SAME page
  // and would therefore flag it too. A pager disabled for the whole of every
  // background revalidation is both wrong UX and a race — the browser drops
  // the click event of a button that is disabled at dispatch time, so the
  // operator's paging action can be silently swallowed. Comparing the echoed
  // page only ever flags the operator's own page change.
  const echoedPage = dashboard?.tenants?.page;
  const isPaging =
    typeof echoedPage === 'number' && echoedPage !== requestedPage;

  return {
    dashboard,
    isLoading,
    isPaging,
    isValidating,
    error,
    mutate,
  };
};

export default useAdminDashboard;
