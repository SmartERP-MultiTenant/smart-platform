import { z } from 'zod';

/**
 * The ONE rule for a package id, shared by the catalogue reader and every write
 * path that names a package (m1).
 *
 * ## Why this is shared rather than repeated
 *
 * The read path (`erpPackageSchema.id`) accepts any non-empty id up to 100
 * characters, because that is what the ERP catalogue may return. Both write
 * paths demanded a UUID instead. A package whose id was not a UUID therefore
 * rendered on `/pricing` and then 400'd the moment a customer tried to buy it —
 * a split-brain contract where the reader's tolerance invited the writer's
 * rejection. No test could catch it, because every fixture and stub uses UUIDs.
 *
 * ## Why the format check is relaxed to the catalogue's shape
 *
 * The authoritative check on a write is not the id's string shape: it is the
 * catalogue LOOKUP. An id that is not in the catalogue fails closed with
 * `package-not-payable` no matter what it looks like, so the format check only
 * ever decided which of two identical outcomes the caller saw. Matching the
 * reader's shape means a package the catalogue will render is always a package
 * the API will attempt to price — the ERP remains the authority on what exists.
 *
 * ## Known limitation
 *
 * The real ERP's id format is INFERRED from fixtures and cannot be verified
 * from this repository. If the ERP is confirmed to emit only UUIDs, tighten this
 * ONE constant — never let the read and write sides diverge again.
 */
const packageIdSchema = z.string().trim().min(1).max(100);

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
    packageId: packageIdSchema,
    trialDays: z.number().int().positive().max(90),
    recaptchaToken: z.string().optional(),
  })
  .strict();

export type ErpRegistrationInput = z.infer<typeof erpRegistrationSchema>;

/**
 * The payment request as the browser sends it.
 *
 * ## PG-06: `orderReference` and `amount` are NOT authoritative
 *
 * Both fields stay in the schema, and both are still SHAPE-validated — a
 * zero/negative amount or a malformed reference is still a 400 — but neither is
 * allowed to decide what the customer is charged. The route derives the amount
 * from `packageId` against the ERP's own catalogue and mints the reference
 * server-side (see `lib/payments/payablePackage.ts`).
 *
 * They are optional because requiring them would force callers to keep
 * supplying values that are then ignored, which is how a future reader
 * concludes they must matter. They remain ACCEPTED for the transitional period
 * so a client that still sends them does not fail an unknown-key rule: the
 * values are ignored, not honoured.
 *
 * ## `packageId` (or `intent`) is what makes a request payable
 *
 * At least one of the two must be present; the route answers 400 when neither
 * is, because without them the amount cannot be derived at all, and a request
 * whose price is unknowable must never become a charge.
 *
 *  - `packageId` — the funnel's package id. The server prices it.
 *  - `intent` — a signed token previously issued by `/api/public/erp/orders`
 *    (see `lib/payments/orderIntent.ts`). Preferred: it binds the reference AND
 *    the amount, so the two cannot be mixed across requests. `packageId` is
 *    still accepted alongside it and must agree, which is what stops a caller
 *    from attaching a cheap package to an expensive intent.
 */
export const erpBillingCycleSchema = z.enum(['monthly', 'yearly']);
/**
 * The canonical billing-cycle type. Every other module aliases THIS — the value
 * set must never be re-spelled, because the v2 order intent signs exactly these
 * values and a divergent copy would fail verification at runtime.
 */
export type ErpBillingCycle = z.infer<typeof erpBillingCycleSchema>;

export const erpPaymentSchema = z
  .object({
    /** Ignored as a price input (PG-06) — the server mints its own. */
    orderReference: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .optional(),
    /** Ignored as a price input (PG-06) — the server resolves the real one. */
    amount: z.number().finite().positive().optional(),
    currency: z.string().max(8).default('SAR'),
    intent: z.string().min(16).max(2048).optional(),
    packageId: packageIdSchema.optional(),
    billingCycle: erpBillingCycleSchema.optional(),
    paymentMethod: z
      .string()
      .min(3)
      .max(20)
      .regex(/^[a-z0-9_]+$/),
    customerName: z.string().max(100).optional(),
    customerEmail: z.string().email().max(100).optional(),
    customerPhone: z.string().max(20).optional(),
    description: z.string().max(200).optional(),
    callbackUrl: z.string().url().max(500).optional(),
  })
  .strict();

export type ErpPaymentInput = z.infer<typeof erpPaymentSchema>;

