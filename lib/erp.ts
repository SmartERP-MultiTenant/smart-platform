import env from '@/lib/env';
import {
  erpPackageSchema,
  erpPaymentMethodSchema,
  erpVerifyResponseSchema,
  readErpList,
  type ErpBillingCycle,
  type ErpPackageContract,
  type ErpPaymentMethodContract,
  type ErpVerifyResponseContract,
} from '@/lib/zod/erp';
import type { z } from 'zod';

export interface ErpPackage {
  id: string;
  name: string;
  description?: string;
  priceMonthly?: number;
  priceYearly?: number;
  trialDays?: number;
  isActive?: boolean;
  [k: string]: unknown;
}

export interface ErpSystemModule {
  id: string;
  code: string;
  name: string;
  description?: string;
  priceMonthly?: number;
  priceYearly?: number;
  isActive?: boolean;
  [k: string]: unknown;
}

export interface ErpPackageSummaryModule {
  id: string;
  code: string;
  name: string;
}

export interface ErpPackageDetailed extends ErpPackage {
  systemModules?: ErpPackageSummaryModule[];
  systemModuleCodes?: string[];
}

export interface ErpAvailability {
  available: boolean;
}

export interface ErpRegistrationRequest {
  companyName: string;
  subdomain: string;
  adminEmail: string;
  adminUserName: string;
  adminPassword: string;
  phoneNumber?: string;
  packageId: string;
  trialDays: number;
}

export interface ErpRegistrationResult {
  success: boolean;
  message?: string;
  tenantId?: string;
  adminUserId?: string;
  subdomain?: string;
  redirectTo?: string;
  authToken?: string;
  expiresIn?: string;
}

export interface ErpPaymentMethod {
  key: string;
  label: string;
  provider: string;
  available: boolean;
  iconUrl?: string;
}

/**
 * Re-exported so client modules (the funnel component) take the cycle type from
 * the module they already import, without reaching into the zod layer. The
 * definition lives in `lib/zod/erp.ts` — do not re-spell it here.
 */
export type { ErpBillingCycle };

export interface ErpPaymentRequest {
  orderReference: string;
  amount: number;
  currency?: string;
  billingCycle?: ErpBillingCycle;
  /**
   * PG-31 — the package being purchased, so the ERP can validate the price it
   * is asked to charge. OPTIONAL on purpose: the platform sends it, but the ERP
   * does not read it until the ERP half lands, and the field is additive rather
   * than a new obligation on every caller of `createPayment`.
   */
  packageId?: string;
  paymentMethod: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  description?: string;
  callbackUrl?: string;
}

export interface ErpPaymentResult {
  paymentUrl?: string | null;
  externalId?: string | null;
  provider?: string;
  status?: string;
  internalId?: string | null;
}

export interface ErpVerifyResult {
  success: boolean;
  status?: 'Pending' | 'Paid' | 'Failed';
}

export interface ErpLoginResult {
  authToken?: string;
  userId?: string;
  otpId?: string;
  tenantId?: string | null;
  isSuperAdmin?: boolean;
  activeModules?: string[];
  expiresIn?: string;
}

export interface ErpSubscriptionStatus {
  status?: string;
  isTrial?: boolean;
  daysRemaining?: number;
  endDate?: string | null;
  needsWarning?: boolean;
}

export interface ErpChangePlanResponse {
  subscriptionId: string;
  tenantId: string;
  oldPackageId?: string | null;
  oldPackageName?: string | null;
  targetPackageId: string;
  targetPackageName: string;
  oldPriceMonthly: number;
  newPriceMonthly: number;
  priceDifference: number;
  requiresPayment: boolean;
  applied: boolean;
  status: string;
  endDate?: string | null;
  enabledModules: Array<{ id: string; code: string; name: string }>;
  enabledModuleCodes: string[];
  message: string;
}

/**
 * Stable, machine-readable marker for ERP failures that are NOT distinguishable
 * by HTTP status alone. Today the only member is a 2xx response whose body
 * cannot be parsed as JSON.
 */
export type ErpApiErrorCode = 'ERP_MALFORMED_RESPONSE';

