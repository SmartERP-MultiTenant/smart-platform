import {
  erpRegistrationSchema,
  erpPaymentSchema,
  erpConnectSchema,
  erpExtendSchema,
} from '@/lib/zod/erp';
import { validateWithSchema } from '@/lib/zod';
import { ApiError } from '@/lib/errors';

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

    it('rejects invalid email, short password, and non-uuid packageId', () => {
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

      expect(
        erpRegistrationSchema.safeParse({
          ...validRegistration,
          packageId: 'not-a-uuid',
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
});
