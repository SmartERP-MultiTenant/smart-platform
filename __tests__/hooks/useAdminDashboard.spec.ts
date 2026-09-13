/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';
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
});