export class ErpApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: ErpApiErrorCode
  ) {
    super(message);
    this.name = 'ErpApiError';
  }
}

interface ErpErrorPayload {
  error?: string | { message?: string };
  message?: string;
}

/**
 * Bounded budget for every platform→ERP M2M MUTATION (create / extend / cancel /
 * trial-override / change-plan / package-modules / sync-modules).
 *
 * Reads already carry abort budgets of their own (`adminDashboard.ts` pins
 * `ERP_ROW_TIMEOUT_MS`). Mutations carried none, so a hung ERP socket stalled an
 * admin route for undici's multi-minute default while the operator stared at a
 * disabled button. Mutations write to the ERP database and can fan out — a
 * package-module update may re-sync every subscription of that package — so the
 * budget is deliberately larger than the 3s read budget, while still bounded.
 */
export const ERP_MUTATION_TIMEOUT_MS = 15_000;

/**
 * Bounded budget for the platform→ERP M2M **read** a route performs to build its
 * audit snapshots — the `before`/`after` subscription reads in
 * `pages/api/admin/subscriptions/**`.
 *
 * Unlike `m2mMutationInit`, this budget is deliberately NOT applied inside the
 * wrapper. `getTenantBillingSubscription` forwards exactly what its caller
 * passes: two-argument callers must not start emitting `signal: undefined`, and
 * `adminDashboard.ts` owns a tighter budget of its own for its row reads. So the
 * budget belongs at the call site — see the four subscription routes.
 *
 * 3s matches `ERP_ROW_TIMEOUT_MS` in `adminDashboard.ts`: both bound a
 * single-row `by-tenant` read. These particular reads are best-effort — they only
 * enrich an audit row — so a short budget is the right call: if the ERP is slow,
 * the operator's mutation must proceed and record `beforeFetchError` rather than
 * wait on an unresponsive socket for undici's multi-minute default.
 */
export const ERP_M2M_READ_TIMEOUT_MS = 3_000;

/** HTTP methods used by `m2mMutationInit`. */
type ErpMutationMethod = 'POST' | 'PUT';

/**
 * Shared `RequestInit` for platform→ERP M2M mutations.
 *
 * Centralised here rather than at each call site so every M2M mutation inherits
 * the same abort budget and a new wrapper cannot forget it. A caller-supplied
 * signal is combined with the timeout, so either one can abort the request.
 */
function m2mMutationInit(
  method: ErpMutationMethod,
  apiKey: string,
  payload: unknown,
  callerSignal?: AbortSignal
): RequestInit {
  const timeoutSignal = AbortSignal.timeout(ERP_MUTATION_TIMEOUT_MS);

  return {
    method,
    headers: { 'X-Platform-ApiKey': apiKey },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    signal: callerSignal
      ? AbortSignal.any([callerSignal, timeoutSignal])
      : timeoutSignal,
  };
}

/**
 * Syscall codes that mean "the ERP was never reached", as opposed to the ERP
 * answering with an error. Reported as 503 by `classifyErpError`; a failure the
 * ERP itself returns stays in the 5xx/4xx upstream range instead.
 */
const ERP_NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EPIPE',
]);

/** Substrings undici/Node put on a `TypeError: fetch failed` and its `cause`. */
const ERP_NETWORK_MESSAGE_HINTS = [
  'fetch failed',
  'network',
  'econnrefused',
  'enotfound',
  'socket hang up',
];

export interface ErpErrorClassification {
  /** HTTP status the platform route should return. */
  status: number;
  /** Stable, non-sensitive token that is safe to echo to the client. */
  code: string;
}

/**
 * Maps any failure raised by this module onto a safe `{ status, code }` pair.
 *
 * Routes MUST use this instead of forwarding `error.message`: `ErpApiError`
 * messages are lifted verbatim from the ERP response body, so echoing them
 * leaks upstream internals to the browser and breaks the platform's
 * `{ error: { message: 'safe-error-code' } }` contract.
 *
 * Upstream 401/403 become 502 on purpose. The M2M key is a platform secret, so
 * an upstream auth failure is never the admin's own session — and an admin UI
 * that receives 401 typically treats it as "your session expired" and logs the
 * operator out of a perfectly healthy session.
 */
