import { ErpApiError } from '@/lib/erp';
import {
  resolvePayableOrder,
  toPayableOrder,
} from '@/lib/payments/payablePackage';
import { verifyOrderIntent, signOrderIntent } from '@/lib/payments/orderIntent';
import type { ErpBillingCycle, ErpPackageContract } from '@/lib/zod/erp';

/**
 * PG-06 — resolving what a payment is for.
 *
 * `toPayableOrder` is the decision table that stands between a package id and a
 * charge, so every branch of "this must not become payable" is asserted
 * individually rather than inferred from a happy path.
 */

const PACKAGE_ID = '1f1b3311-2477-49f1-8c5c-3abb1c3ecd4c';

const pkg = (patch: Partial<ErpPackageContract> = {}): ErpPackageContract => ({
  id: PACKAGE_ID,
  name: 'Starter',
  priceMonthly: 199,
  priceYearly: 1990,
  ...patch,
});

describe('Lib - payments/payablePackage (PG-06)', () => {
  describe('toPayableOrder', () => {
    it('prices the package from the catalogue for monthly billing', () => {
      // Two arguments: monthly is the default cycle.
      const result = toPayableOrder([pkg()], PACKAGE_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.order.amount).toBe(199);
      expect(result.order.currency).toBe('SAR');
      expect(result.order.packageId).toBe(PACKAGE_ID);
      expect(result.order.packageName).toBe('Starter');
      expect(result.order.billingCycle).toBe('monthly');
    });

    it('prices the package from the catalogue for yearly billing', () => {
      const result = toPayableOrder([pkg()], PACKAGE_ID, 'yearly');

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.order.amount).toBe(1990);
      expect(result.order.currency).toBe('SAR');
      expect(result.order.packageId).toBe(PACKAGE_ID);
      expect(result.order.packageName).toBe('Starter');
      expect(result.order.billingCycle).toBe('yearly');
    });

    it('refuses yearly billing when priceYearly is missing or non-positive', () => {
      const resultMissing = toPayableOrder(
        [pkg({ priceYearly: undefined })],
        PACKAGE_ID,
        'yearly'
      );
      expect(resultMissing).toEqual({
        ok: false,
        reason: 'package-not-payable',
      });

      const resultZero = toPayableOrder(
        [pkg({ priceYearly: 0 })],
        PACKAGE_ID,
        'yearly'
      );
      expect(resultZero).toEqual({
        ok: false,
        reason: 'package-not-payable',
      });
    });

    it('mints a reference that satisfies the ERP contract', () => {
      const result = toPayableOrder([pkg()], PACKAGE_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.order.orderReference).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(result.order.orderReference.length).toBeGreaterThanOrEqual(8);
      expect(result.order.orderReference.length).toBeLessThanOrEqual(64);
    });

    it('mints a DIFFERENT reference on every call', () => {
      const references = new Set(
        Array.from({ length: 200 }, () => {
          const result = toPayableOrder([pkg()], PACKAGE_ID);
          return result.ok ? result.order.orderReference : 'FAILED';
        })
      );

      expect(references.size).toBe(200);
    });

    it('produces terms that survive being signed and verified', () => {
      const result = toPayableOrder([pkg()], PACKAGE_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const { intent } = signOrderIntent(result.order);

      expect(verifyOrderIntent(intent)).toEqual({
        orderReference: result.order.orderReference,
        amount: result.order.amount,
        currency: result.order.currency,
        packageId: result.order.packageId,
        billingCycle: result.order.billingCycle,
      });
    });

    it('refuses an unknown package id', () => {
      const result = toPayableOrder(
        [pkg()],
        '2f1b3311-2477-49f1-8c5c-3abb1c3ecd4d'
      );

      expect(result).toEqual({ ok: false, reason: 'package-not-found' });
    });

    it('refuses on an empty catalogue', () => {
      expect(toPayableOrder([], PACKAGE_ID)).toEqual({
        ok: false,
        reason: 'package-not-found',
      });
    });

    it('refuses an explicitly inactive package', () => {
      expect(toPayableOrder([pkg({ isActive: false })], PACKAGE_ID)).toEqual({
        ok: false,
        reason: 'package-not-payable',
      });
    });

    it.each([
      [true, true],
      [undefined, true],
    ])('treats isActive=%p as payable (%p)', (isActive, payable) => {
      // `erpPackageSchema` DROPS a malformed `isActive` rather than rejecting
      // the entry, so "not stated" must not behave like "withdrawn".
      const result = toPayableOrder([pkg({ isActive })], PACKAGE_ID);

      expect(result.ok).toBe(payable);
    });

    it.each([
      [0, 'monthly', 'zero (a trial-only plan)'],
      [undefined, 'monthly', 'absent (a trial-only plan)'],
      [-5, 'monthly', 'negative'],
      [Number.NaN, 'monthly', 'NaN'],
      [Number.POSITIVE_INFINITY, 'monthly', 'infinite'],
      ['199' as unknown as number, 'monthly', 'a string'],
      [-1, 'yearly', 'a negative yearly price'],
    ] as Array<[number | undefined, ErpBillingCycle, string]>)(
      'refuses a %s price on %s billing (%s)',
      (price, billingCycle, label) => {
        // The free-package case is worth stating: a plan with no price is
        // TRIAL-ONLY. The funnel renders no payment step for it, so a payment
        // request for one is never a legitimate continuation — it is a request to
        // charge an amount the server cannot derive.
        const result = toPayableOrder(
          [
            pkg(
              billingCycle === 'yearly'
                ? { priceYearly: price as number }
                : { priceMonthly: price as number }
            ),
          ],
          PACKAGE_ID,
          billingCycle
        );

        expect({ label, result }).toEqual({
          label,
          result: { ok: false, reason: 'package-not-payable' },
        });
      }
    );

    it('does not confuse two packages that share a price', () => {
      const other = '2f1b3311-2477-49f1-8c5c-3abb1c3ecd4d';
      const result = toPayableOrder(
        [
          pkg({ id: other, name: 'Growth', priceMonthly: 199 }),
          pkg({ name: 'Starter', priceMonthly: 499 }),
        ],
        other
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.order.packageName).toBe('Growth');
      expect(result.order.amount).toBe(199);
    });
  });

  describe('resolvePayableOrder', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    const catalogueResponds = (body: unknown, status = 200) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      });
    };

    it('prices the package from the ERP catalogue', async () => {
      catalogueResponds([pkg()]);

      const result = await resolvePayableOrder(PACKAGE_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.order.amount).toBe(199);
    });

    it('reports a package the catalogue does not contain', async () => {
      catalogueResponds([pkg()]);

      expect(await resolvePayableOrder('other-package')).toEqual({
        ok: false,
        reason: 'package-not-found',
      });
    });

    it.each([
      [{}, 'a wrong-shaped envelope'],
      [null, 'a null body'],
      ['not-a-list', 'a string body'],
    ])(
      'propagates the malformed-catalogue failure for %s',
      async (body, label) => {
        // The failure must NOT be swallowed into `package-not-found`: "the ERP
        // answered nonsense" and "that package does not exist" have different
        // status codes and must not be guessed at.
        catalogueResponds(body);

        const failure = await resolvePayableOrder(PACKAGE_ID).catch(
          (error: unknown) => error
        );

        expect({
          label,
          threwErpApiError: failure instanceof ErpApiError,
        }).toEqual({ label, threwErpApiError: true });
      }
    );

    it('propagates an unreachable ERP instead of reporting a missing package', async () => {
      // A transport failure surfaces as a TypeError from `fetch`, and the ROUTE
      // classifies it into `503 erp-unavailable` via `respondErpError`. What
      // matters here is that it is not swallowed: a failure that became
      // `package-not-found` would tell the customer their plan does not exist
      // when in fact the ERP was down.
      global.fetch = jest.fn().mockRejectedValue(
        Object.assign(new TypeError('fetch failed'), {
          cause: new Error('connect ECONNREFUSED 127.0.0.1:5001'),
        })
      );

      const failure = await resolvePayableOrder(PACKAGE_ID).catch(
        (error: unknown) => error
      );

      expect(failure).toBeInstanceOf(TypeError);
      expect(failure).not.toEqual({ ok: false, reason: 'package-not-found' });
    });

    it('never lets a corrupt price become an order', async () => {
      // A negative price fails `erpPackageSchema` and the whole ENTRY is dropped
      // at the boundary, so the id resolves to nothing. The refusal is reported
      // as `package-not-found` rather than `package-not-payable` — which is the
      // honest answer, because by the time resolution runs there is no package
      // left to price. Either way the charge does not happen, which is the
      // property under test.
      catalogueResponds([
        { id: PACKAGE_ID, name: 'Starter', priceMonthly: -5 },
      ]);

      expect(await resolvePayableOrder(PACKAGE_ID)).toEqual({
        ok: false,
        reason: 'package-not-found',
      });
    });
  });
});
