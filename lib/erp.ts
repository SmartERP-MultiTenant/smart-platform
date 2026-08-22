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
