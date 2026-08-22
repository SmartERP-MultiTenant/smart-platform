import type { NextApiRequest } from 'next';

/**
 * In-memory sliding-window rate limiter for the public /api/public/erp/*
 * surface (subdomain/email enumeration + registration/payment abuse).
 *
 * NOTE: module-level state is fine for a single-instance deployment. If the
 * kit is scaled horizontally, replace this with a distributed store
 * (Redis / edge rate limiting) — the limiter API stays the same.
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
  checks: new RateLimiter(60_000, 30),
  register: new RateLimiter(60_000, 10),
  payments: new RateLimiter(60_000, 10),
};

export type LimiterName = keyof typeof limiters;

export function clientKey(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']?.toString();
  const ip = forwarded?.split(',')[0]?.trim();

  return ip || req.socket?.remoteAddress || 'unknown';
}