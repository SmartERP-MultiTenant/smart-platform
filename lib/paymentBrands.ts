/**
 * Landing trust-strip gateway marks (P2.15 `86cbbpyhu` + PG-22 `123q2bpew2e`).
 *
 * The strip used to render a hardcoded `PAYMENT_BRANDS` array, so it could
 * diverge from what the ERP actually offers at checkout (it still advertised
 * `Samsung Pay`, which was skipped at GO-LIVE 5.7 — P2.10). It now derives its
 * marks from the live ERP method catalogue through the public BFF
 * (`GET /api/public/erp/methods`), and this module owns the one thing that
 * makes that safe: what to render when the catalogue *cannot be read*.
 *
 * ## The rule (and why it is two-sided)
 *
 * Two tickets pull in opposite directions here, so the rule is split by whether
 * we actually learned anything from the catalogue:
 *
 * 1. **A catalogue we could read is authoritative.** If the payload yields at
 *    least one well-formed entry, only entries with `available === true` are
 *    advertised (PG-22: "hide unavailable methods"). A method the ERP says is
 *    unavailable is never shown, and if *none* is available the strip renders
 *    no marks at all — `source: 'none'`. This is the honest outcome: we know
 *    the answer, and the answer is "don't claim these".
 * 2. **A catalogue we could not read teaches us nothing**, so we fall back to
 *    the owner-approved mark set — `source: 'fallback'` (P2.15: "degrades
 *    gracefully … never a broken layout"). That covers: the request failing,
 *    a non-2xx response (the fetcher throws), a body that is not an array, an
 *    empty array, and an array whose every entry is malformed.
 *
 * An empty array deliberately counts as *unreadable* rather than as "the ERP
 * offers nothing": the ERP's own catalogue contract always returns its method
 * list (six entries), so an empty list means something upstream is degenerate,
 * not that the platform accepts no payment at all.
 *
 * `available` is read **fail-closed** — only the literal `true` counts as
 * available. A missing, `null`, stringy or otherwise unrecognised value makes
 * the method unavailable, so a contract change in the ERP can only ever
 * *withhold* a mark, never invent one. (A parallel PR is adding zod validation
 * to the `/methods` route; this module tolerates both the validating and the
 * unvalidated shape.)
 */

/** How the rendered mark set was decided. */
export type TrustStripBrandSource = 'erp' | 'fallback' | 'none';

export interface TrustStripBrand {
  /** Stable React key. Falls back to the label when the ERP omits `key`. */
  key: string;
  /** Display text. This is the mark — an icon is decoration on top of it. */
  label: string;
  /** Validated `https:` icon URL, when the ERP supplied a usable one. */
  iconUrl?: string;
}

export interface TrustStripBrands {
  source: TrustStripBrandSource;
  brands: TrustStripBrand[];
}

/**
 * Owner-approved marks, used only when the live catalogue cannot be read.
 *
 * `Samsung Pay` is deliberately absent: P2.10 closed with Samsung Pay skipped
 * at GO-LIVE 5.7 and PG-45 `123q2bpew31` tracks the claim. Do not re-add it
 * without an owner decision.
 */
export const FALLBACK_PAYMENT_BRANDS: readonly string[] = [
  'Mastercard',
  'Visa',
  'mada',
  'Apple Pay',
  'stc pay',
  'tabby',
  'tamara',
];

/**
 * A malformed catalogue row must not be able to stretch a chip across the
 * strip. Same bound the modules normalizer uses (`pages/api/teams/[slug]/erp.ts`).
 */
const MAX_LABEL_LENGTH = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Unwrap the BFF envelope. `pages/api/public/erp/methods.ts` answers
 * `{ data: methods }`; a bare array is accepted too so the parser does not
 * depend on the envelope surviving a future proxy change.
 */
function readCatalogueList(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload) && Array.isArray(payload.data)) return payload.data;
  return null;
}

function readIconUrl(entry: Record<string, unknown>): string | undefined {
  const raw = entry.iconUrl;
  if (typeof raw !== 'string') return undefined;

  try {
    const url = new URL(raw.trim());
    // The ERP supplies this URL, so it is not trusted input. Only `https:` is
    // accepted: a `data:` icon would be attacker-controlled markup in our DOM,
    // and a non-absolute URL would resolve against our own origin. A rejected
    // icon never drops the mark — the label still renders.
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

interface ParsedEntry {
  brand: TrustStripBrand;
  available: boolean;
}

/** `null` means the row is malformed — it proves nothing about availability. */
function parseEntry(entry: unknown): ParsedEntry | null {
  if (!isRecord(entry)) return null;

  const rawLabel = entry.label;
  if (typeof rawLabel !== 'string') return null;

  const label = rawLabel.trim();
  if (!label || label.length > MAX_LABEL_LENGTH) return null;

  const rawKey = entry.key;
  const key =
    typeof rawKey === 'string' && rawKey.trim() ? rawKey.trim() : label;

  const iconUrl = readIconUrl(entry);

  return {
    brand: iconUrl ? { key, label, iconUrl } : { key, label },
    // Fail-closed: only the literal `true` proves availability.
    available: entry.available === true,
  };
}

function fallbackBrands(): TrustStripBrands {
  return {
    source: 'fallback',
    brands: FALLBACK_PAYMENT_BRANDS.map((label) => ({
      key: `fallback:${label}`,
      label,
    })),
  };
}

/**
 * Decide which gateway marks the trust strip renders, from the raw body of
 * `GET /api/public/erp/methods` (or `undefined` while it is still loading, or
 * after it failed).
 *
 * Never throws, never returns `undefined`, and never returns an empty
 * `fallback` set — the caller can render the result unconditionally.
 */
export function resolveTrustStripBrands(payload: unknown): TrustStripBrands {
  const list = readCatalogueList(payload);

  // Unreadable catalogue: no envelope, no array, or nothing in it.
  if (!list || list.length === 0) return fallbackBrands();

  const entries: ParsedEntry[] = [];
  for (const entry of list) {
    const parsed = parseEntry(entry);
    if (parsed) entries.push(parsed);
  }

  // Every row was malformed — we learned nothing, so this is not an answer.
  if (entries.length === 0) return fallbackBrands();

  // At least one row parsed: the catalogue is authoritative from here on.
  const brands: TrustStripBrand[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!entry.available) continue;

    const dedupeKey = entry.brand.label.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    brands.push(entry.brand);
  }

  return brands.length > 0
    ? { source: 'erp', brands }
    : { source: 'none', brands: [] };
}

export default resolveTrustStripBrands;
