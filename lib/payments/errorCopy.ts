/**
 * Payment error taxonomy for the public funnel (PG-54).
 *
 * ## The problem this replaces
 *
 * The funnel's only error mapping lived **inside the component**, as a matcher
 * over raw upstream prose (`components/erp/PaymentActivation.tsx:44-54`): two
 * `String.includes()` cases and a `return raw` fallback that rendered whatever
 * string arrived, verbatim, in both locales. Three consequences:
 *
 *  - the mapping is untestable in isolation and invisible to every other
 *    consumer of the same response;
 *  - the fallback renders an ERP error message — English, and lifted straight
 *    from the upstream body — into an Arabic UI;
 *  - any new failure mode silently inherits "show the raw string".
 *
 * ## The shape of the fix
 *
 * Normalise ONCE, at the boundary. `pages/api/public/erp/*` now answers with a
 * stable `{ error: { message: '<code>' } }` (see `publicErpError.ts`), and this
 * module maps that code to localized copy. Consumers never see upstream text,
 * never substring-match, and never decide what to render for an unknown failure.
 *
 * Two functions, deliberately separate:
 *
 *  - `paymentErrorCodeFromUpstream` runs **producer-side**, in the BFF, over the
 *    one place upstream prose still exists. It maps a CLOSED set of known
 *    upstream phrases onto public codes and returns `null` for everything else.
 *    This is the only surviving string comparison in the pipeline, and it is
 *    bounded, allow-listed and unit-tested. It exists because deleting it would
 *    lose real specificity: without it every 400 collapses to one generic code
 *    and the customer loses the "this method is not supported" / "the amount is
 *    wrong" distinction the component used to provide.
 *  - `paymentErrorCopy` runs **consumer-side**. It renders copy for a code, and
 *    for anything that is not a known code it returns `fallback` — never the
 *    input. That is the deliberate difference from `adminErrorCopy`
 *    (`lib/errors.ts`), which passes prose through so routes that still answer
 *    with human sentences keep rendering. No public payment route does.
 *
 * ## Why closures instead of a code -> key string map
 *
 * `check-locale.js` only recognises a key written as a quoted string literal
 * argument to the translator, so a plain `{ code: 'some-key' }` map would make
 * every key look unused and fail that CI gate. Each entry therefore renders
 * through a literal translation call whose only argument is that quoted key.
 * The same rule bites in reverse: a key merely MENTIONED in call syntax inside a
 * comment is read as a real key and reported as missing, so the call syntax is
 * never spelled out in prose here. Same precedent as `ADMIN_ERROR_COPY` in
 * `lib/errors.ts:143-190`.
 */

/** Translator shape used by every renderer below. */
type Translate = (key: string) => string;

/**
 * Single renderer for the three "the payment could not be completed and the
 * customer's only move is to retry" codes.
 *
 * They are kept as distinct codes (an operator reading a log or a support
 * ticket needs to tell an unreachable ERP from a gateway that answered with
 * nonsense) but they deliberately share one customer-facing sentence: to the
 * payer the remedy is identical, and inventing three subtly different Arabic
 * sentences for one action is how copy drifts.
 */
const gatewayFailure = (t: Translate) => t('erp-payment-gateway-error');

