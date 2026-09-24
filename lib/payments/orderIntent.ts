import crypto from 'crypto';
import { z } from 'zod';

import env from '@/lib/env';
import { erpBillingCycleSchema, type ErpBillingCycle } from '@/lib/zod/erp';

/**
 * Server-authoritative order terms for the public payment path (PG-06).
 *
 * ## The defect this closes
 *
 * `components/erp/PaymentActivation.tsx` used to mint the order reference from
 * the clock and the package id —
 * `` `pay-${packageId.slice(0, 8)}-${Date.now()}` `` — and to send the price it
 * had rendered. The BFF forwarded BOTH to the ERP verbatim
 * (`pages/api/public/erp/payments.ts`). Two consequences, and only the first is
 * obvious:
 *
 *  1. **Price tampering.** `amount` came from the caller, so a hand-rolled POST
 *     priced a tenant at any number the attacker liked. The ERP bills what it is
 *     told to bill, and the funnel only ever learned the price from a page it
 *     also served.
 *  2. **Reference forgery.** The reference is the handle the gateway round trip
 *     and the ERP webhook use to find the order. A timestamp-suffixed,
 *     partially-derivable string is guessable, and nothing made two concurrent
 *     payers — or one payer replaying a request — collide-free.
 *
 * The fix is that the SERVER decides both, and issues them as a signed token the
 * browser can only carry, never edit.
 *
 * ## Why a signed token instead of a stored intent
 *
 * The obvious design is a server-side store: mint the terms, persist them, look
 * them up when the payment arrives. It was rejected because it adds durable
 * state to a stateless request path for no gain:
 *
 *  - it needs a table plus a migration in a repo whose Prisma schema is shared
 *    with an admin surface (and whose CI gates schema/migration parity), for a
 *    record whose useful life is one checkout;
 *  - it needs an expiry sweeper, or it accumulates abandoned checkouts forever;
 *  - it silently breaks behind more than one container, because the instance
 *    that serves `/payments` is not necessarily the one that served `/orders`.
 *
 * An HMAC over the terms has none of those properties. It is verifiable by any
 * instance, needs no cleanup, and carries its own expiry. It is also *stronger*
 * in the way that matters: a store can be read wrong, whereas a signature either
 * verifies or it does not.
 *
 * ## What the token deliberately does NOT contain
 *
 * No customer name, email, phone or description. Those still travel in the
 * request body, they are not money, and a signature does not make them safer to
 * put in a value the browser holds and passes around. Keeping the payload to the
 * four fields that decide the CHARGE is what makes the token auditable: anything
 * absent from it cannot be influenced by it.
 */

/** Payload format version. */
const PAYLOAD_VERSION = 2;

/**
 * The one currency the platform charges in.
 *
 * A server constant rather than a caller input: `currency` is part of what the
 * amount MEANS, so a caller who could set it could reinterpret the price
 * (`199` SAR versus `199` of something else entirely). `erpPaymentSchema` has
 * always defaulted it to SAR; PG-06 makes that binding rather than a default.
 */
export const PLATFORM_CURRENCY = 'SAR';

/**
 * How long an issued intent stays payable.
 *
 * Bounded on purpose. Long enough for a real checkout (a customer reading a
 * gateway page, entering card details, being sent to 3-D Secure), short enough
 * that a leaked token is not a durable licence to pay a stale price. It is the
 * only thing standing between "a price the server agreed to" and "a price the
 * server agreed to last month".
 */
export const ORDER_INTENT_TTL_MS = 30 * 60 * 1000;

/**
 * Domain-separation prefix for the signing key.
 *
 * See `resolveKey` for why the key is derived rather than used directly.
 */
const KEY_DOMAIN = 'smart-platform.order-intent.v1:';

/**
 * DEV-ONLY fallback. Mirrors `lib/crypto/erpToken.ts`: in production a missing
 * key is a hard error, so this published constant can never be what protects a
 * live order.
 */
const DEV_FALLBACK_KEY = 'smart-platform-default-dev-order-intent-key';

let warnedDevFallback = false;

/**
 * Resolves the HMAC key.
 *
 * ## Key governance (and why this key, of the two available)
 *
 * The repo has exactly two long-lived server secrets that could sign this:
 * `NEXTAUTH_SECRET` and `ERP_TOKEN_ENCRYPTION_KEY`.
 *
 * `NEXTAUTH_SECRET` is the wrong one, and `lib/crypto/erpToken.ts` already
 * documents the rule: it is deliberately kept out of the ERP token chain so that
 * rotating the session secret can never corrupt anything else. A signature
 * scheme built on it would make session-secret rotation invalidate in-flight
 * checkouts — a coupling with no upside.
 *
 * `ERP_TOKEN_ENCRYPTION_KEY` is the right one: it is already required in
 * production, already operated as a rotation target, and belongs to the same
 * subsystem (the ERP boundary) this token crosses. It is NOT used raw — the
 * stored key is hashed together with `KEY_DOMAIN`, which is domain separation:
 * the value used here is computationally independent of the value used for
 * at-rest ERP token encryption, so a weakness in one cannot be pivoted into the
 * other.
 */
