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

  listSubscriptions: (superToken: string) =>
    erpFetch<unknown>('/platform/SuperAdmin/subscriptions', {
      headers: { Authorization: `Bearer ${superToken}` },
    }),

  // ERP M2M billing API (X-Platform-ApiKey auth, no human login)
  getTenantBillingSubscription: (apiKey: string, tenantId: string) =>
    erpFetch<unknown>(
      `/platform/billing/subscriptions/by-tenant/${encodeURIComponent(tenantId)}`,
      { headers: { 'X-Platform-ApiKey': apiKey } }
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
