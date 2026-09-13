import { z } from 'zod';

export const addSubscriptionSchema = z.object({
  packageId: z.string().min(1, 'Package ID is required'),
  startDate: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional()),
  endDate: z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional()),
  trialDays: z.number().int().min(0).max(365).optional(),
  isTrial: z.boolean().optional().default(false),
});

export const extendSubscriptionSchema = z.object({
  newEndDate: z
    .string()
    .min(1, 'New end date is required')
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid date format',
    }),
});

export const trialOverrideSchema = z.object({
  newTrialEndDate: z
    .string()
    .min(1, 'New trial end date is required')
    .refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid date format',
    }),
});

export const cancelSubscriptionSchema = z.object({
  reason: z.string().max(500).optional(),
});