/**
 * `POST /api/public/erp/orders` — asks the server to price a package (PG-06).
 *
 * Strict, and accepts `packageId` and optional `billingCycle` ('monthly' | 'yearly').
 * Everything the response carries — amount, currency, reference, expiry — is
 * derived by the server from the catalogue for the requested billing cycle.
 */
export const erpOrderIntentSchema = z
  .object({
    packageId: packageIdSchema,
    billingCycle: erpBillingCycleSchema.optional().default('monthly'),
  })
  .strict();

export type ErpOrderIntentInput = z.infer<typeof erpOrderIntentSchema>;

export const erpConnectSchema = z
  .object({
    subdomain: z
      .string()
      .regex(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/, 'invalid-subdomain'),
    adminUserName: z.string().min(3).max(50),
    adminPassword: z.string().min(8).max(64),
  })
  .strict();

export type ErpConnectInput = z.infer<typeof erpConnectSchema>;

export const erpExtendSchema = z
  .object({
    newEndDate: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), 'invalid-date'),
  })
  .strict();

export type ErpExtendInput = z.infer<typeof erpExtendSchema>;

/* -------------------------------------------------------------------------- *
 * RESPONSE contracts (PG-20, PG-30)
 *
 * The schemas above validate what the browser sends US; the ones below validate
 * what the ERP sends BACK. The two directions need opposite defaults:
 *
 *  - A request is `.strict()`: an unexpected field is a caller bug and must be
 *    rejected rather than silently ignored.
 *  - A response is `.passthrough()`: the ERP is a separate codebase that may add
 *    fields at any time, and an unknown extra field is not a contract breach.
 *
 * Neither direction may invent data. Where an optional field is present but
 * unusable it is DROPPED rather than defaulted, because a defaulted price or
 * trial length is indistinguishable, downstream, from one the ERP really sent.
 * -------------------------------------------------------------------------- */

/**
 * One entry of `GET /payments/methods?country=SA`.
 *
 * `available` is REQUIRED and deliberately not defaulted. The whole point of
 * PG-20/PG-05 is that the funnel must never present a payment method the ERP has
 * not vouched for, so an entry whose availability is unknown is treated as
 * unavailable (fail-closed) rather than optimistically payable. `lib/erp.ts`
 * drops every entry this schema rejects and every entry that is not `available`.
 *
 * `provider` is kept because it is part of the ERP's declared shape
 * (`ErpPaymentMethod`), but no funnel surface reads it; it normalises to `''`
 * when absent so the published type stays honest rather than claiming a value
 * that was never sent.
 */
export const erpPaymentMethodSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  label: z.string().trim().min(1).max(120),
  provider: z
    .string()
    .trim()
    .max(64)
    .optional()
    .catch(undefined)
    .transform((value) => value ?? ''),
  available: z.boolean(),
  // A non-https icon URL is dropped rather than failing the entry: the icon is
  // decoration, so an untrusted scheme must not cost the customer a method.
  // `catch` is what makes that a normalisation instead of a validation error.
  iconUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => /^https:\/\//i.test(value), 'insecure-url')
    .optional()
    .catch(undefined),
});

/**
 * One entry of `GET /platform/TenantRegistration/catalog/packages`.
 *
 * Only `id` and `name` are required: they are the two fields every consumer
 * genuinely needs (`/pricing` keys React on `id` and links to
 * `/register?package=<id>`; the name is displayed).
 *
 * ## The rule that decides drop-the-field vs reject-the-entry
 *
 * A field that is safe to OMIT is repaired in place; a field whose absence
 * changes what the package CLAIMS is fatal to the entry. So:
 *
 *  - `description`, `priceYearly`, `trialDays`, `isActive` are dropped when
 *    malformed. Nothing renders a decision from them, and a dropped value
 *    degrades to exactly the same UI as an absent one.
 *  - `priceMonthly` REJECTS the entry when it is present but not a finite
 *    non-negative number. It is the one field whose absence is already rendered
 *    as a specific promise — `pages/pricing.tsx` falls back to
 *    `t('erp-pricing-free')` whenever the price is not a positive number — so a
 *    corrupt value can only ever become a FALSE CLAIM. A `-5` price rendered as
 *    "Free" invites a customer to register expecting not to be charged, and the
 *    ERP bills them anyway because the amount is resolved server-side. Dropping
 *    the price instead of the entry would keep that exact failure mode.
 *
 * The trade-off is deliberate and worth stating: if the ERP ever starts sending
 * `"199"` as a string, the package disappears from `/pricing` rather than being
 * displayed at a price we cannot vouch for. That is a visible contract break,
 * and it is the failure this fixture in `tests/fixtures/erp-contract.ts` exists
 * to catch in a unit test rather than in production.
 *
 * `.passthrough()` keeps the ERP's other fields reachable for consumers that
 * already read them (`ErpPackage` declares an index signature).
 */
