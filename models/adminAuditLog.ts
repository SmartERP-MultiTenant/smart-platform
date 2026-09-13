import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { PlatformAdminActor } from '@/lib/guardPlatformAdmin';

export type AdminAuditAction =
  | 'user.disable'
  | 'user.enable'
  | 'user.lock'
  | 'user.unlock'
  | 'subscription.create'
  | 'subscription.extend'
  | 'subscription.cancel'
  | 'subscription.trial_override'
  | 'package.modules_update'
  | 'package.modules_sync';

export type AdminAuditStatus = 'STARTED' | 'SUCCEEDED' | 'FAILED';

export type AdminAuditTargetType =
  | 'tenant'
  | 'subscription'
  | 'user'
  | 'package';

export interface AuditSnapshot {
  tenantId?: string;
  subdomain?: string;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  planName?: string;
  priceMonthly?: number;
  isTrial?: boolean;
  daysRemaining?: number;
  [key: string]: unknown;
}

/**
 * Whitelist-only sanitizer for subscription snapshots.
 * Strips any tokens, passwords, API keys, headers, or raw bodies.
 */
export function sanitizeSubscriptionSnapshot(raw: any): AuditSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;

  const sub = raw.subscription || raw;
  return {
    tenantId: typeof sub.tenantId === 'string' ? sub.tenantId : undefined,
    subdomain: typeof sub.subdomain === 'string' ? sub.subdomain : undefined,
    status: typeof sub.status === 'string' ? sub.status : undefined,
    startDate: sub.startDate ? String(sub.startDate) : undefined,
    endDate: sub.endDate ? String(sub.endDate) : undefined,
    planName:
      typeof sub.planName === 'string' ? sub.planName : sub.package?.name,
    priceMonthly:
      typeof sub.priceMonthly === 'number' ? sub.priceMonthly : undefined,
    isTrial: typeof sub.isTrial === 'boolean' ? sub.isTrial : undefined,
    daysRemaining:
      typeof sub.daysRemaining === 'number' ? sub.daysRemaining : undefined,
  };
}

// ---------------------------------------------------------------------------
// Redaction choke point
//
// Redaction used to be the caller's job (`sanitizeSubscriptionSnapshot`), but
// the `AuditSnapshot` index signature means TypeScript enforces nothing: one
// call site passing a raw ERP object would persist credential material. These
// helpers run inside every write below, so no caller can bypass them.
// ---------------------------------------------------------------------------

/** Value written in place of a dropped key (never the key itself). */
export const AUDIT_REDACTED = '[redacted]';

/**
 * Marker for a value dropped because its *type* is not audit material
 * (`Map`/`Set`). Distinct from `AUDIT_REDACTED`: this is not "a secret was
 * here", it is "evidence was here that this store cannot represent" — an
 * operator reading the log should be able to tell those apart.
 */
export const AUDIT_OMITTED = '[omitted]';

/** Keys dropped wholesale, matched against the alphanumeric-normalized name. */
const SENSITIVE_EXACT_KEYS = new Set([
  'auth',
  'authorization',
  'cookie',
  'cookies',
  'credential',
  'credentials',
  'header',
  'headers',
  'key',
  'keys',
  'password',
  'passwords',
  'secret',
  'secrets',
  'token',
  'tokens',
]);

/** Substrings that mark a key as credential-bearing once normalized. */
const SENSITIVE_KEY_FRAGMENTS = [
  'accesstoken',
  'apikey',
  'authorization',
  'clientsecret',
  // Catches every spelling of the cookie header: `Set-Cookie`, `set-cookie`,
  // `SetCookie`, `setcookie`, `cookie` and `cookies` all normalize to a token
  // containing `cookie`. Matching the fragment (rather than adding `setcookie`
  // to the exact-key set) also covers prefixed/suffixed variants such as
  // `responseSetCookie`. A cookie value is a live session credential, so this
  // fails closed.
  'cookie',
  'credential',
  'idtoken',
  'privatekey',
  'refreshtoken',
  'sessiontoken',
  'signature',
  'signedurl',
  'password',
  'passwd',
  'secret',
  'token',
];

const MAX_STRING_LENGTH = 512;
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 50;