const PAYMENT_ERROR_COPY: Record<string, (t: Translate) => string> = {
  // --- Rate limiting (429) ---------------------------------------------------
  // `limiters.payments` / `limiters.verify` answered first, so the customer
  // never reached the ERP. Retrying is the correct action, which is why this is
  // not "gateway error".
  'too-many-requests': (t) => t('erp-payment-rate-limited'),

  // --- ERP / gateway reachability -------------------------------------------
  // 503 — the ERP was never reached, or the platform's own abort budget fired.
  'erp-unavailable': (t) => t('erp-payment-erp-unavailable'),
  // 502 — the ERP answered, but with a failure we cannot attribute further.
  'erp-upstream-failure': gatewayFailure,
  // 502 — an upstream auth failure. Mapped to 502 by `classifyErpError` so the
  // funnel is never told "your session expired"; to the customer this is still
  // "the gateway failed".
  'erp-auth-failed': gatewayFailure,
  // 502 — the ERP answered 2xx with a body that does not match the contract.
  // Never a success: see `lib/zod/erp.ts`.
  'erp-malformed-response': gatewayFailure,
  // Reserved: a gateway that accepted the order and then stopped answering.
  // Not emitted yet — nothing in the kit distinguishes a slow gateway from an
  // unreachable ERP. Declared so the follow-up that adds the distinction has a
  // code and a translation already waiting.
  'gateway-timeout': (t) => t('erp-payment-gateway-timeout'),

  // --- Request-level failures ------------------------------------------------
  // 400 — the ERP refused the request body. Deliberately generic: the specific
  // reason is in the ERP's own payload, which must never reach the browser.
  'erp-bad-request': (t) => t('erp-payment-invalid-request'),
  // 400 — the platform's own schema rejected the request before it left.
  'invalid-request': (t) => t('erp-payment-invalid-request'),
  // 400 — the two upstream 400s specific enough to be worth their own copy.
  // Both are produced by `paymentErrorCodeFromUpstream` below.
  'unsupported-payment-method': (t) => t('erp-payment-unsupported-method'),
  'invalid-amount': (t) => t('erp-payment-invalid-amount'),
  // Reserved: the requested method is absent from the ERP's *available*
  // catalogue. Not emitted yet — the availability contract is enforced on the
  // read path (`lib/erp.ts` `fetchAvailableMethods`) and the write path's check
  // belongs to PG-06's server-authoritative order creation. Declared here for
  // the same reason as `gateway-timeout`.
  'method-not-available': (t) => t('erp-payment-method-unavailable'),

  // --- Order-level failures --------------------------------------------------
  // 404 — the ERP has no record of that order reference.
  'erp-not-found': (t) => t('erp-payment-order-not-found'),
  // 400 — /verify answered without a usable reference. Same customer remedy as
  // "not found", so it shares the copy rather than adding a near-duplicate.
  'missing-reference': (t) => t('erp-payment-order-not-found'),
  // 409 — the ERP already holds this order. Retrying as-is would be wrong, so
  // this must NOT share the generic retry copy.
  'erp-conflict': (t) => t('erp-payment-duplicate-order'),
  // 422 — the gateway/ERP declined the payment.
  'erp-rejected': (t) => t('erp-payment-declined'),
};

/**
 * Upstream phrases that are specific enough to deserve their own public code.
 *
 * Bounded on purpose: entries are matched against the ERP's own 400 text, and
 * anything not listed falls through to the generic `erp-bad-request` code. Both
 * phrases are raised by the ERP's `PaymentService` and are the two cases the
 * component used to special-case.
 *
 * Matching is a case-insensitive substring test because the ERP composes these
 * sentences (`throw new Exception("Unsupported payment method: " + method)`),
 * so an equality test would miss the interpolated part while a substring test
 * still recognises the stable prefix.
 */
const UPSTREAM_MESSAGE_CODES: ReadonlyArray<readonly [string, string]> = [
  ['unsupported payment method', 'unsupported-payment-method'],
  ['amount must be greater than zero', 'invalid-amount'],
];

/**
 * Maps an upstream ERP failure message onto a public payment code, or `null`.
 *
 * PRODUCER-SIDE ONLY. The return value is a code from the closed vocabulary
 * above; the input message is never returned, echoed or logged, so a caller
 * cannot accidentally forward ERP text to the browser by using this function.
 */
export const paymentErrorCodeFromUpstream = (
  message: unknown
): string | null => {
  if (typeof message !== 'string' || !message) return null;

  const haystack = message.toLowerCase();

  for (const [phrase, code] of UPSTREAM_MESSAGE_CODES) {
    if (haystack.includes(phrase)) return code;
  }

  return null;
};

/**
 * Every code this map can render, sorted.
 *
 * Exposed so the taxonomy can be audited exhaustively rather than from a
 * hand-maintained list: `__tests__/lib/payments/errorCopy.spec.ts` diffs it
 * against the codes the public BFF can actually emit and against the keys the
 * locales define, in both directions. Same rationale as `adminErrorCodes`
 * (`lib/errors.ts:192-209`).
 */
export const paymentErrorCodes = (): string[] =>
  Object.keys(PAYMENT_ERROR_COPY).sort();

/** The i18n key a code renders, or `null` for an unknown code. */
export const paymentErrorCopyKey = (code: string): string | null => {
  const render = PAYMENT_ERROR_COPY[code];
  if (!render) return null;

  // Recover the key by running the renderer against an identity translator.
  return render((key) => key);
};

/**
 * Turns a public BFF `error.message` into display copy.
 *
 * - a known code → localized copy for that code
 * - **anything else → `fallback`**, including code-shaped tokens and prose
 *
 * `fallback` is already-resolved copy, not a key: call sites resolve it with the
 * translator themselves so their locale keys stay statically visible to
 * `check-locale.js`, which only recognises a key written as a quoted string
 * literal argument.
 */
export function paymentErrorCopy(
  value: string | null | undefined,
  t: Translate,
  fallback: string
): string {
  if (typeof value !== 'string') return fallback;

  const render = PAYMENT_ERROR_COPY[value.trim()];

  return render ? render(t) : fallback;
}
