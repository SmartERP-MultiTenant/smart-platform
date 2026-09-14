import type { NextApiResponse } from 'next';

import { classifyErpError } from '@/lib/erp';
import { paymentErrorCodeFromUpstream } from '@/lib/payments/errorCopy';

/**
 * The public funnel's BFF error responder (PG-52).
 *
 * ## The defect
 *
 * All four public ERP routes ended with the same catch-all:
 *
 * ```ts
 * const message = error.message || 'Something went wrong';
 * res.status(error.status || 500).json({ error: { message } });
 * ```
 *
 * `ErpApiError.message` is lifted **verbatim from the ERP response body**
 * (`lib/erp.ts`, the `!res.ok` branch), so this published upstream internals —
 * raw ERP failure text, and whatever an upstream HTML error page happened to
 * say — to any anonymous caller of an unauthenticated endpoint. It also
 * contradicted the platform's own documented contract
 * (`{ error: { message: '<safe-error-code>' } }`), which every admin route
 * already honours through `classifyErpError`.
 *
 * ## The fix
 *
 * One responder, so the four routes cannot drift apart:
 *
 *  1. `classifyErpError` maps the failure onto a stable `{ status, code }`.
 *     It already exists, is fully unit-tested (`erp-classifier.spec.ts`), and
 *     is what the admin surface uses.
 *  2. `paymentErrorCodeFromUpstream` upgrades that code to a more specific one
 *     for the small closed set of upstream sentences the customer-facing UI has
 *     distinct copy for. This is the ONLY place upstream text is read, and it
 *     returns a code — never the text.
 *  3. The response body is exactly `{ error: { message: '<code>' } }`.
 *
 * There is no path through this function that puts upstream text, a stack
 * trace, a SQL fragment or an ERP record in the response.
 */

/**
 * The public code for a failure, plus the HTTP status to answer with.
 *
 * Split from the responder so it is testable without a fake `res`, and so the
 * vocabulary can be audited against `lib/payments/errorCopy.ts`.
 */
export function publicPaymentError(error: unknown): {
  status: number;
  code: string;
} {
  const { status: classifiedStatus, code: classifiedCode } =
    classifyErpError(error);

  const status = publicStatus(error, classifiedStatus, classifiedCode);

  // Only a failure the ERP itself answered with a 4xx can carry a message worth
  // reading. A 5xx means either the ERP was never reached (503) or the failure
  // could not be attributed (502), and the message in those cases is a
  // transport/`ERR_*` string or an upstream body we already refused to trust —
  // matching prose against it would be matching against exactly the text the
  // leak fix exists to stop reading. This guard is what keeps the allow-list
  // from ever widening into the unsafe class.
  const specific =
    classifiedStatus < 500
      ? paymentErrorCodeFromUpstream(
          (error as { message?: unknown } | null)?.message
        )
      : null;

  return { status, code: specific ?? classifiedCode };
}

/**
 * The HTTP status the public funnel answers with.
 *
 * `classifyErpError` deliberately collapses an upstream **401/403 to 502**, and
 * documents why: an ADMIN UI that receives a 401 typically treats it as "your
 * session expired" and logs the operator out of a perfectly healthy session.
 *
 * That reason does not exist on this surface — the four public ERP routes are
 * unauthenticated and carry no session to expire — while the funnel's own client
 * contract very much does. `pages/payment/success.tsx:55-59` splits a non-2xx
 * into "**4xx other than 429** is a permanent client-side rejection" and
 * "429 or any 5xx is transient", and a transient failure falls through to the
 * optimistic settle. Adopting the 502 unmodified would therefore move an
 * upstream auth failure from the honest `error` panel into the success panel,
 * silently changing a branch the poller was built around.
 *
 * So the upstream 4xx is preserved — but ONLY for the failure the classifier
 * actually moved. `erp-auth-failed` is produced by exactly one branch of
 * `classifyErpError` (an `ErpApiError` whose status is 401 or 403), so keying on
 * the CODE rather than re-deriving the error's type confines this to that single
 * case without duplicating the classifier's own `instanceof`/`name` detection —
 * which is the sort of duplicated check that drifts. An arbitrary thrown object
 * carrying a spoofed `status: 401` classifies as `erp-upstream-failure` and is
 * therefore left alone, refused, at 502.
 */
const publicStatus = (
  error: unknown,
  classifiedStatus: number,
  classifiedCode: string
): number => {
  if (classifiedCode !== 'erp-auth-failed') return classifiedStatus;

  const upstreamStatus = (error as { status?: unknown } | null)?.status;

  return upstreamStatus === 401 || upstreamStatus === 403
    ? upstreamStatus
    : classifiedStatus;
};

/**
 * Answers a public ERP BFF failure with a stable code.
 *
 * Every public ERP route's catch block must call this instead of reading
 * `error.message` directly.
 */
export function respondErpError(res: NextApiResponse, error: unknown): void {
  const { status, code } = publicPaymentError(error);

  res.status(status).json({ error: { message: code } });
}
