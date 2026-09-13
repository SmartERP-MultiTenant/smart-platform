const API_ERROR_NAME = 'ApiError';

export class ApiError extends Error {
  status: number;

  /**
   * Opt-in permission to echo `message` on a 5xx.
   *
   * `message` is normally treated as an internal detail on a 5xx and replaced
   * with `internal-error`. Set `expose` when the message is not an internal
   * detail but a **stable, non-sensitive error code** the operator is meant to
   * act on — e.g. `new ApiError(503, 'erp-not-configured', { expose: true })`,
   * where hiding the code re-creates exactly the ambiguity the admin error
   * contract exists to remove (a misconfigured M2M key looks identical to a
   * genuine internal fault).
   *
   * This is deliberately opt-in: it is a door on one specific error, never a
   * loosening of the 5xx rule for everything else.
   */
  expose: boolean;

  constructor(
    status: number,
    message: string,
    options: { expose?: boolean } = {}
  ) {
    super(message);
    // Explicit, because `target: es5` strips the prototype chain (see
    // `isApiError`) — `name` is the only reliable in-band brand.
    this.name = API_ERROR_NAME;
    this.status = status;
    this.expose = options.expose === true;
  }
}

/**
 * ES5-safe `ApiError` detection.
 *
 * `tsconfig.json` sets `"target": "es5"`, where `class ApiError extends Error`
 * compiles to `_super.call(this, message) || this`. `Error` called as a plain
 * function returns a *new* `Error`, so the returned object's prototype is
 * `Error.prototype` and `instanceof ApiError` is **false** for genuine
 * instances. `instanceof` alone would silently never match, which on this
 * function means a deliberate error code would be swallowed rather than
 * exposed. Same precedent as `classifyErpError` in `lib/erp.ts`.
 */
const isApiError = (error: unknown): error is ApiError => {
  if (error instanceof ApiError) return true;

  const candidate = error as { name?: unknown; status?: unknown } | null;

  return (
    !!candidate &&
    typeof candidate === 'object' &&
    candidate.name === API_ERROR_NAME &&
    typeof candidate.status === 'number'
  );
};

/**
 * Returns `error.status` when the thrown error carries an HTTP status (e.g.
 * `ApiError`), 500 otherwise. Keeps error responses bounded: internal details
 * never leak to clients.
 */
export const apiErrorStatus = (error: unknown): number =>
  typeof (error as { status?: unknown } | null)?.status === 'number'
    ? (error as { status: number }).status
    : 500;

/**
 * A pure kebab-case token — i.e. a stable error code, not display copy.
 *
 * Distinguishing the two matters twice over. Several admin routes still answer
 * with human sentences (`'Invalid plan ID'`, `'Unauthorized'`, `'Method POST Not
 * Allowed'`) and those must keep rendering exactly as before — a sentence fails
 * this test (spaces or capitals). And as of the `expose` guardrail below it is
 * also what decides whether a flagged 5xx message may be echoed: being marked
 * `expose` is a *claim* that the message is a code, and this predicate is the
 * check that the claim is true rather than taken on trust.
 */
const ERROR_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isAdminErrorCode = (value: string): boolean =>
  ERROR_CODE_PATTERN.test(value);

/**
 * Only 4xx `ApiError` messages are safe to echo to clients; any 5xx (or
 * non-ApiError) failure is collapsed to a stable `internal-error` token so
 * Prisma/SDK internals never reach the response body.
 *
 * The single exception is a 5xx `ApiError` explicitly constructed with
 * `{ expose: true }`, whose message is a stable action code rather than an
 * internal detail. Every other 5xx — flagged or not, `ApiError` or not — still
 * collapses to `internal-error`.
 *
 * `expose` is a *claim*, so it is verified rather than trusted: the message
 * must actually be code-shaped (`isAdminErrorCode`). A caller that flags a 5xx
 * carrying prose, a stack fragment or an upstream body therefore still collapses
 * to `internal-error`, so the flag cannot be used — by accident or by a future
 * edit — to switch the 5xx rule off for an arbitrary message. Behaviour for
 * every current construction is unchanged, because `erp-not-configured` and
 * `internal-error` are both code-shaped.
 */
export const apiErrorMessage = (error: unknown): string => {
  if (
    isApiError(error) &&
    error.expose &&
    typeof error.message === 'string' &&
    isAdminErrorCode(error.message)
  ) {
    return error.message;
  }

  const status = apiErrorStatus(error);
  return status < 500 && error instanceof Error && error.message
    ? error.message
    : 'internal-error';
};

