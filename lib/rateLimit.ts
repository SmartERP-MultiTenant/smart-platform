import type { NextApiRequest } from 'next';

import env from '@/lib/env';

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
 *
 * CLIENT IDENTITY (P4.22 - 2026-09-14):
 * The bucket key is derived from the *right* end of `X-Forwarded-For` — the
 * entries a trusted proxy appended — never from the caller-supplied left end.
 * Before this change `clientKey()` read `split(',')[0]`, so one rotating
 * header minted an unlimited number of fresh buckets and the limits above were
 * fully bypassable. See `resolveClientIp()` for the trust model.
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

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_CHARS = /^[0-9a-fA-F:]+$/;
const IPV4_MAPPED_IPV6 = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

/**
 * Is `value` shaped like an IP address literal?
 *
 * Deliberately permissive for IPv6 (it does not canonicalise `::` compression
 * or validate group counts): the security property below depends on *which
 * position* of the header we read, not on strict parsing. The only thing that
 * matters here is telling an address apart from junk like `unknown`, `-` or an
 * injected `; DROP …`, so that a malformed entry cannot become the bucket key.
 */
export function isIpLiteral(value: string): boolean {
  const ipv4 = value.match(IPV4_PATTERN);

  if (ipv4) {
    return ipv4.slice(1).every((octet) => Number(octet) <= 255);
  }

  return (
    value.includes(':') &&
    value.split(':').length >= 3 &&
    IPV6_CHARS.test(value)
  );
}

/**
 * Normalise an address so equivalent spellings share one bucket.
 *
 * Node reports IPv4 peers in the IPv4-mapped IPv6 form (`::ffff:127.0.0.1`),
 * while a proxy writes the plain form (`127.0.0.1`) — without this both forms
 * would bucket the same client separately. IPv6 is lower-cased for the same
 * reason.
 */
export function normalizeIp(value: string): string {
  const trimmed = value.trim();
  const mapped = trimmed.match(IPV4_MAPPED_IPV6);

  if (mapped) {
    return mapped[1];
  }

  return trimmed.includes(':') ? trimmed.toLowerCase() : trimmed;
}

/**
 * Split `X-Forwarded-For` into the address entries proxies appended, in the
 * order they arrived (left = oldest / caller-supplied, right = newest).
 *
 * Empty and malformed entries are dropped rather than kept as bucket keys, so
 * a caller cannot shift the position of the trailing (trusted) entries by
 * injecting padding.
 */
export function parseForwardedFor(header: string | undefined): string[] {
  if (!header) {
    return [];
  }

  return header
    .split(',')
    .map(normalizeIp)
    .filter((entry) => entry.length > 0 && isIpLiteral(entry));
}

/**
 * Derive the rate-limit bucket key for a request — the one place the client's
 * identity is decided.
 *
 * TRUST MODEL (P4.22). `X-Forwarded-For` is append-only: every proxy adds the
 * address it saw to the *right* of whatever the caller sent. Only the trailing
 * `trustedHops` entries were therefore written by infrastructure we control.
 * Everything to their left is caller-supplied and must never key a bucket —
 * that was the bypass in the previous `split(',')[0]` implementation.
 *
 * The trust set is an explicit hop count rather than "is the peer address
 * private?", because a private-peer check is unsound here: the production
 * compose publishes `5032:4002`, so Docker's NAT rewrites *every* external
 * request (including a direct attack on the published port) to come from the
 * private bridge gateway. A peer-address heuristic would therefore trust the
 * header even when nothing in front of the app is a proxy. A hop count is
 * deploy-verifiable and has no such blind spot.
 *
 * Edges handled explicitly:
 * - header absent / empty / whitespace only → the direct-peer address;
 * - fewer entries than `trustedHops` (should be impossible for a well-behaved
 *   proxy chain, and un-forceable by a caller, who can only ever *append*) →
 *   the direct-peer address. We never fall back to the left end, because that
 *   would reintroduce the spoofable read;
 * - `trustedHops` 0, negative, fractional or NaN → XFF is ignored entirely;
 * - always returns a non-empty key, so a failure can never collapse every
 *   client into the empty-string bucket.
 */
export function resolveClientIp({
  forwardedFor,
  peerAddress,
  trustedHops,
}: {
  forwardedFor?: string;
  peerAddress?: string;
  trustedHops: number;
}): string {
  const peer = peerAddress ? normalizeIp(peerAddress) : '';
  const hops =
    Number.isInteger(trustedHops) && trustedHops > 0 ? trustedHops : 0;

  if (hops > 0) {
    const chain = parseForwardedFor(forwardedFor);

    if (chain.length >= hops) {
      // Reading from the RIGHT is the whole fix: only the trailing entries
      // were appended by infrastructure we trust. Every entry survived
      // `parseForwardedFor`'s filter, so this index is always a non-empty
      // address literal.
      return chain[chain.length - hops];
    }
  }

  return peer || 'unknown';
}

export function clientKey(req: NextApiRequest): string {
  const forwarded = req.headers?.['x-forwarded-for'];

  return resolveClientIp({
    forwardedFor: Array.isArray(forwarded)
      ? forwarded.join(',')
      : forwarded?.toString(),
    peerAddress: req.socket?.remoteAddress,
    trustedHops: env.rateLimit.trustedProxyHops,
  });
}
