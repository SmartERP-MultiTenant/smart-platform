/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import useAdminDashboard, {
  buildAdminDashboardUrl,
} from 'hooks/useAdminDashboard';

describe('useAdminDashboard', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('buildAdminDashboardUrl', () => {
    it('always spells out page and pageSize (default 25)', () => {
      expect(buildAdminDashboardUrl()).toBe(
        '/api/admin/dashboard?page=1&pageSize=25'
      );
      expect(buildAdminDashboardUrl({ page: 3, pageSize: 10 })).toBe(
        '/api/admin/dashboard?page=3&pageSize=10'
      );
    });

    it('omits empty search and the default status filter', () => {
      expect(
        buildAdminDashboardUrl({ page: 1, search: '   ', status: 'all' })
      ).toBe('/api/admin/dashboard?page=1&pageSize=25');

      expect(
        buildAdminDashboardUrl({
          page: 2,
          pageSize: 50,
          search: '  acme  ',
          status: 'trial',
        })
      ).toBe(
        '/api/admin/dashboard?page=2&pageSize=50&search=acme&status=trial'
      );
    });

    it('never emits a page below 1', () => {
      expect(buildAdminDashboardUrl({ page: 0 })).toBe(
        '/api/admin/dashboard?page=1&pageSize=25'
      );
    });
  });

  it('makes NO request while disabled (F-D: the forbidden state)', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    renderHook(() => useAdminDashboard({ page: 1 }, { enabled: false }));

    // Give SWR a few ticks to (not) fire.
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests the page/filter URL when enabled', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { tenants: { items: [], total: 0 } } }),
    });
    global.fetch = fetchMock as any;

    const { result } = renderHook(() =>
      useAdminDashboard(
        // A unique search keeps this test on its own SWR cache key.
        { page: 2, pageSize: 10, search: 'e2e-hook-enabled', status: 'trial' },
        { enabled: true }
      )
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/dashboard?page=2&pageSize=10&search=e2e-hook-enabled&status=trial'
      )
    );

    await waitFor(() =>
      expect(result.current.dashboard).toEqual({
        tenants: { items: [], total: 0 },
      })
    );
  });

  it('defaults to enabled so existing callers keep working', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    });
    global.fetch = fetchMock as any;

    renderHook(() => useAdminDashboard({ search: 'e2e-hook-default-enabled' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  describe('isPaging (the pager-disabled signal)', () => {
    /** Minimal payload that echoes the page it was built for. */
    const pageResponse = (page: number) => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          tenants: { items: [], page, pageSize: 25, total: 60, totalPages: 3 },
        },
      }),
    });

    it("flags only the operator's own unanswered page change", async () => {
      let resolvePageTwo: ((value: unknown) => void) | undefined;

      const fetchMock = jest.fn((url: string) =>
        url.includes('page=2')
          ? new Promise((resolve) => {
              resolvePageTwo = resolve;
            })
          : Promise.resolve(pageResponse(1))
      );
      global.fetch = fetchMock as any;

      const { result, rerender } = renderHook(
        ({ page }: { page: number }) =>
          useAdminDashboard({
            page,
            pageSize: 25,
            search: 'e2e-hook-ispaging',
          }),
        { initialProps: { page: 1 } }
      );

      await waitFor(() => expect(result.current.dashboard).toBeDefined());
      // The payload came back for the page that was asked for.
      expect(result.current.isPaging).toBe(false);

      rerender({ page: 2 });

      // The page-2 answer is still outstanding: `keepPreviousData` keeps the
      // page-1 payload rendered, and that mismatch IS the signal (this is the
      // window in which the old `isLoading || isValidating` expression kept
      // disabling the buttons for far longer).
      await waitFor(() => expect(result.current.isPaging).toBe(true));
      expect(result.current.dashboard?.tenants.page).toBe(1);

      act(() => resolvePageTwo?.(pageResponse(2)));

      await waitFor(() =>
        expect(result.current.dashboard?.tenants.page).toBe(2)
      );
      expect(result.current.isPaging).toBe(false);
    });

    it('stays false while SWR revalidates the SAME page (background refresh)', async () => {
      let resolveRefresh: ((value: unknown) => void) | undefined;
      let calls = 0;

      const fetchMock = jest.fn(async () => {
        calls += 1;

        return calls === 1
          ? pageResponse(1)
          : new Promise((resolve) => {
              resolveRefresh = resolve;
            });
      });
      global.fetch = fetchMock as any;

      const { result } = renderHook(() =>
        useAdminDashboard({ page: 1, search: 'e2e-hook-isvalidating' })
      );

      await waitFor(() => expect(result.current.dashboard).toBeDefined());
      expect(result.current.isPaging).toBe(false);

      // This is what `refreshInterval` / `revalidateOnFocus` do: a re-fetch of
      // the key already on screen. `isValidating` is true and the pager must
      // stay usable regardless — a disabled button drops the click event, so
      // gating on `isValidating` silently swallows paging actions.
      act(() => {
        result.current.mutate();
      });

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(result.current.isValidating).toBe(true);
      expect(result.current.isPaging).toBe(false);

      act(() => resolveRefresh?.(pageResponse(1)));

      await waitFor(() => expect(result.current.isValidating).toBe(false));
      expect(result.current.isPaging).toBe(false);
    });
  });
});
