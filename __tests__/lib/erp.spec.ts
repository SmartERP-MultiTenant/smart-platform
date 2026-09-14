import env from '@/lib/env';
import { erp, ErpApiError, buildErpLoginUrl } from '@/lib/erp';
import {
  erpMethodsResponse,
  erpPackagesResponse,
  erpVerifyResponse,
  erpWrongShapedBodies,
} from '../../tests/fixtures/erp-contract';

describe('Lib - ERP Client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('ErpApiError', () => {
    it('creates an ErpApiError with message and status', () => {
      const err = new ErpApiError('Bad Request', 400);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ErpApiError');
      expect(err.message).toBe('Bad Request');
      expect(err.status).toBe(400);
    });
  });

  describe('erp API methods', () => {
    it('getPackages calls /platform/TenantRegistration/catalog/packages and returns packages', async () => {
      const packagesData = [{ id: 'pkg-1', name: 'Starter' }];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => packagesData,
      });

      const res = await erp.getPackages();
      expect(res).toEqual(packagesData);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/platform/TenantRegistration/catalog/packages'
        ),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('checkSubdomain encodes subdomain and returns availability', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ available: true }),
      });

      const res = await erp.checkSubdomain('my company');
      expect(res).toEqual({ available: true });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/platform/TenantRegistration/check-subdomain?subdomain=my%20company'
        ),
        expect.anything()
      );
    });

    it('checkEmail encodes email and returns availability', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ available: false }),
      });

      const res = await erp.checkEmail('test+user@example.com');
      expect(res).toEqual({ available: false });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/platform/TenantRegistration/check-email?email=test%2Buser%40example.com'
        ),
        expect.anything()
      );
    });

    it('registerTenant posts registration payload', async () => {
      const regPayload = {
        companyName: 'Test Co',
        subdomain: 'test-co',
        adminEmail: 'admin@test.com',
        adminUserName: 'admin',
        adminPassword: 'Password123!',
        packageId: '1f1b3311-2477-49f1-8c5c-3abb1c3ecd4c',
        trialDays: 14,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, subdomain: 'test-co' }),
      });

      const res = await erp.registerTenant(regPayload);
      expect(res.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/platform/TenantRegistration'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(regPayload),
        })
      );
    });

    it('getMethods and createPayment and verifyPayment handle payment flows', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [
            {
              key: 'moyasar',
              label: 'Credit Card',
              provider: 'moyasar',
              available: true,
            },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            paymentUrl: 'https://moyasar.com/pay',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true, status: 'PAID' }),
        });

      const methods = await erp.getMethods();
      expect(methods).toHaveLength(1);

      const payment = await erp.createPayment({
        orderReference: 'pay-123456',
        amount: 99,
        paymentMethod: 'moyasar',
      });
      expect(payment.paymentUrl).toBe('https://moyasar.com/pay');

      const verify = await erp.verifyPayment('pay-123456');
      expect(verify.success).toBe(true);
    });

    it('login posts credentials and returns auth result', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ authToken: 'jwt-123', expiresIn: '3600' }),
      });

      const res = await erp.login('user', 'pass');
      expect(res.authToken).toBe('jwt-123');
    });

    it('subscription management methods call respective platform endpoints', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ status: 'TRIAL', daysRemaining: 10 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ modules: ['POS', 'SALES'] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [{ id: 'sub-1' }],
        });

      const sub = await erp.getTenantSubscription('token-1');
      expect(sub.status).toBe('TRIAL');

      const mods = await erp.getTenantModules('token-1');
      expect(mods).toBeDefined();

      const ext = await erp.extendSubscription(
        'super-1',
        'sub-1',
        '2026-12-31T00:00:00Z'
      );
      expect(ext).toBeDefined();

      const cancel = await erp.cancelSubscription('super-1', 'sub-1');
      expect(cancel).toBeDefined();

      const subs = await erp.listSubscriptions('super-1');
      expect(subs).toHaveLength(1);
    });

    it('M2M methods pass X-Platform-ApiKey and bearer tokens correctly', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ status: 'ACTIVE' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        });

      await erp.getTenantBillingSubscription('api-key-1', 'tenant-1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/platform/billing/subscriptions/by-tenant/tenant-1'
        ),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Platform-ApiKey': 'api-key-1',
          }),
        })
      );

      await erp.extendTenantSubscription(
        'api-key-1',
        'tenant-1',
        '2026-12-31T00:00:00Z'
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/platform/billing/subscriptions/by-tenant/tenant-1/extend'
        ),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Platform-ApiKey': 'api-key-1',
          }),
          body: JSON.stringify({ newEndDate: '2026-12-31T00:00:00Z' }),
        })
      );

      await erp.cancelTenantSubscription('api-key-1', 'tenant-1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/platform/billing/subscriptions/by-tenant/tenant-1/cancel'
        ),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Platform-ApiKey': 'api-key-1',
          }),
        })
      );
    });

    it('changeTenantPlan posts to /change-plan with X-Platform-ApiKey and default previewOnly false', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ subscriptionId: 'sub-1', applied: true }),
      });

      const result = await erp.changeTenantPlan(
        'api-key-1',
        'tenant-1',
        'pkg-2'
      );
      expect(result).toMatchObject({ subscriptionId: 'sub-1', applied: true });

      // Exact full-URL equality, never `stringContaining`. A prefix matcher
      // accepts any longer path, so a wrong tail (e.g. `/change-plans`) would
      // 404 in production while the whole suite stayed green.
      expect(global.fetch).toHaveBeenCalledWith(
        `${env.erp.apiUrl}/platform/billing/subscriptions/by-tenant/tenant-1/change-plan`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Platform-ApiKey': 'api-key-1',
          }),
          body: JSON.stringify({ packageId: 'pkg-2', previewOnly: false }),
        })
      );
    });

    it('changeTenantPlan forwards previewOnly=true for the price-diff preview', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ applied: false, priceDifference: 150 }),
      });

      const preview = await erp.changeTenantPlan(
        'api-key-1',
        'tenant-1',
        'pkg-2',
        true
      );
      expect(preview).toMatchObject({ applied: false, priceDifference: 150 });

      // Exact full URL — see the note on the default-call test above.
      expect(global.fetch).toHaveBeenCalledWith(
        `${env.erp.apiUrl}/platform/billing/subscriptions/by-tenant/tenant-1/change-plan`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Platform-ApiKey': 'api-key-1',
          }),
          body: JSON.stringify({ packageId: 'pkg-2', previewOnly: true }),
        })
      );
    });

    it('changeTenantPlan encodes the tenant id in the request path', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await erp.changeTenantPlan('api-key-1', 'tenant/../evil', 'pkg-2');

      // Exact URL: unlike `stringContaining`, this fails if the id is not
      // percent-encoded (a raw `/` and `..` would produce a different string)
      // and pins the end of the path as well.
      expect(global.fetch).toHaveBeenCalledWith(
        `${env.erp.apiUrl}/platform/billing/subscriptions/by-tenant/tenant%2F..%2Fevil/change-plan`,
        expect.anything()
      );
    });

    it('changeTenantPlan maps a 400 same-package error to ErpApiError', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Target package is already the current subscription package.',
        }),
      });

      await expect(
        erp.changeTenantPlan('api-key-1', 'tenant-1', 'pkg-1')
      ).rejects.toThrow(ErpApiError);
      await expect(
        erp.changeTenantPlan('api-key-1', 'tenant-1', 'pkg-1')
      ).rejects.toMatchObject({
        status: 400,
        message: 'Target package is already the current subscription package.',
      });
    });

    it('getTenantBillingSubscription forwards an abort signal to fetch', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ACTIVE' }),
      });

      const controller = new AbortController();
      await erp.getTenantBillingSubscription(
        'api-key-1',
        'tenant-1',
        controller.signal
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/platform/billing/subscriptions/by-tenant/tenant-1'
        ),
        expect.objectContaining({ signal: controller.signal })
      );

      // The parameter is optional: existing two-argument callers must not start
      // sending a `signal: undefined` key (`exactOptionalPropertyTypes`-unsafe
      // and meaningless to fetch).
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ACTIVE' }),
      });
      await erp.getTenantBillingSubscription('api-key-1', 'tenant-1');
      expect((global.fetch as jest.Mock).mock.calls[0][1]).not.toHaveProperty(
        'signal'
      );
    });

    it('throws ErpApiError with status and error message on HTTP failure', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Subdomain already taken.' }),
      });

      await expect(erp.checkSubdomain('taken-sub')).rejects.toThrow(
        ErpApiError
      );
      await expect(erp.checkSubdomain('taken-sub')).rejects.toMatchObject({
        status: 400,
        message: 'Subdomain already taken.',
      });
    });

    it('falls back to status message when json body cannot be parsed', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(erp.getPackages()).rejects.toMatchObject({
        status: 502,
        message: 'ERP request failed (502)',
      });
    });
  });

  describe('buildErpLoginUrl', () => {
    it('builds local URL when isLocalhost is true', () => {
      const url = buildErpLoginUrl(
        {
          success: true,
          subdomain: 'test-co',
          authToken: 'token-abc',
          expiresIn: '2026-10-01T00:00:00Z',
        },
        {
          isLocalhost: true,
          clientUrl: 'http://localhost:4200',
          loginPath: '/auth/login',
          baseDomain: 'smartapro.com',
        }
      );

      expect(url).toContain('http://localhost:4200/auth/login');
      expect(url).toContain('token=token-abc');
      expect(url).toContain('expiresIn=2026-10-01T00%3A00%3A00.000Z');
    });

    it('builds subdomain production URL when isLocalhost is false', () => {
      const url = buildErpLoginUrl(
        {
          success: true,
          subdomain: 'acme',
          authToken: 'jwt-xyz',
        },
        {
          isLocalhost: false,
          clientUrl: 'http://localhost:4200',
          loginPath: '/auth/login',
          baseDomain: 'smartapro.com',
        }
      );

      expect(url).toContain('https://acme.smartapro.com/auth/login');
      expect(url).toContain('token=jwt-xyz');
    });

    it('prefers redirectTo when provided and forces https', () => {
      const url = buildErpLoginUrl(
        {
          success: true,
          subdomain: 'acme',
          redirectTo: 'http://custom.domain.com',
        },
        {
          isLocalhost: false,
          clientUrl: 'http://localhost:4200',
          loginPath: '/auth/login',
          baseDomain: 'smartapro.com',
        }
      );

      expect(url).toBe('https://custom.domain.com/auth/login');
    });

    it('handles raw unparseable expiresIn string gracefully', () => {
      const url = buildErpLoginUrl(
        {
          success: true,
          subdomain: 'acme',
          expiresIn: 'invalid-date',
        },
        {
          isLocalhost: false,
          clientUrl: 'http://localhost:4200',
          loginPath: '/auth/login',
          baseDomain: 'smartapro.com',
        }
      );

      expect(url).toContain('expiresIn=invalid-date');
    });
  });

  /* ---------------------------------------------------------------------- *
   * PG-20 / PG-30 / P4.10b — response contracts at the ERP boundary
   *
   * These assert what the BOUNDARY does with a body, which is the layer the
   * route-level specs cannot reach: `__tests__/api/public-erp-limited-routes.spec.ts`
   * mocks `@/lib/erp` wholesale, so it proves the routes publish what they are
   * handed and nothing about what they are handed.
   * ---------------------------------------------------------------------- */

  describe('response contracts (PG-20 / PG-30 / P4.10b)', () => {
    const respondWith = (body: unknown, status = 200) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      });
    };

    const MALFORMED = {
      status: 502,
      code: 'ERP_MALFORMED_RESPONSE',
    };

    describe('getMethods — the catalogue must be honest', () => {
      it('returns only the methods the ERP marked available', async () => {
        respondWith(erpMethodsResponse);

        const methods = await erp.getMethods();

        expect(methods.map((method) => method.key)).toEqual([
          'credit_card',
          'apple_pay',
        ]);
      });

      it('drops an entry whose availability is missing rather than offering it', async () => {
        respondWith([
          { key: 'tabby', label: 'Tabby', provider: 'tabby' },
          { key: 'mada', label: 'Mada', provider: 'moyasar', available: true },
        ]);

        const methods = await erp.getMethods();

        expect(methods.map((method) => method.key)).toEqual(['mada']);
      });

      it('never marks a returned method unavailable', async () => {
        respondWith(erpMethodsResponse);

        const methods = await erp.getMethods();

        expect(methods.every((method) => method.available)).toBe(true);
      });

      it('returns an empty catalogue when the ERP offers nothing available', async () => {
        respondWith([
          {
            key: 'stc_pay',
            label: 'STC Pay',
            provider: 'hyperpay',
            available: false,
          },
        ]);

        await expect(erp.getMethods()).resolves.toEqual([]);
      });

      it.each(Object.entries(erpWrongShapedBodies))(
        'rejects the wrong-shaped 2xx body %s with ERP_MALFORMED_RESPONSE',
        async (_label, body) => {
          respondWith(body);

          await expect(erp.getMethods()).rejects.toMatchObject(MALFORMED);
        }
      );
    });

    describe('getPackages — P4.10b at its source', () => {
      it('returns the catalogue for a well-formed body', async () => {
        respondWith(erpPackagesResponse);

        const packages = await erp.getPackages();

        expect(packages.map((pkg) => pkg.id)).toEqual([
          '1f1b3311-2477-49f1-8c5c-3abb1c3ecd4c',
          '2f1b3311-2477-49f1-8c5c-3abb1c3ecd4d',
        ]);
      });

      it.each(Object.entries(erpWrongShapedBodies))(
        'rejects the wrong-shaped 2xx body %s instead of returning it for .map()',
        async (_label, body) => {
          respondWith(body);

          await expect(erp.getPackages()).rejects.toMatchObject(MALFORMED);
        }
      );

      it('accepts an empty array as a legitimately empty catalogue', async () => {
        respondWith([]);

        await expect(erp.getPackages()).resolves.toEqual([]);
      });

      it('drops an entry with no usable id or name but keeps its siblings', async () => {
        respondWith([
          { id: 'ok', name: 'Valid', priceMonthly: 100 },
          { name: 'No id' },
          null,
          { id: 'ok2', name: 'Valid 2', priceMonthly: 200 },
        ]);

        const packages = await erp.getPackages();

        expect(packages.map((pkg) => pkg.id)).toEqual(['ok', 'ok2']);
      });
    });

    describe('verifyPayment — the tri-state contract (PG-30)', () => {
      it.each(Object.entries(erpVerifyResponse))(
        'round-trips the %s payload verbatim',
        async (_label, body) => {
          respondWith(body);

          await expect(erp.verifyPayment('pay-1')).resolves.toEqual(body);
        }
      );

      it('keeps a status the kit does not recognise, without coercing or rejecting it', async () => {
        respondWith({ success: true, status: 'Authorised' });

        const result = await erp.verifyPayment('pay-1');

        // Both alternatives are worse. Coercing invents a state the ERP never
        // reported; rejecting makes the route answer 5xx, which the poller
        // reads as transient and settles optimistically — turning an unknown
        // state into a success. The consumer maps this to 'unknown' and ends on
        // the honest pending screen.
        expect(result).toEqual({ success: true, status: 'Authorised' });
      });

      it('keeps a body with no status at all (the optimistic-settle path)', async () => {
        respondWith({ success: true });

        await expect(erp.verifyPayment('pay-1')).resolves.toEqual({
          success: true,
        });
      });

      it('rejects a non-object envelope rather than reporting an empty success', async () => {
        for (const body of [null, 'Paid', 42, true, [], ['Paid']]) {
          respondWith(body);

          await expect(erp.verifyPayment('pay-1')).rejects.toMatchObject(
            MALFORMED
          );
        }
      });

      it('rejects a wrong-typed status or success', async () => {
        respondWith({ success: true, status: 7 });
        await expect(erp.verifyPayment('pay-1')).rejects.toMatchObject(
          MALFORMED
        );

        respondWith({ success: 'false' });
        await expect(erp.verifyPayment('pay-1')).rejects.toMatchObject(
          MALFORMED
        );
      });

      it('encodes the reference in the request path', async () => {
        respondWith(erpVerifyResponse.paid);

        await erp.verifyPayment('pay/1 2');

        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/payments/verify/pay%2F1%202'),
          expect.anything()
        );
      });
    });

    describe('the malformed marker is a stable token, never the upstream body', () => {
      it('carries the marker and never the body it rejected', async () => {
        respondWith({ some: 'upstream-internal-detail' });

        await expect(erp.getPackages()).rejects.toMatchObject({
          status: 502,
          code: 'ERP_MALFORMED_RESPONSE',
          message: 'ERP_MALFORMED_RESPONSE',
        });
      });
    });
  });
});
