import { z } from 'zod';

/**
 * Stable, machine-usable validation codes for the admin API.
 *
 * `validateWithSchema` (`lib/zod/index.ts`) surfaces `error.errors[0].message`
 * verbatim inside the 422 body, so these strings are part of the admin
 * contract — clients and tests match on them. Do not reword casually.
 */
export const ADMIN_INVALID_DATE = 'invalid-iso-date';
export const ADMIN_END_BEFORE_START = 'end-date-must-be-after-start-date';

/**
 * Reused rather than duplicated for "packageId is missing/empty".
 *
 * The value previously shipped prose (`'Package ID is required'`), so it was
 * not code-shaped and `adminErrorCopy` could not turn it into copy — the
 * operator got the generic "action failed" banner. An absent packageId and a
 * malformed one are the same operator-facing problem (no usable package was
 * selected) and the existing copy already tells them what to do, so a second
 * near-duplicate code would add a map entry and two locale keys without adding
 * meaning.
 */
export const ADMIN_INVALID_PACKAGE_ID = 'invalid-package-id';

/**
 * The only two shapes accepted by the admin date fields:
 *
 *   - date-only  `YYYY-MM-DD`
 *   - date-time  `YYYY-MM-DDThh:mm[:ss[.fraction]](Z|±hh:mm)`
 *
 * Both are fully anchored — a trailing any-suffix match is what previously let
 * `'2026-01-01garbage'` through. The date-time form requires an explicit
 * timezone designator so the instant is never ambiguous; ISO-8601 permits
 * omitting the seconds, so they stay optional.
 */
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?([Zz]|[+-]\d{2}:\d{2})$/;

/** Widest real UTC offset in use (+14:00, Kiritimati). */
const MAX_TZ_OFFSET_HOURS = 14;

/**
 * Real-calendar-date check — a shape-only regex is not enough.
 *
 * Rejects impossible dates such as `2026-13-45`, `2026-02-30` and
 * `0000-00-00` by round-tripping the triple through `Date.UTC` and requiring
 * the components to survive unchanged (`2026-02-30` normalises to March 2nd,
 * so it fails).
 */
const isRealCalendarDate = (
  year: number,
  month: number,
  day: number
): boolean => {
  // `Date.UTC` maps years 0-99 onto 1900-1999, so constrain the range up front
  // rather than trusting the round-trip for those. Real subscription dates sit
  // far inside it, and this also rejects `'0000-00-00'`.
  if (year < 100 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const utc = new Date(Date.UTC(year, month - 1, day));

  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
};

/**
 * Strict ISO-8601 parser for admin-supplied dates.
 *
 * Returns the epoch in milliseconds, or `null` when the value is not one of
 * the two shapes documented above.
 *
 * `Date.parse` is deliberately NOT used: it accepts `'March 5, 2026'`,
 * `'2026/1/1'`, `'2026'` and `'Jan 1'`, which were previously forwarded to the
 * ERP verbatim with timezone-dependent meaning. The instant is computed from
 * the parsed components instead, so the result never depends on the host
 * runtime's fuzzy date grammar.
 */
export const parseStrictIsoDate = (value: string): number | null => {
  if (typeof value !== 'string') return null;

  const dateOnly = DATE_ONLY_PATTERN.exec(value);

  if (dateOnly) {
    const [, year, month, day] = dateOnly;

    return isRealCalendarDate(Number(year), Number(month), Number(day))
      ? Date.UTC(Number(year), Number(month) - 1, Number(day))
      : null;
  }

  const dateTime = DATE_TIME_PATTERN.exec(value);

  if (!dateTime) return null;

  const [, year, month, day, hour, minute, second, fraction, zone] = dateTime;

  if (!isRealCalendarDate(Number(year), Number(month), Number(day))) {
    return null;
  }

  if (Number(hour) > 23) return null;
  if (Number(minute) > 59) return null;
  // 60 is a leap second; `Date.UTC` normalises it into the next minute.
  if (second !== undefined && Number(second) > 60) return null;

  let offsetMinutes = 0;

  if (zone !== 'Z' && zone !== 'z') {
    const sign = zone.startsWith('-') ? -1 : 1;
    const [offsetHour, offsetMinute] = zone.slice(1).split(':');

    if (Number(offsetHour) > MAX_TZ_OFFSET_HOURS) return null;
    if (Number(offsetMinute) > 59) return null;

    offsetMinutes = sign * (Number(offsetHour) * 60 + Number(offsetMinute));
  }

  const millis = fraction ? Math.round(Number(`0.${fraction}`) * 1000) : 0;

  // `Date.UTC` reads the component triple as UTC, so the declared offset is
  // subtracted to recover the real instant:
  // `2026-01-01T00:00:00+03:00` is `2025-12-31T21:00:00Z`.
  return (
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      second ? Number(second) : 0,
      millis
    ) -
    offsetMinutes * 60_000
  );
};

/** `true` when `value` is one of the two accepted strict ISO-8601 shapes. */
export const isStrictIsoDate = (value: string): boolean =>
  parseStrictIsoDate(value) !== null;

/**
 * The single date field shared by every admin subscription schema: a trimmed,
 * non-empty, strictly-parsed ISO-8601 date or date-time.
 *
 * Trimming happens before the emptiness check, so whitespace-only input is
 * rejected rather than silently forwarded.
 */
export const strictIsoDateString = z
  .string({
    required_error: ADMIN_INVALID_DATE,
    invalid_type_error: ADMIN_INVALID_DATE,
  })
  .trim()
  .min(1, ADMIN_INVALID_DATE)
  .refine(isStrictIsoDate, ADMIN_INVALID_DATE);

export const addSubscriptionSchema = z
  .object({
    // `required_error`/`invalid_type_error` are set, not just the `min` message.
    // Without them zod supplies its OWN default prose — `Required`, `Expected
    // string, received number` — which is not code-shaped, so `adminErrorCopy`
    // cannot map it and an absent or wrongly-typed field would report the
    // generic "action failed" banner while an empty string reported the precise
    // code. Same three-way coverage `strictIsoDateString` already has.
    packageId: z
      .string({
        required_error: ADMIN_INVALID_PACKAGE_ID,
        invalid_type_error: ADMIN_INVALID_PACKAGE_ID,
      })
      .min(1, ADMIN_INVALID_PACKAGE_ID),
    startDate: strictIsoDateString.optional(),
    endDate: strictIsoDateString.optional(),
    trialDays: z.number().int().min(0).max(365).optional(),
    isTrial: z.boolean().optional().default(false),
  })
  .refine(
    ({ startDate, endDate }) => {
      if (!startDate || !endDate) return true;

      const start = parseStrictIsoDate(startDate);
      const end = parseStrictIsoDate(endDate);

      // Unparseable values are the field-level refine's job to report; skip
      // here so the caller sees one precise error, not two.
      if (start === null || end === null) return true;

      return end > start;
    },
    { message: ADMIN_END_BEFORE_START, path: ['endDate'] }
  );

export const extendSubscriptionSchema = z.object({
  newEndDate: strictIsoDateString,
});

export const trialOverrideSchema = z.object({
  newTrialEndDate: strictIsoDateString,
});

export const cancelSubscriptionSchema = z.object({
  reason: z.string().max(500).optional(),
});