/**
 * `X-Platform-ApiKey` → `xplatformapikey`, `erpAccessToken` → `erpaccesstoken`,
 * `Set-Cookie` → `setcookie`, and the fullwidth homoglyph `Ａuthorization` →
 * `authorization`. Normalizing away separators and case is what makes the
 * fragment match reliable across the naming styles in this codebase.
 *
 * Normalisation alone is not the contract: every token it can produce must also
 * be matched below. `setcookie` is caught by the `cookie` fragment — matching
 * the exact key `cookie` would not have caught it, which was a real gap.
 *
 * `normalize('NFKD')` runs first so Unicode compatibility forms fold to their
 * ASCII equivalents *before* the non-alphanumerics are stripped. Without it the
 * strip step manufactures a false negative: `Ａuthorization` would become
 * `uthorization` and silently miss every fragment.
 *
 * Residual limitation, documented rather than papered over: NFKD folds
 * compatibility forms (fullwidth, mathematical alphanumerics) but not
 * confusable scripts that have no compatibility decomposition — Cyrillic `а`
 * (U+0430) is a distinct codepoint and still misses. This is a denylist for
 * careless or accidental credential exposure, not a defence against a caller
 * deliberately crafting homoglyph keys: the write paths are ours, not the
 * client's, and the value scrubber below catches the credential either way.
 */
export function isSensitiveAuditKey(key: string): boolean {
  const normalized = key
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!normalized) return false;
  if (SENSITIVE_EXACT_KEYS.has(normalized)) return true;
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment)
  );
}

// ---------------------------------------------------------------------------
// Value scrubbing
//
// Matching on keys alone is not enough: a credential can ride inside a *value*
// under an innocuous key (`{ note: 'Authorization: Bearer eyJ…' }`). This is
// live, not theoretical — the users routes persist `reason: error.message`, and
// a Prisma or undici error message can embed a connection string or an auth
// header.
//
// Every rule below rewrites only the secret substring, so the surrounding
// evidence survives: the host, the database name, the header name and the
// sentence around it all stay. That is deliberate. An audit row saying "an
// error happened" is far less useful to an investigator than one saying
// `postgresql://user:[redacted]@db:5432/saas`.
// ---------------------------------------------------------------------------

/** `scheme://user:password@host` → keeps host + route, drops only the password. */
const scrubConnectionStrings = (value: string): string =>
  value.replace(
    /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]+)@/gi,
    (_match, scheme: string, user: string) =>
      `${scheme}${user}:${AUDIT_REDACTED}@`
  );

/**
 * `Authorization: Bearer <token>` and bare `Bearer <token>`; also `Basic`.
 *
 * The scheme name is kept so the reader knows *what kind* of credential was
 * present. The minimum length keeps prose such as "Basic authentication failed"
 * (short second token) from being rewritten.
 */
const scrubAuthSchemes = (value: string): string =>
  value.replace(
    /\b(Bearer|Basic)\s+([A-Za-z0-9._~+/=-]{8,})/gi,
    (_match, scheme: string) => `${scheme} ${AUDIT_REDACTED}`
  );

/**
 * `Sensitive-Header: value` lines.
 *
 * Reuses `isSensitiveAuditKey` so every spelling the key matcher already knows
 * (`X-Platform-ApiKey`, `Cookie`, `Set-Cookie`, `Authorization`) is covered
 * here too — one denylist, not two that can drift apart. The header name is
 * preserved as evidence; only the value goes.
 */
const scrubSensitiveHeaderLines = (value: string): string =>
  value.replace(
    /(^|\n)([A-Za-z0-9_-]+)[ \t]*:[ \t]*([^\n]+)/g,
    (match, lead: string, name: string) =>
      isSensitiveAuditKey(name) ? `${lead}${name}: ${AUDIT_REDACTED}` : match
  );

/**
 * Vendor-prefixed secrets (`sk_live_…`, `pk_test_…`, `whsec_…`).
 *
 * Matched by prefix because the shape is unambiguous — no natural-language
 * sentence or identifier contains these tokens.
 */
const scrubPrefixedSecrets = (value: string): string =>
  value.replace(
    /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b|\bwhsec_[A-Za-z0-9]{8,}\b/g,
    AUDIT_REDACTED
  );

const MIN_HIGH_ENTROPY_LENGTH = 40;