export function classifyErpError(err: unknown): ErpErrorClassification {
  const erpError = (err ?? {}) as {
    status?: unknown;
    code?: unknown;
    name?: unknown;
  };

  // `instanceof` is deliberately paired with a `name` check: the project
  // compiles with `target: "es5"`, where `class X extends Error` can lose its
  // prototype chain, making `instanceof` return false for genuine instances.
  // A misclassified ERP failure degrades to a blanket 502 and silently loses
  // the precise 400/404/409/422 mapping the admin routes depend on.
  if (err instanceof ErpApiError || erpError.name === 'ErpApiError') {
    if (erpError.code === 'ERP_MALFORMED_RESPONSE') {
      return { status: 502, code: 'erp-malformed-response' };
    }

    switch (typeof erpError.status === 'number' ? erpError.status : 0) {
      case 400:
        return { status: 400, code: 'erp-bad-request' };
      case 404:
        return { status: 404, code: 'erp-not-found' };
      case 401:
      case 403:
        return { status: 502, code: 'erp-auth-failed' };
      case 409:
        return { status: 409, code: 'erp-conflict' };
      case 422:
        return { status: 422, code: 'erp-rejected' };
      default:
        return { status: 502, code: 'erp-upstream-failure' };
    }
  }

  const errorName = erpError.name;

  // An aborted request (our own `AbortSignal.timeout`, or a caller signal) is
  // indistinguishable from "the ERP never answered" for the operator.
  if (errorName === 'AbortError' || errorName === 'TimeoutError') {
    return { status: 503, code: 'erp-unavailable' };
  }

  if (err instanceof Error) {
    const errorCode = (err as { code?: unknown }).code;
    const cause = (err as { cause?: unknown }).cause;
    const haystack = `${
      err.name === 'TypeError' ? err.message : ''
    } ${cause instanceof Error ? cause.message : ''}`.toLowerCase();

    if (
      (typeof errorCode === 'string' &&
        ERP_NETWORK_ERROR_CODES.has(errorCode)) ||
      (err.name === 'TypeError' &&
        ERP_NETWORK_MESSAGE_HINTS.some((hint) => haystack.includes(hint)))
    ) {
      return { status: 503, code: 'erp-unavailable' };
    }
  }

  return { status: 502, code: 'erp-upstream-failure' };
}

/**
 * The single constructor for the `ERP_MALFORMED_RESPONSE` marker.
 *
 * Extracted so the three call sites that can produce it — an unparseable 2xx
 * body, a list body that is not an array, and a verify body that does not match
 * the contract — cannot drift apart in status or in code. The message is a
 * stable token, never the raw upstream body: `classifyErpError` keys off the
 * `code`, and `ErpApiError.message` is lifted verbatim from the ERP response, so
 * putting the body here would leak upstream internals into any surface that
 * forwards it.
 */
const malformedResponseError = (): ErpApiError =>
  new ErpApiError('ERP_MALFORMED_RESPONSE', 502, 'ERP_MALFORMED_RESPONSE');

async function erpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.erp.apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  let data: T & ErpErrorPayload = {} as T & ErpErrorPayload;
  let bodyParsed = false;
  try {
    data = (await res.json()) as T & ErpErrorPayload;
    bodyParsed = true;
  } catch {
    data = {} as T & ErpErrorPayload;
  }

  if (!res.ok) {
    const message =
      (typeof data?.error === 'string' ? data.error : data?.error?.message) ||
      data?.message ||
      `ERP request failed (${res.status})`;

    throw new ErpApiError(message, res.status);
  }

  // A 2xx with an unparseable body is a HARD failure, never a silent success.
  // It previously fell back to `{}`, which made an upstream HTML error page
  // served with status 200 look like an empty SUCCESS — an admin subscription
  // mutation would report success while changing nothing.
  if (!bodyParsed) {
    throw malformedResponseError();
  }

  return data;
}

