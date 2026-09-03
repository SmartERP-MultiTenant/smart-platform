import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

import { Alert } from '@/components/shared';
import type { ErpPackage, ErpPaymentMethod, ErpPaymentResult } from '@/lib/erp';

interface PaymentActivationProps {
  companyName: string;
  customerEmail: string;
  customerPhone?: string;
  packageId: string;
}

function formatAmount(amount: number): string {
  return amount % 1 === 0 ? String(amount) : amount.toFixed(2);
}

// Only redirect to known payment-gateway hosts (paymentUrl comes from the ERP proxy).
const PAYMENT_GATEWAY_HOSTS = [
  'moyasar.com',
  'paymob.com',
  'tabby.ai',
  'tamara.co',
  'oppwa.com',
  'hyperpay.com',
];

function isAllowedPaymentUrl(url: string | null | undefined): url is string {
  if (!url) return false;

  try {
    const target = new URL(url);
    if (target.protocol !== 'https:') return false;

    const host = target.hostname.toLowerCase();
    return PAYMENT_GATEWAY_HOSTS.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

function mapPaymentError(message: unknown, t: (k: string) => string): string {
  const raw = typeof message === 'string' ? message : '';

  if (raw.toLowerCase().includes('unsupported payment method')) {
    return t('erp-payment-unsupported-method');
  }

  if (raw.toLowerCase().includes('amount must be greater than zero')) {
    return t('erp-payment-invalid-amount');
  }

  return raw || t('erp-payment-general-error');
}

export function PaymentActivation({
  companyName,
  customerEmail,
  customerPhone,
  packageId,
}: PaymentActivationProps) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const [pkg, setPkg] = useState<ErpPackage | null>(null);
  const [methods, setMethods] = useState<ErpPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [packagesRes, methodsRes] = await Promise.all([
          fetch('/api/public/erp/packages'),
          fetch('/api/public/erp/methods'),
        ]);

        if (cancelled) return;

        if (packagesRes.ok) {
          const body = await packagesRes.json();
          const found = (body?.data || []).find(
            (item: ErpPackage) => item.id === packageId
          );
          setPkg(found || null);
        }

        if (methodsRes.ok) {
          const body = await methodsRes.json();
          setMethods(body?.data || []);
        }
      } catch {
        if (!cancelled) setPkg(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [packageId]);

  // Free package or unknown package → no payment step needed (trial only)
  if (loading || !pkg || !pkg.priceMonthly || pkg.priceMonthly <= 0) {
    return null;
  }

  const handlePay = async (method: ErpPaymentMethod) => {
    if (submitting) return;

    setError(null);
    setSubmitting(method.key);

    const orderReference = `pay-${packageId.slice(0, 8)}-${Date.now()}`;

    // Preserve the active locale in the gateway callback: default 'ar' has
    // no URL prefix; non-default locales are served under /<locale>/... .
    const localePrefix =
      router.locale && router.locale !== 'ar' ? `/${router.locale}` : '';

    try {
      const res = await fetch('/api/public/erp/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderReference,
          amount: pkg.priceMonthly,
          currency: 'SAR',
          paymentMethod: method.key,
          customerName: companyName,
          customerEmail,
          customerPhone: customerPhone || undefined,
          description: t('erp-payment-order-description', { name: pkg.name }),
          callbackUrl: `${window.location.origin}${localePrefix}/payment/success?order=${orderReference}`,
        }),
      });

      let body: {
        data?: ErpPaymentResult;
        error?: { message?: string };
      } = {};
      try {
        body = await res.json();
      } catch {
        body = {};
      }

      const targetUrl = body.data?.paymentUrl;
      if (!res.ok || !isAllowedPaymentUrl(targetUrl)) {
        setError(mapPaymentError(body.error?.message || body.data?.status, t));
        setSubmitting(null);
        return;
      }

      // targetUrl is guaranteed https + one of: moyasar.com / paymob.com /
      // tabby.ai / tamara.co / oppwa.com / hyperpay.com (see isAllowedPaymentUrl)
      window.location.assign(targetUrl);
    } catch {
      setError(t('erp-payment-connection-failed'));
      setSubmitting(null);
    }
  };

  return (
    <div className="mt-8 border-t border-green-200 pt-6">
      <h3 className="mb-1 text-lg font-bold text-gray-800">
        {t('erp-payment-heading')}
      </h3>
      <p className="mb-4 text-sm text-gray-600">
        {t('erp-payment-pkg-summary', {
          name: pkg.name,
          amount: formatAmount(pkg.priceMonthly),
        })}
      </p>

      {error && (
        <Alert status="error" className="mb-4">
          {error}
        </Alert>
      )}

      {submitting && (
        <p className="mb-3 text-sm font-medium text-primary">
          {t('erp-payment-redirecting')}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {methods.map((method) => (
          <button
            key={method.key}
            type="button"
            disabled={!!submitting || !method.available}
            onClick={() => handlePay(method)}
            className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting === method.key
              ? t('erp-payment-redirecting-short')
              : method.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-500">
        {t('erp-payment-security-notice')}
      </p>
    </div>
  );
}

export default PaymentActivation;