/**
 * Renderer for each stable admin API error code.
 *
 * Admin routes answer with `{ error: { message: '<safe-error-code>' } }`, so a
 * component that renders `error.message` verbatim shows the operator a raw
 * token (`erp-not-configured`) instead of a sentence. Components map the code
 * through `adminErrorCopy` so the copy stays localized (AR/EN) and no token ever
 * reaches the screen. Codes mirror `classifyErpError` (`lib/erp.ts`) plus the
 * literal codes the admin routes raise themselves.
 *
 * Each entry is a closure rather than a bare key string on purpose: the
 * literal translation call is what keeps every key visible to `check-locale.js`,
 * whose scanner only recognises a key written as a quoted string literal
 * argument. A plain `code -> key-name` string map would make every key look
 * unused and fail that CI gate.
 *
 * Adding an entry: keep the key in the `admin-error-<code>` shape, and make the
 * renderer body a translation call whose only argument is a quoted string
 * literal. The scanner reads source text for that exact form, so a key reached
 * through a variable — or merely *mentioned* in a comment in call syntax — is
 * either reported unused or mistaken for a real key and put the gate in a false
 * failure state.
 */
const ADMIN_ERROR_COPY: Record<string, (t: (key: string) => string) => string> =
  {
    'erp-not-configured': (t) => t('admin-error-erp-not-configured'),
    // Emitted by `pages/api/admin/revenue.ts` in its degraded (200) payload, not
    // by `classifyErpError`. It is a *second spelling* of the "ERP not
    // reachable" state the router already has as `erp-unavailable`; the map
    // carries both so no reachable code renders as generic copy. The
    // duplication is a tracked follow-up.
    'erp-unreachable': (t) => t('admin-error-erp-unreachable'),
    'erp-unavailable': (t) => t('admin-error-erp-unavailable'),
    'erp-auth-failed': (t) => t('admin-error-erp-auth-failed'),
    'erp-upstream-failure': (t) => t('admin-error-erp-upstream-failure'),
    'erp-malformed-response': (t) => t('admin-error-erp-malformed-response'),
    'erp-bad-request': (t) => t('admin-error-erp-bad-request'),
    'erp-not-found': (t) => t('admin-error-erp-not-found'),
    'erp-conflict': (t) => t('admin-error-erp-conflict'),
    'erp-rejected': (t) => t('admin-error-erp-rejected'),
    'team-not-found': (t) => t('admin-error-team-not-found'),
    'erp-not-linked': (t) => t('admin-error-erp-not-linked'),
    'invalid-team-id': (t) => t('admin-error-invalid-team-id'),
    // Raised when the plan rules path segment is not a UUID. Unlike the other
    // validation codes this is not operator error — the admin UI builds that
    // segment from a plan it just listed — so the copy points at refreshing and
    // reporting rather than at something the operator typed.
    'invalid-plan-id': (t) => t('admin-error-invalid-plan-id'),
    // Codes the validation layer raises. Both were already emitted by admin
    // schemas but had no entry, so nothing could turn them into copy.
    'invalid-package-id': (t) => t('admin-error-invalid-package-id'),
    // Raised by the rules plan-save schema for a malformed `systemModuleIds`.
    // Previously the schema shipped the prose sentence "systemModuleIds must be
    // an array of GUIDs", which is not code-shaped, so the operator got generic
    // copy instead of guidance.
    'invalid-system-module-ids': (t) =>
      t('admin-error-invalid-system-module-ids'),
    'end-date-must-be-after-start-date': (t) =>
      t('admin-error-end-date-must-be-after-start-date'),
    // The deliberate platform-side refusals, plus the malformed-date code the
    // two date-guarded routes raise. Without an entry the UI falls through to a
    // generic "the action failed", so an operator cannot tell "this
    // subscription is not cancellable" from "the ERP is down" — exactly the
    // ambiguity this map exists to remove.
    'subscription-not-active': (t) => t('admin-error-subscription-not-active'),
    'invalid-iso-date': (t) => t('admin-error-invalid-iso-date'),
    'end-date-not-in-future': (t) => t('admin-error-end-date-not-in-future'),
    'end-date-not-after-current-end': (t) =>
      t('admin-error-end-date-not-after-current-end'),
    'internal-error': (t) => t('admin-error-internal-error'),
  };

