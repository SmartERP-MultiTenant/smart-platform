import type { NextApiRequest } from 'next';

/**
 * In-memory sliding-window rate limiter for the public /api/public/erp/*
 * surface (subdomain/email enumeration + registration/payment abuse).
 *
 * ARCHITECTURE DECISION (P4.8 - 2026-09-06):
 * Retain in-memory sliding-window limiter for single-node deployments.
 * When the platform scales horizontally (>1 instance), migrate to a
 * distributed Redis-backed store behind the same RateLimiter interface.
 *
 * COVERAGE (P4.8): every public ERP handler starts with its bucket check —
 * `register` (10/min), `payments` (10/min), `check-subdomain` + `check-email`
 * (30/min enumeration probes), `packages` + `methods` (catalog, 60/min) and
 * `verify` (payment-status polling, 60/min). Buckets stay separate by purpose
 * so an abuse burst on one surface cannot 429 a legitimate caller on another.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private windowMs: number,
    private max: number
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    const recent = (this.hits.get(key) || []).filter((t) => t > cutoff);

    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }

    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

export const limiters = {
  // Enumeration probes: subdomain/email availability checks.
  checks: new RateLimiter(60_000, 30),
  // Tenant registration (one ERP tenant creation per request).
  register: new RateLimiter(60_000, 10),
  // Payment creation (one ERP payment intent per request).
  payments: new RateLimiter(60_000, 10),
  // Catalog reads: `/packages` + `/methods`, fetched once per payment-step
  // mount (components/erp/PaymentActivation.tsx) — 60/min ≈ 30 step mounts per
  // IP/min, so a real funnel is never throttled while scraping is capped. Kept
  // separate from `checks` on purpose: an enumeration burst must not 429 a
  // legitimate catalog read.
  catalog: new RateLimiter(60_000, 60),
  // Payment-status polling: pages/payment/success.tsx polls `/verify`
  // MAX_ATTEMPTS (15) times every POLL_INTERVAL_MS (2s) ⇒ 15 calls per ~30s
  // cycle. 60/min leaves room for four full cycles per IP/min (reloads and
  // retries included) while capping order-reference enumeration against the
  // ERP. Revisit only if shared-IP (NAT/office) contention is observed.
  verify: new RateLimiter(60_000, 60),
};

export type LimiterName = keyof typeof limiters;

export function clientKey(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']?.toString();
  const ip = forwarded?.split(',')[0]?.trim();

  return ip || req.socket?.remoteAddress || 'unknown';
}