/**
 * Parses a LIST-shaped ERP 2xx body into contract-checked entries (PG-20).
 *
 * Split out so the two catalogue readers (`packages`, `methods`) share exactly
 * one policy: a non-array envelope is a hard `ERP_MALFORMED_RESPONSE`, and an
 * entry that fails the contract is dropped rather than forwarded. See
 * `readErpList` for why those two strictnesses differ.
 */
function parseErpList<TSchema extends z.ZodTypeAny>(
  raw: unknown,
  schema: TSchema
): z.output<TSchema>[] {
  const read = readErpList(raw, schema);

  if (!read.ok) {
    throw malformedResponseError();
  }

  // Drift telemetry. An entry the ERP sent but that failed the response
  // contract is dropped silently by design — the alternative is forwarding a
  // value of unknown shape into the catalogue and then into a price. The cost
  // of that strictness is that a contract change upstream is invisible here:
  // packages or methods simply stop appearing, and the first symptom is a
  // support ticket about missing options. Reporting the count turns "the ERP
  // changed something" into an operator-visible line instead of a mystery.
  //
  // Behaviour is unchanged: the entries are still dropped, and a non-array
  // envelope still throws above.
  if (read.dropped > 0) {
    console.warn(
      `[erp] dropped ${read.dropped} malformed catalogue entr${
        read.dropped === 1 ? 'y' : 'ies'
      } — the ERP response no longer matches the expected contract, so the catalogue is incomplete.`
    );
  }

  return read.items;
}

/**
 * Reads the payment-method catalogue and hides everything the ERP has not
 * vouched for (PG-20).
 *
 * Two independent gates, both fail-closed:
 *
 *  1. `parseErpList` drops entries that do not satisfy `erpPaymentMethodSchema`
 *     — no `key`, no `label`, or an `available` that is missing or not a
 *     boolean.
 *  2. The `filter` below drops the entries that parsed but are explicitly
 *     `available: false`.
 *
 * The second gate is the ticket's actual defect: `available: false` used to be
 * proxied straight through, so the funnel offered a method the ERP had already
 * declared dead and the customer only found out at the gateway. An entry with
 * `available: true` is the ONLY thing this returns, which is what makes the
 * published catalogue honest rather than a list of claims.
 */
async function fetchAvailableMethods(): Promise<ErpPaymentMethodContract[]> {
  const raw = await erpFetch<unknown>('/payments/methods?country=SA');

  return parseErpList(raw, erpPaymentMethodSchema).filter(
    (method) => method.available
  );
}

/**
 * Reads the package catalogue (PG-20 / P4.10b).
 *
 * The envelope check is what closes P4.10b at its source: `/pricing` calls this
 * directly from `getServerSideProps`, so before this change a parseable-but-
 * wrong-shaped 2xx body (`{}`, `null`, a string) reached `packages.map` and
 * 500'd the page. It now throws `ERP_MALFORMED_RESPONSE`, which the page's
 * existing `try/catch` already turns into its error state.
 */
async function fetchPackages(): Promise<ErpPackageContract[]> {
  const raw = await erpFetch<unknown>(
    '/platform/TenantRegistration/catalog/packages'
  );

  return parseErpList(raw, erpPackageSchema);
}

/**
 * Reads the tri-state payment status (PG-30).
 *
 * The body must be an OBJECT that matches `erpVerifyResponseSchema`; anything
 * else — an array, `null`, a string — is `ERP_MALFORMED_RESPONSE` rather than a
 * silently-empty success. See that schema for why `success`/`status` are
 * optional-but-typed, and why an unrecognised `status` is passed through instead
 * of rejected.
 */
async function fetchVerifyResult(
  reference: string
): Promise<ErpVerifyResponseContract> {
  const raw = await erpFetch<unknown>(
    `/payments/verify/${encodeURIComponent(reference)}`
  );

  const parsed = erpVerifyResponseSchema.safeParse(raw);

  if (!parsed.success) {
    throw malformedResponseError();
  }

  return parsed.data;
}