/**
 * Every code this map can render, sorted.
 *
 * Exists so the code-to-copy contract can be audited *exhaustively* rather than
 * from a hand-maintained list that drifts the moment someone adds a route. The
 * covering test (`__tests__/lib/adminErrorCodes.spec.ts`) diffs this against the
 * codes the admin routes can actually emit, in both directions:
 *
 *   - a reachable code with no entry renders generic copy (the defect this map
 *     exists to prevent)
 *   - an entry with no reachable producer is dead copy that implies coverage a
 *     reader does not actually get
 *
 * Without an accessor the map is opaque to tests, so the previous check could
 * only assert about codes someone had remembered to list by hand.
 */
export const adminErrorCodes = (): string[] =>
  Object.keys(ADMIN_ERROR_COPY).sort();

export const adminErrorCopyKey = (code: string): string | null => {
  const render = ADMIN_ERROR_COPY[code];
  if (!render) return null;

  // Recover the key by running the renderer against an identity translator.
  return render((key) => key);
};

/**
 * The wrapper `lib/zod/index.ts` puts in front of every schema message.
 *
 * `validateWithSchema` builds each 422 as `Validation Error: <message>`, where
 * the message is meant to be a stable code (`invalid-package-id`,
 * `invalid-iso-date`, …). The wrapper is what made those codes unreachable by
 * this map: the wrapped string has a space and a capital, so it is not
 * code-shaped, so the first version of `adminErrorCopy` classified it as prose
 * and rendered it verbatim — showing an operator the raw English fragment
 * `Validation Error: invalid-package-id` in both locales.
 *
 * The wrapper is unwrapped here, where it is *consumed*, rather than fixed at
 * its source on purpose. Changing `validateWithSchema` would alter the response
 * body of every validating route in the repo — the public funnel and the
 * payment routes included — and this function is the only shared piece those
 * surfaces do NOT import.
 */
const VALIDATION_ERROR_PREFIX = 'Validation Error:';

/**
 * The code inside a `Validation Error: <code>` wrapper, or `null`.
 *
 * `null` covers both "not a wrapper" and "a wrapper whose payload is not a
 * code" (e.g. a schema that still ships prose such as
 * `Validation Error: Token is required`). The caller treats the two
 * identically: neither may be shown to an operator.
 */
const unwrapValidationCode = (value: string): string | null => {
  if (!value.startsWith(VALIDATION_ERROR_PREFIX)) return null;

  const code = value.slice(VALIDATION_ERROR_PREFIX.length).trim();

  return isAdminErrorCode(code) ? code : null;
};

/**
 * Turns whatever an admin route put in `error.message` into display copy.
 *
 * - a known error code → localized copy for that code
 * - an unknown code-shaped token → `fallback` (never render the raw token)
 * - a `Validation Error: <code>` wrapper → that code's copy, else `fallback`
 * - any other message carrying the wrapper → `fallback`, never verbatim
 * - a human sentence → passed through untouched, so routes that still return
 *   prose keep rendering as they do today
 * - empty, whitespace-only or absent → `fallback`
 *
 * `fallback` is **already-resolved copy**, not a key: call sites resolve it
 * with the translator themselves so their locale keys stay statically visible
 * to `check-locale.js`, which only recognises a key written as a quoted string
 * literal argument.
 */
export function adminErrorCopy(
  value: string | null | undefined,
  t: (key: string) => string,
  fallback: string
): string {
  if (typeof value === 'string' && value) {
    const trimmed = value.trim();

    // Tested with `includes`, not `startsWith`, on purpose. A message that
    // merely *carries* the wrapper — `save failed. Validation Error: …` — is
    // still a message with a technical fragment in it, and the contract here is
    // that no such fragment is ever rendered. Only a message that actually
    // begins with the wrapper can yield a code; every other carrier of the
    // phrase falls through to `fallback`.
    if (trimmed.includes(VALIDATION_ERROR_PREFIX)) {
      const code = unwrapValidationCode(trimmed);
      const render = code ? ADMIN_ERROR_COPY[code] : undefined;

      return render ? render(t) : fallback;
    }

    const render = ADMIN_ERROR_COPY[trimmed];
    if (render) return render(t);

    // The `trimmed` guard is what makes "effectively empty" behave like absent.
    //
    // The outer guard tests the *raw* value for truthiness, and a
    // whitespace-only string is truthy, so `'   '` reaches this point. `''` is
    // not code-shaped, so the prose passthrough used to hand back `value` — the
    // raw whitespace — and the caller rendered a blank line instead of the
    // generic message. Passthrough deliberately keeps the ORIGINAL (untrimmed)
    // string, so real prose with surrounding whitespace is still returned
    // byte-for-byte; only a value that trims away to nothing is treated as
    // absent rather than as prose.
    if (trimmed && !isAdminErrorCode(trimmed)) return value;
  }

  return fallback;
}
