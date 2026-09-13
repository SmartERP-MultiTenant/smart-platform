import { createDegradedRulesPayload } from '@/lib/adminRules';
import { erp } from '@/lib/erp';

describe('adminRules library & M2M ERP rules methods', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('createDegradedRulesPayload', () => {
    it('creates an error payload with empty arrays and ok=false', () => {
      const errorMsg = 'ERP unreachable';
      const payload = createDegradedRulesPayload(errorMsg);

      expect(payload.ok).toBe(false);
      expect(payload.packages).toEqual([]);
      expect(payload.systemModules).toEqual([]);
      expect(payload.error).toBe(errorMsg);
    });
  });

  describe('erp M2M methods for rules (P5.6)', () => {
    const mockApiKey = 'test-m2m-key-12345';

    it('getSystemModulesM2M sends X-Platform-ApiKey and returns modules', async () => {
      const mockModules = [
        {
          id: 'mod-1',
          code: 'ACCOUNTING',
          name: 'المحاسبة',
          isActive: true,
        },
      ];

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockModules,
      } as Response);

      const res = await erp.getSystemModulesM2M(mockApiKey);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/platform/billing/system-modules'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Platform-ApiKey': mockApiKey,
          }),
        })
      );
      expect(res).toEqual(mockModules);
    });

    it('getPackagesM2M sends X-Platform-ApiKey and returns packages with modules', async () => {
      const mockPackages = [
        {
          id: 'pkg-1',
          name: 'Starter',
          systemModules: [
            { id: 'mod-1', code: 'ACCOUNTING', name: 'المحاسبة' },
          ],
          systemModuleCodes: ['ACCOUNTING'],
        },
      ];

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockPackages,
      } as Response);

      const res = await erp.getPackagesM2M(mockApiKey);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/platform/billing/packages'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Platform-ApiKey': mockApiKey,
          }),
        })
      );
      expect(res).toEqual(mockPackages);
    });

    it('updatePackageModulesM2M sends PUT request with systemModuleIds and sync flag', async () => {
      const mockUpdatedPackage = {
        id: 'pkg-1',
        name: 'Starter',
        systemModules: [{ id: 'mod-1', code: 'ACCOUNTING', name: 'المحاسبة' }],
      };

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockUpdatedPackage,
      } as Response);

      const res = await erp.updatePackageModulesM2M(
        mockApiKey,
        'pkg-1',
        ['mod-1'],
        true
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/platform/billing/packages/pkg-1/modules'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'X-Platform-ApiKey': mockApiKey,
          }),
          body: JSON.stringify({
            systemModuleIds: ['mod-1'],
            syncExistingSubscriptions: true,
          }),
        })
      );
      expect(res).toEqual(mockUpdatedPackage);
    });

    it('syncSubscriptionsModulesM2M sends POST request with optional packageId', async () => {
      const mockResult = { message: 'Synced 5 subscriptions' };

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      } as Response);

      const res = await erp.syncSubscriptionsModulesM2M(mockApiKey, 'pkg-1');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/platform/billing/subscriptions/sync-modules'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Platform-ApiKey': mockApiKey,
          }),
          body: JSON.stringify({ packageId: 'pkg-1' }),
        })
      );
      expect(res).toEqual(mockResult);
    });
  });
});
