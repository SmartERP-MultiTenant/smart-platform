import env from '@/lib/env';

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

export interface ErpPaymentRequest {
  orderReference: string;
  amount: number;
  currency?: string;
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

export class ErpApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ErpApiError';
  }
}

interface ErpErrorPayload {
  error?: string | { message?: string };
  message?: string;
}

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
  try {
    data = (await res.json()) as T & ErpErrorPayload;
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

  return data;
}

export const erp = {
  getPackages: () =>
    erpFetch<ErpPackage[]>('/platform/TenantRegistration/catalog/packages'),

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

  getMethods: () =>
    erpFetch<ErpPaymentMethod[]>('/payments/methods?country=SA'),

  createPayment: (order: ErpPaymentRequest) =>
    erpFetch<ErpPaymentResult>('/payments', {
      method: 'POST',
      body: JSON.stringify(order),
    }),

  verifyPayment: (reference: string) =>
    erpFetch<ErpVerifyResult>(
      `/payments/verify/${encodeURIComponent(reference)}`
    ),

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
    }
  ) =>
    erpFetch<unknown>(
      `/platform/billing/subscriptions/by-tenant/${encodeURIComponent(tenantId)}`,
      {
        method: 'POST',
        headers: { 'X-Platform-ApiKey': apiKey },
        body: JSON.stringify(data),
      }
    ),

  extendTenantSubscription: (
    apiKey: string,
    tenantId: string,
    newEndDate: string
  ) =>
    erpFetch<unknown>(
      `/platform/billing/subscriptions/by-tenant/${encodeURIComponent(tenantId)}/extend`,
      {
        method: 'POST',
        headers: { 'X-Platform-ApiKey': apiKey },
        body: JSON.stringify({ newEndDate }),
      }
    ),

  cancelTenantSubscription: (apiKey: string, tenantId: string) =>
    erpFetch<unknown>(
      `/platform/billing/subscriptions/by-tenant/${encodeURIComponent(tenantId)}/cancel`,
      {
        method: 'POST',
        headers: { 'X-Platform-ApiKey': apiKey },
      }
    ),

  changeTenantPlan: (
    apiKey: string,
    tenantId: string,
    packageId: string,
    previewOnly: boolean = false
  ) =>
    erpFetch<ErpChangePlanResponse>(
      `/platform/billing/subscriptions/by-tenant/${encodeURIComponent(tenantId)}/change-plan`,
      {
        method: 'POST',
        headers: { 'X-Platform-ApiKey': apiKey },
        body: JSON.stringify({ packageId, previewOnly }),
      }
    ),

  trialOverrideTenantSubscription: (
    apiKey: string,
    tenantId: string,
    newTrialEndDate: string
  ) =>
    erpFetch<unknown>(
      `/platform/billing/subscriptions/by-tenant/${encodeURIComponent(tenantId)}/trial-override`,
      {
        method: 'POST',
        headers: { 'X-Platform-ApiKey': apiKey },
        body: JSON.stringify({ newTrialEndDate }),
      }
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
    syncExistingSubscriptions: boolean = true
  ) =>
    erpFetch<ErpPackageDetailed>(
      `/platform/billing/packages/${encodeURIComponent(packageId)}/modules`,
      {
        method: 'PUT',
        headers: { 'X-Platform-ApiKey': apiKey },
        body: JSON.stringify({
          systemModuleIds,
          syncExistingSubscriptions,
        }),
      }
    ),

  syncSubscriptionsModulesM2M: (apiKey: string, packageId?: string) =>
    erpFetch<{ message: string }>(
      '/platform/billing/subscriptions/sync-modules',
      {
        method: 'POST',
        headers: { 'X-Platform-ApiKey': apiKey },
        body: JSON.stringify(packageId ? { packageId } : {}),
      }
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
