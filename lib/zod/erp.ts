import { z } from 'zod';

export const erpRegistrationSchema = z
  .object({
    companyName: z.string().min(2).max(150),
    subdomain: z
      .string()
      .regex(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/, 'invalid-subdomain'),
    adminEmail: z.string().email().max(100),
    adminUserName: z.string().min(3).max(50),
    adminPassword: z.string().min(8).max(64),
    phoneNumber: z.string().max(20).optional(),
    packageId: z.string().uuid(),
    trialDays: z.number().int().positive().max(90),
  })
  .strict();

export type ErpRegistrationInput = z.infer<typeof erpRegistrationSchema>;

export const erpPaymentSchema = z
  .object({
    orderReference: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/),
    amount: z.number().positive(),
    currency: z.string().max(8).default('SAR'),
    paymentMethod: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .min(3)
      .max(20),
    customerName: z.string().max(100).optional(),
    customerEmail: z.string().email().max(100).optional(),
    customerPhone: z.string().max(20).optional(),
    description: z.string().max(200).optional(),
    callbackUrl: z.string().url().max(500).optional(),
  })
  .strict();

export type ErpPaymentInput = z.infer<typeof erpPaymentSchema>;