/**
 * A long, dense, mixed-case alphanumeric run — a JWT, a base64 payload, or a
 * mixed-case hex key.
 *
 * Deliberately conservative, because this rule is what decides whether an audit
 * payload stays *readable*. It requires all three character classes, so the
 * evidence this store exists to keep cannot match: ISO dates carry no lowercase
 * (`2026-05-01T10:00:00.000Z`), UUIDs and kebab-case codes carry no uppercase
 * (`7f28d97c-…`, `end-date-not-after-current-end`), and prose contains
 * characters outside the alphabet (spaces, commas, `:`), which splits it into
 * tokens that fail the check anyway.
 */
const looksHighEntropySecret = (token: string): boolean =>
  token.length >= MIN_HIGH_ENTROPY_LENGTH &&
  /^[A-Za-z0-9+/=_.-]+$/.test(token) &&
  /[A-Z]/.test(token) &&
  /[a-z]/.test(token) &&
  /[0-9]/.test(token);

const scrubHighEntropyTokens = (value: string): string =>
  value.replace(/\S+/g, (token) =>
    looksHighEntropySecret(token) ? AUDIT_REDACTED : token
  );

/**
 * Applies every value rule to one string.
 *
 * Order matters and is not arbitrary: the structural rules run before the
 * entropy heuristic so a DSN or header line is rewritten with its context
 * intact (`postgresql://user:[redacted]@host`) instead of being collapsed to a
 * bare `[redacted]` by the token rule.
 *
 * Idempotent: every replacement it emits (`[redacted]`, or a value with
 * `[redacted]` embedded) fails all four patterns on a second pass, which is
 * what lets the store re-redact a merged payload safely.
 */
const scrubStringValue = (value: string, stats: RedactionStats): string => {
  if (!value) return value;

  const scrubbed = scrubHighEntropyTokens(
    scrubPrefixedSecrets(
      scrubSensitiveHeaderLines(scrubAuthSchemes(scrubConnectionStrings(value)))
    )
  );

  if (scrubbed !== value) stats.redactedValues += 1;

  return scrubbed;
};