export const erp = {
  getPackages: (): Promise<ErpPackageContract[]> => fetchPackages(),

  checkSubdomain: (subdomain: string) =>
    erpFetch<ErpAvailability>(
      `/platform/TenantRegistration/check-subdomain?subdomain=${encodeURIComponent(
        subdomain
      )}`
    ),

  checkEmail: (email: string) =>
    erpFetch<ErpAvailability>(
      `/platform/TenantRegistration/check-email?email=${encodeURIComponent(
        email
      )}`
    ),

  registerTenant: (body: ErpRegistrationRequest) =>
    erpFetch<ErpRegistrationResult>('/platform/TenantRegistration', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getMethods: (): Promise<ErpPaymentMethodContract[]> =>
    fetchAvailableMethods(),

  createPayment: (order: ErpPaymentRequest) =>
    erpFetch<ErpPaymentResult>('/payments', {
      method: 'POST',
      body: JSON.stringify(order),
    }),

  verifyPayment: (reference: string): Promise<ErpVerifyResponseContract> =>
    fetchVerifyResult(reference),

  login: (userName: string, password: string) =>
    erpFetch<ErpLoginResult>('/auth/Account/Login', {
      method: 'POST',
      body: JSON.stringify({ userName, password }),
    }),

  getTenantSubscription: (token: string) =>
    erpFetch<ErpSubscriptionStatus>('/platform/TenantStatus/subscription', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getTenantModules: (token: string) =>
    erpFetch<unknown>('/platform/TenantStatus/modules', {
      headers: { Authorization: `Bearer ${token}` },
    }),

  extendSubscription: (
    superToken: string,
    subscriptionId: string,
    newEndDate: string
  ) =>
    erpFetch<unknown>(
      `/platform/SuperAdmin/subscriptions/${subscriptionId}/extend`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${superToken}` },
        body: JSON.stringify({ newEndDate }),
      }
    ),

  cancelSubscription: (superToken: string, subscriptionId: string) =>
    erpFetch<unknown>(
      `/platform/SuperAdmin/subscriptions/${subscriptionId}/cancel`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${superToken}` },
      }
    ),

  // ERP M2M aggregate subscriptions list API (X-Platform-ApiKey auth)
  listSubscriptionsM2M: (apiKey: string) =>
    erpFetch<unknown>('/platform/billing/subscriptions', {
      headers: { 'X-Platform-ApiKey': apiKey },
    }),

  /**
   * @deprecated Dead code — kept only for reference (P5.7 review decision:
   * "delete or keep-as-deprecated"). This hits the human-only
   * `GET /platform/SuperAdmin/subscriptions` endpoint with a super-admin
   * **session** Bearer token, which is not usable for M2M access and must
   * never appear in a browser path. The platform revenue view uses
   * `listSubscriptionsM2M` (`X-Platform-ApiKey`) instead.
   * Its only remaining caller is `__tests__/lib/erp.spec.ts`.
   * Delete this once the ERP M2M surface fully covers it.
   */
  listSubscriptions: (superToken: string) =>
    erpFetch<unknown>('/platform/SuperAdmin/subscriptions', {
      headers: { Authorization: `Bearer ${superToken}` },
    }),

  // ERP M2M billing API (X-Platform-ApiKey auth, no human login)
  getTenantBillingSubscription: (
    apiKey: string,
    tenantId: string,
    signal?: AbortSignal
  ) =>
    erpFetch<unknown>(
      `/platform/billing/subscriptions/by-tenant/${encodeURIComponent(tenantId)}`,
      {
        headers: { 'X-Platform-ApiKey': apiKey },
        ...(signal ? { signal } : {}),
      }
    ),

  createTenantSubscription: (
    apiKey: string,
    tenantId: string,
    data: {
      packageId: string;
      startDate?: string;
      endDate?: string;
      trialDays?: number;
      isTrial?: boolean;
    },
    signal?: AbortSignal
  ) =>
    erpFetch<unknown>(
      `/platform/billing/subscriptions/by-tenant/${encodeURIComponent(tenantId)}`,
      m2mMutationInit('POST', apiKey, data, signal)
    ),

  extendTenantSubscription: (
    apiKey: string,
    tenantId: string,
    newEndDate: string,
    signal?: AbortSignal
  ) =>
    erpFetch<unknown>(
      `/platform/billing/subscriptions/by-tenant/${encodeURIComponent(tenantId)}/extend`,
      m2mMutationInit('POST', apiKey, { newEndDate }, signal)
    ),

  cancelTenantSubscription: (
    apiKey: string,
    tenantId: string,
    signal?: AbortSignal
  ) =>
    erpFetch<unknown>(
      `/platform/billing/subscriptions/by-tenant/${encodeURIComponent(tenantId)}/cancel`,
      m2mMutationInit('POST', apiKey, undefined, signal)
    ),

  changeTenantPlan: (
    apiKey: string,
    tenantId: string,
    packageId: string,
    previewOnly: boolean = false
  ) =>
    erpFetch<ErpChangePlanResponse>(
      `/platform/billing/subscriptions/by-tenant/${encodeURIComponent(tenantId)}/change-plan`,
      m2mMutationInit('POST', apiKey, { packageId, previewOnly })
    ),

  trialOverrideTenantSubscription: (
    apiKey: string,
    tenantId: string,
    newTrialEndDate: string,
    signal?: AbortSignal
  ) =>
    erpFetch<unknown>(
      `/platform/billing/subscriptions/by-tenant/${encodeURIComponent(tenantId)}/trial-override`,
      m2mMutationInit('POST', apiKey, { newTrialEndDate }, signal)
    ),

  // P5.6: Rules / Permissions M2M APIs
  getSystemModulesM2M: (apiKey: string) =>
    erpFetch<ErpSystemModule[]>('/platform/billing/system-modules', {
      headers: { 'X-Platform-ApiKey': apiKey },
    }),

  getPackagesM2M: (apiKey: string) =>
    erpFetch<ErpPackageDetailed[]>('/platform/billing/packages', {
      headers: { 'X-Platform-ApiKey': apiKey },
    }),

  getPackageByIdM2M: (apiKey: string, packageId: string) =>
    erpFetch<ErpPackageDetailed>(
      `/platform/billing/packages/${encodeURIComponent(packageId)}`,
      { headers: { 'X-Platform-ApiKey': apiKey } }
    ),

  updatePackageModulesM2M: (
    apiKey: string,
    packageId: string,
    systemModuleIds: string[],
    syncExistingSubscriptions: boolean = true,
    signal?: AbortSignal
  ) =>
    erpFetch<ErpPackageDetailed>(
      `/platform/billing/packages/${encodeURIComponent(packageId)}/modules`,
      m2mMutationInit(
        'PUT',
        apiKey,
        { systemModuleIds, syncExistingSubscriptions },
        signal
      )
    ),

  syncSubscriptionsModulesM2M: (
    apiKey: string,
    packageId?: string,
    signal?: AbortSignal
  ) =>
    erpFetch<{ message: string }>(
      '/platform/billing/subscriptions/sync-modules',
      m2mMutationInit('POST', apiKey, packageId ? { packageId } : {}, signal)
    ),
};

export function buildErpLoginUrl(
  result: ErpRegistrationResult,
  opts: {
    isLocalhost: boolean;
    clientUrl: string;
    loginPath: string;
    baseDomain: string;
  }
): string {
  const params = new URLSearchParams();

  if (result.authToken) {
    params.set('token', result.authToken);
  }

  if (result.expiresIn) {
    const expires = new Date(result.expiresIn);
    if (!Number.isNaN(expires.getTime())) {
      params.set('expiresIn', expires.toISOString());
    } else {
      params.set('expiresIn', result.expiresIn);
    }
  }

  const qs = params.toString();

  if (opts.isLocalhost) {
    return `${opts.clientUrl}${opts.loginPath}${qs ? `?${qs}` : ''}`;
  }

  const base = (
    result.redirectTo || `https://${result.subdomain}.${opts.baseDomain}`
  ).replace(/^http:\/\//i, 'https://');

  return `${base}${opts.loginPath}${qs ? `?${qs}` : ''}`;
}