export const erpPackageSchema = z
  .object({
    id: packageIdSchema,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().catch(undefined),
    priceMonthly: z.number().finite().nonnegative().optional(),
    // Deliberately asymmetric with `priceMonthly` above, which REJECTS its
    // package: a malformed monthly price could only become a false claim, while
    // a malformed yearly price is dropped so the package stays payable monthly
    // and simply offers no yearly option. A corrupt yearly price must not take
    // the whole catalogue down.
    priceYearly: z.number().finite().nonnegative().optional().catch(undefined),
    trialDays: z
      .number()
      .int()
      .nonnegative()
      .max(365)
      .optional()
      .catch(undefined),
    isActive: z.boolean().optional().catch(undefined),
  })
  .passthrough();

/**
 * `GET /payments/verify/{reference}` (PG-30).
 *
 * The two rules here are the whole ticket:
 *
 * 1. `status` is an OPEN string, not an enum, and is passed through VERBATIM —
 *    never coerced, never defaulted. Coercing an unknown value to `Pending`
 *    would fabricate a state the ERP never reported, and the consumer already
 *    classifies unknown values safely: `normaliseVerifyStatus`
 *    (`pages/payment/success.tsx:39-55`) maps anything outside
 *    `pending|paid|failed` to `'unknown'`, which is never treated as success.
 *    `'PAID'` is accepted because the ERP's casing is not pinned anywhere in
 *    either repo and the consumer is case-insensitive.
 * 2. Both fields are OPTIONAL-but-typed rather than required. `{}` is a
 *    contract-legal body — it is what a pre-rollout ERP sends — and the client
 *    depends on that: `settleOptimistically` requires a genuinely ABSENT
 *    `status`. Making `success` required would turn such a body into a 502, and
 *    the poller reads a 502 as a TRANSIENT failure which falls through to the
 *    optimistic settle (`pages/payment/success.tsx:55-59`, `:180-185`). That
 *    inverts the safety of the one path whose entire purpose is "do not claim a
 *    payment we cannot see". When either field IS present it must have the
 *    right type, which is what stops a stringified `"false"`, an array or an
 *    object from reaching the poller at all.
 */
export const erpVerifyResponseSchema = z
  .object({
    success: z.boolean().optional(),
    status: z.string().trim().min(1).max(64).optional(),
  })
  .passthrough();

export type ErpPaymentMethodContract = z.infer<typeof erpPaymentMethodSchema>;
export type ErpPackageContract = z.infer<typeof erpPackageSchema>;
export type ErpVerifyResponseContract = z.infer<typeof erpVerifyResponseSchema>;

/**
 * Reads a LIST-shaped ERP 2xx body with deliberately asymmetric strictness.
 *
 * - The **envelope** is all-or-nothing: a body that is not an array means we do
 *   not know what we are looking at, so the caller must fail the request rather
 *   than guess. That is the class of defect P4.10b is about — a 200 whose body
 *   parses to `{}`, `null` or a string sailed through and 500'd a page.
 * - Each **entry** is validated on its own and an entry that does not match the
 *   contract is DROPPED, not fatal. One bad row must not take the whole
 *   catalogue down and leave the customer with no way to pay; but an entry we
 *   cannot fully account for is never forwarded either, so the browser only ever
 *   receives entries that satisfied the contract.
 *
 * Returning a discriminated result rather than throwing keeps the policy ("what
 * does the caller do about it") at the caller, and keeps this function pure and
 * directly testable.
 */
export function readErpList<TSchema extends z.ZodTypeAny>(
  raw: unknown,
  schema: TSchema
): { ok: true; items: z.output<TSchema>[]; dropped: number } | { ok: false } {
  if (!Array.isArray(raw)) {
    return { ok: false };
  }

  const items: z.output<TSchema>[] = [];

  for (const entry of raw) {
    const parsed = schema.safeParse(entry);
    if (parsed.success) {
      items.push(parsed.data);
    }
  }

  return { ok: true, items, dropped: raw.length - items.length };
}