const resolveKey = (): Buffer => {
  const secret = env.erp.tokenEncryptionKey;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ERP_TOKEN_ENCRYPTION_KEY is required in production');
    }

    if (!warnedDevFallback) {
      warnedDevFallback = true;
      console.warn(
        '[orderIntent] ERP_TOKEN_ENCRYPTION_KEY is not set — using the ' +
          'DEV-ONLY fallback signing key. Set ERP_TOKEN_ENCRYPTION_KEY in any ' +
          'non-local environment.'
      );
    }
  }

  return crypto
    .createHash('sha256')
    .update(`${KEY_DOMAIN}${secret || DEV_FALLBACK_KEY}`)
    .digest();
};

/**
 * The cycle an order is priced for. Aliased to the contract layer's definition
 * so the wire enum and the request schema cannot drift apart.
 */
export type BillingCycle = ErpBillingCycle;

/**
 * The authoritative terms of one payable order.
 *
 * `currency` is a server constant (`PLATFORM_CURRENCY`), never the caller's
 * value: it is part of what `amount` means, so a caller who could set it could
 * reinterpret the price.
 */
export interface OrderTerms {
  orderReference: string;
  amount: number;
  currency: string;
  packageId: string;
  billingCycle: BillingCycle;
}

/**
 * Mints an unguessable order reference.
 *
 * `crypto.randomBytes(24)` — a CSPRNG — giving 192 bits, base64url-encoded to 32
 * characters. Chosen over `crypto.randomUUID()` for two reasons: three times the
 * entropy, and a charset already inside the ERP contract's
 * `^[a-zA-Z0-9_-]+$` with no transformation (a UUID's hyphens are legal, but the
 * point is that nothing has to be stripped or re-encoded).
 *
 * The `ord_` prefix keeps the value greppable in ERP logs and support tickets —
 * operability, not entropy; it is outside the secret part.
 */
export function mintOrderReference(): string {
  return `ord_${crypto.randomBytes(24).toString('base64url')}`;
}

/**
 * The on-the-wire payload. Validated on the way OUT of the token, not trusted.
 *
 * `exp` is an absolute epoch-ms instant rather than a lifetime, so a token
 * cannot be made to live longer by being read slowly.
 */
const intentPayloadSchema = z.union([
  z.object({
    v: z.literal(2),
    ref: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/),
    amount: z.number().finite().positive(),
    cur: z.string().min(3).max(8),
    pkg: z.string().min(1).max(100),
    cyc: erpBillingCycleSchema,
    exp: z.number().int().positive(),
  }),
  z.object({
    v: z.literal(1),
    ref: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/),
    amount: z.number().finite().positive(),
    cur: z.string().min(3).max(8),
    pkg: z.string().min(1).max(100),
    exp: z.number().int().positive(),
  }),
]);

const b64url = (buffer: Buffer): string => buffer.toString('base64url');

/**
 * Issues a signed intent for `terms`.
 *
 * Token shape: `<base64url(payload json)>.<base64url(HMAC-SHA256(payload part))>`.
 * The signature covers the ENCODED payload segment, so verification never has to
 * re-serialise the JSON to compare — re-serialising is where canonicalisation
 * bugs (key order, number formatting) turn into signature bypasses.
 */
export function signOrderIntent(
  terms: OrderTerms,
  now: number = Date.now()
): { intent: string; expiresAt: string } {
  const exp = now + ORDER_INTENT_TTL_MS;

  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        v: PAYLOAD_VERSION,
        ref: terms.orderReference,
        amount: terms.amount,
        cur: terms.currency,
        pkg: terms.packageId,
        cyc: terms.billingCycle,
        exp,
      }),
      'utf8'
    )
  );

  const signature = b64url(
    crypto.createHmac('sha256', resolveKey()).update(payload).digest()
  );

  return {
    intent: `${payload}.${signature}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

/**
 * Verifies an intent and returns its terms, or `null`.
 *
 * Everything that can go wrong returns the same `null` — a malformed token, a
 * bad signature, a wrong payload version, an expired token, a payload whose
 * fields are not the shape the signature was supposed to be protecting. The
 * caller has exactly one decision to make ("is this order payable?"), so the
 * failure modes deliberately do not fan out into distinguishable branches a
 * caller could accidentally treat as "probably fine".
 *
 * The comparison is `crypto.timingSafeEqual` over the raw signature bytes, with
 * an explicit length guard (it throws on length mismatch, which would otherwise
 * be an unhandled exception on hostile input — a denial-of-service of its own).
 */
export function verifyOrderIntent(
  token: unknown,
  now: number = Date.now()
): OrderTerms | null {
  if (typeof token !== 'string' || !token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }

  const expected = crypto
    .createHmac('sha256', resolveKey())
    .update(payload)
    .digest();

  if (provided.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(provided, expected)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const parsed = intentPayloadSchema.safeParse(decoded);
  if (!parsed.success) return null;

  // Expiry is checked AFTER the signature: an unsigned token must not be able to
  // make the caller do any work, or leak (via timing or error shape) which of
  // its fields were well-formed.
  if (parsed.data.exp <= now) return null;

  return {
    orderReference: parsed.data.ref,
    amount: parsed.data.amount,
    currency: parsed.data.cur,
    packageId: parsed.data.pkg,
    billingCycle: parsed.data.v === 2 ? parsed.data.cyc : 'monthly',
  };
}
