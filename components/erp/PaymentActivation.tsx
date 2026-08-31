import { useEffect, useState } from 'react';

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

function mapPaymentError(message: unknown): string {
  const raw = typeof message === 'string' ? message : '';

  if (raw.toLowerCase().includes('unsupported payment method')) {
    return 'طريقة الدفع غير مدعومة حالياً';
  }

  if (raw.toLowerCase().includes('amount must be greater than zero')) {
    return 'قيمة الطلب غير صالحة، حاول مرة أخرى';
  }

  return raw || 'حدث خطأ في الدفع، حاول مرة أخرى';
}

export function PaymentActivation({
  companyName,
  customerEmail,
  customerPhone,
  packageId,
}: PaymentActivationProps) {
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
          description: `اشتراك ${pkg.name}`,
          callbackUrl: `${window.location.origin}/payment/success?order=${orderReference}`,
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
        setError(mapPaymentError(body.error?.message || body.data?.status));
        setSubmitting(null);
        return;
      }

      // targetUrl is guaranteed https + one of: moyasar.com / paymob.com /
      // tabby.ai / tamara.co / oppwa.com / hyperpay.com (see isAllowedPaymentUrl)
      window.location.assign(targetUrl);
    } catch {
      setError('تعذر الاتصال ببوابة الدفع، حاول مرة أخرى');
      setSubmitting(null);
    }
  };

  return (
    <div dir="rtl" className="mt-8 border-t border-green-200 pt-6">
      <h3 className="mb-1 text-lg font-bold text-gray-800">
        فعّل اشتراكك المدفوع
      </h3>
      <p className="mb-4 text-sm text-gray-600">
        باقة {pkg.name} ·{' '}
        <span dir="ltr" className="font-medium">
          {formatAmount(pkg.priceMonthly)} ر.س
        </span>{' '}
        / شهرياً — اختر طريقة الدفع وسيتم تحويلك إلى بوابة الدفع، أو ابدأ
        بتجربتك المجانية أولاً.
      </p>

      {error && (
        <Alert status="error" className="mb-4">
          {error}
        </Alert>
      )}

      {submitting && (
        <p className="mb-3 text-sm font-medium text-primary">
          جاري التحويل إلى بوابة الدفع...
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
            {submitting === method.key ? 'جاري التحويل…' : method.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-500">
        الدفع آمن ومشفر عبر بوابات الدفع المعتمدة
      </p>
    </div>
  );
}

export default PaymentActivation;
