import {
  erpRegistrationSchema,
  erpPaymentSchema,
  erpConnectSchema,
  erpExtendSchema,
  erpPackageSchema,
  erpPaymentMethodSchema,
  erpVerifyResponseSchema,
  readErpList,
} from '@/lib/zod/erp';
import { validateWithSchema } from '@/lib/zod';
import { ApiError } from '@/lib/errors';
// Relative on purpose: `tsconfig.json` maps only `@/lib/*` and `@/components/*`,
// so the `@/` alias cannot reach `tests/`. The fixtures live outside
// `__tests__/` because Jest treats every file under it as a suite.
import {
  erpListWithInvalidEntries,
  erpListWithInvalidEntriesExpected,
  erpMethodsResponse,
  erpPackagesResponse,
  erpVerifyResponse,
  erpVerifyResponseWithoutStatus,
  erpWrongShapedBodies,
} from '../../../tests/fixtures/erp-contract';

describe('Lib - Zod ERP Schemas', () => {
  describe('erpRegistrationSchema', () => {
    const validRegistration = {
      companyName: 'Acme Corp',
      subdomain: 'acme-corp',
      adminEmail: 'admin@acme.com',
      adminUserName: 'acmeadmin',
      adminPassword: 'Password123!',
      phoneNumber: '0501234567',
      packageId: '1f1b3311-2477-49f1-8c5c-3abb1c3ecd4c',
      trialDays: 14,
    };

    it('validates a complete valid registration payload', () => {
      const parsed = erpRegistrationSchema.safeParse(validRegistration);
      expect(parsed.success).toBe(true);
    });

    it('accepts optional recaptchaToken and phoneNumber', () => {
      const withToken = {
        ...validRegistration,
        recaptchaToken: 'valid-captcha-token',
      };
      const parsed = erpRegistrationSchema.safeParse(withToken);
      expect(parsed.success).toBe(true);
    });

    it('rejects invalid subdomain format (uppercase, special chars, leading/trailing hyphen)', () => {
      expect(
        erpRegistrationSchema.safeParse({
          ...validRegistration,
          subdomain: 'Acme_Corp',
        }).success
      ).toBe(false);

      expect(
        erpRegistrationSchema.safeParse({
          ...validRegistration,
          subdomain: '-acme',
        }).success
      ).toBe(false);

      expect(
        erpRegistrationSchema.safeParse({
          ...validRegistration,
          subdomain: 'acme-',
        }).success
      ).toBe(false);
    });

    it('rejects an invalid email and a short password', () => {
      expect(
        erpRegistrationSchema.safeParse({
          ...validRegistration,
          adminEmail: 'invalid-email',
        }).success
      ).toBe(false);

      expect(
        erpRegistrationSchema.safeParse({
          ...validRegistration,
          adminPassword: 'short',
        }).success
      ).toBe(false);
    });

    it('accepts a NON-UUID package id — the catalogue, not the string shape, is the authority (m1)', () => {
      // `packageId` used to be `z.string().uuid()` on every write path while the
      // catalogue READ path (`erpPackageSchema.id`) accepted any non-empty id up
      // to 100 chars. A package the ERP returned with an opaque id therefore
      // rendered on /pricing and then 400'd the moment a customer tried to buy
      // it — a split-brain contract no fixture could catch, because every
      // fixture uses a UUID. Both sides now share ONE rule; the authoritative
      // check is the catalogue LOOKUP, which still fails closed for an id that
      // does not exist (covered in the orders/payments route specs).
      expect(
        erpRegistrationSchema.safeParse({
          ...validRegistration,
          packageId: 'not-a-uuid',
        }).success
      ).toBe(true);

      // The id must still be a plausible id: an empty or over-long value is
      // refused, so relaxing the shape did not remove the bound.
      expect(
        erpRegistrationSchema.safeParse({
          ...validRegistration,
          packageId: '',
        }).success
      ).toBe(false);

      expect(
        erpRegistrationSchema.safeParse({
          ...validRegistration,
          packageId: 'x'.repeat(101),
        }).success
      ).toBe(false);
    });

    it('rejects trialDays outside 1-90 range or non-integer', () => {
      expect(
        erpRegistrationSchema.safeParse({
          ...validRegistration,
          trialDays: 0,
        }).success
      ).toBe(false);

      expect(
        erpRegistrationSchema.safeParse({
          ...validRegistration,
          trialDays: 100,
        }).success
      ).toBe(false);
    });
  });

  describe('erpPaymentSchema', () => {
    const validPayment = {
      orderReference: 'pay-order-123456',
      amount: 199.5,
      currency: 'SAR',
      paymentMethod: 'credit_card',
      customerName: 'Test Company',
      customerEmail: 'customer@example.com',
      callbackUrl: 'https://example.com/callback',
    };

    it('validates a valid payment payload', () => {
      const parsed = erpPaymentSchema.safeParse(validPayment);
      expect(parsed.success).toBe(true);
    });

    it('rejects non-positive amount and invalid orderReference', () => {
      expect(
        erpPaymentSchema.safeParse({
          ...validPayment,
          amount: 0,
        }).success
      ).toBe(false);

      expect(
        erpPaymentSchema.safeParse({
          ...validPayment,
          amount: -50,
        }).success
      ).toBe(false);

      expect(
        erpPaymentSchema.safeParse({
          ...validPayment,
          orderReference: 'short',
        }).success
      ).toBe(false);
    });

    it('rejects recaptchaToken — the payment step has no captcha check (P4.22)', () => {
      // The field was declared on this schema but never consumed:
      // `pages/api/public/erp/payments.ts` does not call `validateRecaptcha`
      // and the funnel client never sends it. Declaring it advertised a bot
      // check that did not exist, so it was removed and `.strict()` now
      // rejects it outright.
      expect(
        erpPaymentSchema.safeParse({
          ...validPayment,
          recaptchaToken: 'any-token',
        }).success
      ).toBe(false);
    });
  });

  describe('erpConnectSchema and erpExtendSchema', () => {
    it('validates erpConnectSchema with valid credentials', () => {
      const validConnect = {
        subdomain: 'my-tenant',
        adminUserName: 'admin',
        adminPassword: 'securePassword123',
      };
      expect(erpConnectSchema.safeParse(validConnect).success).toBe(true);
    });

    it('validates erpExtendSchema with parseable ISO date', () => {
      const validExtend = {
        newEndDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      };
      expect(erpExtendSchema.safeParse(validExtend).success).toBe(true);

      expect(
        erpExtendSchema.safeParse({
          newEndDate: 'not-a-valid-date',
        }).success
      ).toBe(false);
    });
  });

  describe('validateWithSchema helper', () => {
    it('returns parsed data when schema passes', () => {
      const result = validateWithSchema(erpConnectSchema, {
        subdomain: 'valid-subdomain',
        adminUserName: 'adminuser',
        adminPassword: 'Password123!',
      });

      expect(result.subdomain).toBe('valid-subdomain');
    });

    it('throws ApiError with status 422 when validation fails', () => {
      expect(() => {
        validateWithSchema(erpConnectSchema, {
          subdomain: 'INVALID SUBDOMAIN!',
        });
      }).toThrow(ApiError);

      try {
        validateWithSchema(erpConnectSchema, {});
      } catch (err: any) {
        expect(err.status).toBe(422);
        expect(err.message).toContain('Validation Error');
      }
    });
  });

  /* ---------------------------------------------------------------------- *
   * PG-20 / PG-30 — RESPONSE contracts
   * ---------------------------------------------------------------------- */

  describe('erpPaymentMethodSchema (PG-20)', () => {
    const validMethod = {
      key: 'credit_card',
      label: 'Card',
      provider: 'moyasar',
      available: true,
    };

    it('accepts a well-formed available method', () => {
      const parsed = erpPaymentMethodSchema.safeParse(validMethod);

      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data).toEqual(validMethod);
    });

    it('parses the catalogue fixture exactly as the fail-closed rule requires', () => {
      // Three of the four fixture entries carry an `available` flag and parse.
      // The fourth (`tabby`) omits it and MUST be rejected: an entry whose
      // availability is unknown is never optimistically payable.
      const results = erpMethodsResponse.map(
        (method) => erpPaymentMethodSchema.safeParse(method).success
      );

      expect(results).toEqual([true, true, true, false]);
    });

    it('REJECTS a method with no availability flag (fail-closed, never optimistically payable)', () => {
      const parsed = erpPaymentMethodSchema.safeParse({
        key: 'tabby',
        label: 'Tabby',
      });

      expect(parsed.success).toBe(false);
    });

    it('rejects a non-boolean available', () => {
      expect(
        erpPaymentMethodSchema.safeParse({ ...validMethod, available: 'true' })
          .success
      ).toBe(false);
      expect(
        erpPaymentMethodSchema.safeParse({ ...validMethod, available: 1 })
          .success
      ).toBe(false);
    });

    it('rejects a missing or blank key or label', () => {
      expect(
        erpPaymentMethodSchema.safeParse({ ...validMethod, key: '' }).success
      ).toBe(false);
      expect(
        erpPaymentMethodSchema.safeParse({ ...validMethod, label: '   ' })
          .success
      ).toBe(false);
      expect(
        erpPaymentMethodSchema.safeParse({
          key: 'a',
          label: 'A',
          available: true,
        }).success
      ).toBe(true);
      expect(
        erpPaymentMethodSchema.safeParse({ label: 'A', available: true })
          .success
      ).toBe(false);
    });

    it('rejects a key that is not a plain identifier', () => {
      for (const key of ['has space', 'has/slash', 'semi;colon', '<script>']) {
        expect(
          erpPaymentMethodSchema.safeParse({ ...validMethod, key }).success
        ).toBe(false);
      }
    });

    it('normalises an absent provider to an empty string rather than inventing one', () => {
      const parsed = erpPaymentMethodSchema.safeParse({
        key: 'mada',
        label: 'Mada',
        available: true,
      });

      expect(parsed.success && parsed.data.provider).toBe('');
    });

    it('keeps the method and drops only a non-https iconUrl', () => {
      const insecure = erpPaymentMethodSchema.safeParse({
        ...validMethod,
        iconUrl: 'http://cdn.example.com/icon.svg',
      });
      const javascriptUrl = erpPaymentMethodSchema.safeParse({
        ...validMethod,
        iconUrl: 'javascript:alert(1)',
      });

      expect(insecure.success && insecure.data.iconUrl).toBeUndefined();
      expect(insecure.success && insecure.data.key).toBe('credit_card');
      expect(
        javascriptUrl.success && javascriptUrl.data.iconUrl
      ).toBeUndefined();
    });

    it('passes through extra ERP fields is NOT allowed — the method shape is closed', () => {
      const parsed = erpPaymentMethodSchema.safeParse({
        ...validMethod,
        unexpected: 'value',
      });

      // Default `strip` behaviour: the extra field is removed, and the entry is
      // still usable. The point of the assertion is that no unknown field is
      // forwarded to the browser.
      expect(parsed.success && parsed.data).not.toHaveProperty('unexpected');
    });
  });

  describe('erpPackageSchema (PG-20 / P4.10b)', () => {
    it('accepts the real ERP package catalogue fixture', () => {
      for (const pkg of erpPackagesResponse) {
        expect(erpPackageSchema.safeParse(pkg).success).toBe(true);
      }
    });

    it('requires id and name but nothing else', () => {
      const parsed = erpPackageSchema.safeParse({ id: 'pkg', name: 'Plan' });

      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.priceMonthly).toBeUndefined();
    });

    it('rejects a package with a blank or missing id or name', () => {
      expect(erpPackageSchema.safeParse({ name: 'Plan' }).success).toBe(false);
      expect(erpPackageSchema.safeParse({ id: 'pkg' }).success).toBe(false);
      expect(
        erpPackageSchema.safeParse({ id: '   ', name: 'Plan' }).success
      ).toBe(false);
      expect(erpPackageSchema.safeParse({ id: 'pkg', name: '' }).success).toBe(
        false
      );
    });

    it('REJECTS a package whose price is present but not a finite non-negative number', () => {
      // Present-but-invalid is corruption, and `pages/pricing.tsx` renders a
      // non-positive price as "Free" — so keeping the entry would publish a
      // false claim about the price. See the schema's rule comment.
      for (const priceMonthly of ['199', -5, Infinity, NaN, {}]) {
        expect(
          erpPackageSchema.safeParse({ id: 'pkg', name: 'Plan', priceMonthly })
            .success
        ).toBe(false);
      }
    });

    it('KEEPS a package with no price field at all — absence is a valid state', () => {
      const parsed = erpPackageSchema.safeParse({ id: 'pkg', name: 'Plan' });

      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.priceMonthly).toBeUndefined();
    });

    it('drops only the NON-price fields when they are malformed', () => {
      const parsed = erpPackageSchema.safeParse({
        id: 'pkg',
        name: 'Plan',
        priceMonthly: 199,
        priceYearly: '1990',
        trialDays: 5000,
        description: 42,
        isActive: 'yes',
      });

      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.priceMonthly).toBe(199);
      expect(parsed.success && parsed.data.priceYearly).toBeUndefined();
      expect(parsed.success && parsed.data.trialDays).toBeUndefined();
      expect(parsed.success && parsed.data.description).toBeUndefined();
      expect(parsed.success && parsed.data.isActive).toBeUndefined();
    });

    it('keeps a legitimate price of zero', () => {
      const parsed = erpPackageSchema.safeParse({
        id: 'pkg',
        name: 'Free plan',
        priceMonthly: 0,
      });

      expect(parsed.success && parsed.data.priceMonthly).toBe(0);
    });

    it('drops an out-of-range trialDays', () => {
      const parsed = erpPackageSchema.safeParse({
        id: 'pkg',
        name: 'Plan',
        trialDays: 5000,
      });

      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.trialDays).toBeUndefined();
    });

    it('preserves fields the ERP adds beyond the declared shape', () => {
      const parsed = erpPackageSchema.safeParse({
        id: 'pkg',
        name: 'Plan',
        systemModules: [{ id: 'm1', code: 'POS', name: 'POS' }],
      });

      expect(parsed.success && parsed.data.systemModules).toEqual([
        { id: 'm1', code: 'POS', name: 'POS' },
      ]);
    });
  });

  describe('erpVerifyResponseSchema (PG-30)', () => {
    it('accepts all three canonical statuses', () => {
      expect(
        erpVerifyResponseSchema.safeParse(erpVerifyResponse.pending).success
      ).toBe(true);
      expect(
        erpVerifyResponseSchema.safeParse(erpVerifyResponse.paid).success
      ).toBe(true);
      expect(
        erpVerifyResponseSchema.safeParse(erpVerifyResponse.failed).success
      ).toBe(true);
    });

    it('accepts a body with no status at all (pre-rollout ERP)', () => {
      const parsed = erpVerifyResponseSchema.safeParse(
        erpVerifyResponseWithoutStatus
      );

      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.status).toBeUndefined();
    });

    it('accepts the empty object the optimistic-settle path relies on', () => {
      expect(erpVerifyResponseSchema.safeParse({}).success).toBe(true);
    });

    it('accepts an uppercase status without coercing it', () => {
      const parsed = erpVerifyResponseSchema.safeParse({
        success: true,
        status: 'PAID',
      });

      expect(parsed.success).toBe(true);
      // Verbatim: the ERP's casing is not pinned anywhere, and normalising it
      // here would be inventing a value the ERP never sent.
      expect(parsed.success && parsed.data.status).toBe('PAID');
    });

    it('passes an UNRECOGNISED status through instead of rejecting it', () => {
      const parsed = erpVerifyResponseSchema.safeParse({
        success: true,
        status: 'Authorised',
      });

      // Rejecting this would make the route answer 5xx, and the poller treats a
      // 5xx as transient — which falls through to the optimistic settle. The
      // consumer classifies unknown statuses as never-success, so passing the
      // value through keeps the customer on the honest "pending" path.
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.status).toBe('Authorised');
    });

    it('rejects a non-string status rather than silently dropping it', () => {
      expect(
        erpVerifyResponseSchema.safeParse({ success: true, status: 1 }).success
      ).toBe(false);
      expect(
        erpVerifyResponseSchema.safeParse({
          success: true,
          status: { name: 'Paid' },
        }).success
      ).toBe(false);
    });

    it('rejects a blank status', () => {
      expect(
        erpVerifyResponseSchema.safeParse({ success: true, status: '   ' })
          .success
      ).toBe(false);
    });

    it('rejects a non-boolean success', () => {
      expect(
        erpVerifyResponseSchema.safeParse({ success: 'false' }).success
      ).toBe(false);
      expect(erpVerifyResponseSchema.safeParse({ success: 1 }).success).toBe(
        false
      );
    });

    it('rejects a non-object envelope', () => {
      for (const body of [null, 'Paid', 42, true, []]) {
        expect(erpVerifyResponseSchema.safeParse(body).success).toBe(false);
      }
    });

    it('preserves fields the ERP adds beyond the declared shape', () => {
      const parsed = erpVerifyResponseSchema.safeParse({
        success: true,
        status: 'Paid',
        paymentId: 'pay_123',
      });

      expect(parsed.success && parsed.data.paymentId).toBe('pay_123');
    });
  });

  describe('readErpList (PG-20 / P4.10b)', () => {
    it('fails the whole read when the envelope is not an array', () => {
      for (const body of Object.values(erpWrongShapedBodies)) {
        expect(readErpList(body, erpPackageSchema)).toEqual({ ok: false });
      }
    });

    it('accepts an empty array as a valid, empty catalogue', () => {
      const read = readErpList([], erpPackageSchema);

      expect(read).toEqual({ ok: true, items: [], dropped: 0 });
    });

    it('keeps only the entries that satisfy the contract and counts the rest', () => {
      const read = readErpList(erpListWithInvalidEntries, erpPackageSchema);

      expect(read.ok).toBe(true);
      expect(read.ok && read.items).toEqual(erpListWithInvalidEntriesExpected);
      expect(read.ok && read.dropped).toBe(
        erpListWithInvalidEntries.length -
          erpListWithInvalidEntriesExpected.length
      );
    });

    it('never mutates or returns the caller array', () => {
      const input = [{ id: 'a', name: 'A' }];
      const read = readErpList(input, erpPackageSchema);

      expect(read.ok && read.items).not.toBe(input);
      expect(input).toEqual([{ id: 'a', name: 'A' }]);
    });

    it('applies the given schema, not a package-specific one', () => {
      const read = readErpList(erpMethodsResponse, erpPaymentMethodSchema);

      expect(read.ok).toBe(true);
      // The entries that parse are kept EVEN WHEN unavailable — availability is
      // policy, applied later by `erp.getMethods()`, precisely so validation and
      // policy stay separable and separately testable. Here that means the three
      // flagged entries survive the read and the unflagged one does not.
      expect(read.ok && read.items).toHaveLength(3);
      expect(read.ok && read.items[2].available).toBe(false);
    });
  });
});