const clampString = (value: string): string =>
  value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}…`
    : value;

/**
 * Counters for one redaction pass, for observability. Two distinct events are
 * counted separately because they mean different things to whoever reads the
 * log: `droppedKeys`/`redactedValues` mean "a secret was removed here",
 * `omittedValues` means "a value of an unsupported type was dropped, so this
 * snapshot is incomplete".
 */
type RedactionStats = {
  droppedKeys: number;
  redactedValues: number;
  omittedValues: number;
};

const toSafeJson = (
  value: unknown,
  stats: RedactionStats,
  depth = 0
): unknown => {
  if (value === null || value === undefined) return null;

  switch (typeof value) {
    case 'string':
      // Scrub BEFORE clamping: a secret sitting past the 512th character would
      // otherwise survive, because clamping is a blind slice.
      return clampString(scrubStringValue(value, stats));
    case 'number':
      return Number.isFinite(value) ? value : null;
    case 'boolean':
      return value;
    case 'bigint':
      return value.toString();
    case 'symbol':
    case 'function':
      return null;
    default:
      break;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  // Buffers are opaque byte blobs (uploads, receipts) — never audit material.
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    stats.droppedKeys += 1;
    return AUDIT_REDACTED;
  }

  // Any other binary view (`Uint8Array`, `DataView`, …) and raw `ArrayBuffer`s
  // are opaque byte blobs too. Without this they serialise as
  // `{"0":byte,"1":byte,…}` — a credential handed over as bytes under an
  // innocuous key would persist in a directly decodable form, and the key
  // denylist above would never see it.
  if (
    typeof ArrayBuffer !== 'undefined' &&
    (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
  ) {
    stats.omittedValues += 1;
    return AUDIT_REDACTED;
  }

  // `Map`/`Set` store their entries internally, so they expose no own
  // enumerable properties: the generic object branch below would persist `{}`.
  // That is evidence loss with no signal at all, which is the one outcome an
  // audit store must not produce silently — so say what happened instead.
  if (value instanceof Map || value instanceof Set) {
    stats.omittedValues += 1;
    return `${AUDIT_OMITTED} ${value instanceof Map ? 'Map' : 'Set'}`;
  }

  if (depth >= MAX_DEPTH) return AUDIT_REDACTED;

  if (Array.isArray(value)) {
    const capped = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => toSafeJson(item, stats, depth + 1));

    // Never truncate silently — an audit snapshot that drops evidence without
    // saying so is worse than no snapshot.
    if (value.length > MAX_ARRAY_ITEMS) {
      capped.push(`…${value.length - MAX_ARRAY_ITEMS} more item(s) omitted`);
    }

    return capped;
  }

  if (typeof value === 'object') {
    // Class instances (Prisma records included) are flattened to plain data so
    // nothing non-serializable ever reaches the JSONB column.
    const entries = Object.entries(value as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    let written = 0;
    let omitted = 0;

    for (const [key, nested] of entries) {
      if (isSensitiveAuditKey(key)) {
        stats.droppedKeys += 1;
        continue;
      }

      if (written >= MAX_OBJECT_KEYS) {
        omitted += 1;
        continue;
      }

      out[key] = toSafeJson(nested, stats, depth + 1);
      written += 1;
    }

    if (omitted > 0) {
      out.__truncated = `${omitted} key(s) omitted`;
    }

    return out;
  }

  return null;
};

/**
 * Redacts and JSON-normalizes an audit payload, returning a plain object that is
 * safe to persist in a `Json?` column. Always returns an object (or `null`), so
 * the call sites stay trivially assignable.
 */
export function redactAuditPayload(
  value: unknown
): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;

  const stats: RedactionStats = {
    droppedKeys: 0,
    redactedValues: 0,
    omittedValues: 0,
  };
  const safe = toSafeJson(value, stats);

  if (stats.droppedKeys > 0 || stats.redactedValues > 0) {
    // Signal without persisting what was dropped.
    console.warn(
      `[ADMIN_AUDIT] redacted ${stats.droppedKeys} sensitive key(s) and ${stats.redactedValues} sensitive value(s) from an audit payload`
    );
  }

  if (stats.omittedValues > 0) {
    // A different failure mode from redaction: evidence was dropped because
    // this store cannot represent the type, so the snapshot is incomplete and
    // whoever reads it needs to know that.
    console.warn(
      `[ADMIN_AUDIT] omitted ${stats.omittedValues} value(s) of unsupported type from an audit payload`
    );
  }

  if (safe === null) return null;
  if (Array.isArray(safe)) return { items: safe };
  if (typeof safe !== 'object') return { value: safe };

  return safe as Record<string, unknown>;
}

/**
 * Adapts a redacted payload for a nullable `Json?` column. `Prisma.DbNull` is
 * a real SQL NULL (an absent snapshot), which is distinct from the JSON literal
 * `null` Prisma would otherwise infer from a bare `null`.
 */
type AuditJsonColumn = Prisma.InputJsonValue | typeof Prisma.DbNull;

const toJsonColumn = (value: unknown): AuditJsonColumn => {
  const redacted = redactAuditPayload(value);

  return redacted === null
    ? Prisma.DbNull
    : (redacted as unknown as Prisma.InputJsonValue);
};

/**
 * Builds the metadata for a terminal UPDATE by merging over whatever the
 * `STARTED` row already stored, instead of overwriting it. Context captured at
 * start (target user, requested module ids) would otherwise be lost the moment
 * the operation completes, leaving the audit row unable to explain itself.
 * Values read back were already redacted on the way in, and the merged result
 * is redacted again (the filter is idempotent).
 */
const mergeMetadataForUpdate = async (
  logId: string,
  incoming: Record<string, unknown> | undefined
): Promise<AuditJsonColumn | undefined> => {
  if (!incoming) return undefined;

  const existing = await prisma.adminAuditLog.findUnique({
    where: { id: logId },
    select: { metadata: true },
  });

  const stored = existing?.metadata;
  const base: Record<string, unknown> =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};

  return toJsonColumn({ ...base, ...incoming });
};

// ---------------------------------------------------------------------------
// Write path
//
// Every write is best-effort: an audit failure must never break the operator's
// mutation. Failures are loud (`console.error`) rather than silent, and reads
// (below) deliberately do NOT use this pattern.
// ---------------------------------------------------------------------------

export interface StartAdminAuditParams {
  actor: PlatformAdminActor;
  action: AdminAuditAction;
  targetType: AdminAuditTargetType;
  targetId: string;
  before?: AuditSnapshot | Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

/**
 * Inserts the `STARTED` row and returns its id, which the caller MUST thread
 * into `completeAdminAudit`/`failAdminAudit` so the operation resolves on the
 * same row instead of leaving a phantom `STARTED` row behind.
 */
export async function createAdminAuditStart({
  actor,
  action,
  targetType,
  targetId,
  before,
  metadata = {},
}: StartAdminAuditParams): Promise<string | null> {
  try {
    const log = await prisma.adminAuditLog.create({
      data: {
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: actor.name,
        action,
        targetType,
        targetId,
        status: 'STARTED',
        before: toJsonColumn(before),
        metadata: toJsonColumn(metadata),
      },
      select: { id: true },
    });

    return log.id;
  } catch (err) {
    console.error('[ADMIN_AUDIT_ERROR] Failed to start audit entry:', err);
    return null;
  }
}

export interface CompleteAdminAuditParams {
  /** Id from the matching `STARTED` insert; `null` logs a standalone row. */
  logId: string | null;
  actor: PlatformAdminActor;
  action: AdminAuditAction;
  targetType: AdminAuditTargetType;
  targetId: string;
  before?: AuditSnapshot | Record<string, unknown> | null;
  after?: AuditSnapshot | Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export async function completeAdminAudit({
  logId,
  actor,
  action,
  targetType,
  targetId,
  before,
  after,
  metadata,
}: CompleteAdminAuditParams): Promise<string | null> {
  const safeAfter = toJsonColumn(after);

  try {
    if (logId) {
      const mergedMetadata = await mergeMetadataForUpdate(logId, metadata);

      const updated = await prisma.adminAuditLog.update({
        where: { id: logId },
        data: {
          status: 'SUCCEEDED',
          after: safeAfter,
          // `undefined` leaves the STARTED metadata untouched.
          metadata: mergedMetadata,
        },
        select: { id: true },
      });

      return updated.id;
    }

    const created = await prisma.adminAuditLog.create({
      data: {
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: actor.name,
        action,
        targetType,
        targetId,
        status: 'SUCCEEDED',
        before: toJsonColumn(before),
        after: safeAfter,
        metadata: toJsonColumn(metadata),
      },
      select: { id: true },
    });

    return created.id;
  } catch (err) {
    console.error('[ADMIN_AUDIT_ERROR] Failed to complete audit entry:', err);
    return null;
  }
}

export interface FailAdminAuditParams {
  /** Id from the matching `STARTED` insert; `null` logs a standalone row. */
  logId: string | null;
  actor: PlatformAdminActor;
  action: AdminAuditAction;
  targetType: AdminAuditTargetType;
  targetId: string;
  errorCode: string;
  before?: AuditSnapshot | Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export async function failAdminAudit({
  logId,
  actor,
  action,
  targetType,
  targetId,
  errorCode,
  before,
  metadata,
}: FailAdminAuditParams): Promise<string | null> {
  try {
    if (logId) {
      const mergedMetadata = await mergeMetadataForUpdate(logId, metadata);

      const updated = await prisma.adminAuditLog.update({
        where: { id: logId },
        data: {
          status: 'FAILED',
          errorCode,
          metadata: mergedMetadata,
        },
        select: { id: true },
      });

      return updated.id;
    }

    const created = await prisma.adminAuditLog.create({
      data: {
        actorId: actor.id,
        actorEmail: actor.email,
        actorName: actor.name,
        action,
        targetType,
        targetId,
        status: 'FAILED',
        errorCode,
        before: toJsonColumn(before),
        metadata: toJsonColumn(metadata),
      },
      select: { id: true },
    });

    return created.id;
  } catch (err) {
    console.error('[ADMIN_AUDIT_ERROR] Failed to fail audit entry:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Read path
//
// Deliberately NOT best-effort: swallowing a read failure and returning an
// empty page renders a broken audit store as a healthy empty table. Errors
// propagate so the route answers 5xx instead of pretending there is no history.
// ---------------------------------------------------------------------------

export interface GetAdminAuditLogsOptions {
  page?: number;
  limit?: number;
  targetType?: string;
  targetId?: string;
  action?: string;
}

export async function getAdminAuditLogs({
  page = 1,
  limit = 20,
  targetType,
  targetId,
  action,
}: GetAdminAuditLogsOptions = {}) {
  const skip = (page - 1) * limit;
  const where: {
    targetType?: string;
    targetId?: string;
    action?: string;
  } = {};

  if (targetType) where.targetType = targetType;
  if (targetId) where.targetId = targetId;
  if (action) where.action = action;

  const [items, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    limit,
    hasMore: skip + items.length < total,
  };
}
