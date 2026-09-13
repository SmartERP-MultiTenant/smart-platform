import useSWR from 'swr';
import useAdminTenant from 'hooks/useAdminTenant';
import { ApiError } from 'lib/errors';

jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const useSWRMock = useSWR as unknown as jest.Mock;

describe('useAdminTenant', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('flags isNotFound only for a 404 answer', () => {
    useSWRMock.mockReturnValue({
      data: undefined,
      error: new ApiError(404, 'Team not found'),
      isLoading: false,
    });
    expect(useAdminTenant('missing-team').isNotFound).toBe(true);

    // Any other failure is an outage, not a missing team.
    useSWRMock.mockReturnValue({
      data: undefined,
      error: new ApiError(500, 'internal-error'),
      isLoading: false,
    });
    expect(useAdminTenant('boom').isNotFound).toBe(false);

    useSWRMock.mockReturnValue({
      data: undefined,
      error: new Error('Network error'),
      isLoading: false,
    });
    expect(useAdminTenant('offline').isNotFound).toBe(false);

    useSWRMock.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
    });
    expect(useAdminTenant('loading').isNotFound).toBe(false);

    // No teamId keeps SWR idle (null key).
    useAdminTenant(undefined);
    expect(useSWRMock).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it('throws an ApiError carrying the HTTP status so 404 is distinguishable', async () => {
    useSWRMock.mockReturnValue({ data: undefined, error: undefined });
    useAdminTenant('missing-team');

    const tenantFetcher = useSWRMock.mock.calls[0][1] as (
      url: string
    ) => Promise<unknown>;

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Team not found' } }),
    }) as any;

    await expect(
      tenantFetcher('/api/admin/tenants/missing-team')
    ).rejects.toMatchObject({ status: 404, message: 'Team not found' });
    await expect(
      tenantFetcher('/api/admin/tenants/missing-team')
    ).rejects.toBeInstanceOf(ApiError);

    // A body-less failure must still produce a status-carrying error.
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    }) as any;

    await expect(
      tenantFetcher('/api/admin/tenants/boom')
    ).rejects.toMatchObject({ status: 500 });
  });

  it('returns the payload untouched when the request succeeds', async () => {
    useSWRMock.mockReturnValue({ data: undefined, error: undefined });
    useAdminTenant('team-1');

    const tenantFetcher = useSWRMock.mock.calls[0][1] as (
      url: string
    ) => Promise<unknown>;

    const payload = { data: { id: 'team-1', name: 'Acme Corp' } };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    }) as any;

    await expect(tenantFetcher('/api/admin/tenants/team-1')).resolves.toEqual(
      payload
    );
  });
});
