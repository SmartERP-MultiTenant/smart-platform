import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

import { Alert } from '@/components/shared';
import { savePaymentInFlight } from '@/components/payment/paymentInFlight';
import type { ErpPackage, ErpPaymentMethod, ErpPaymentResult } from '@/lib/erp';
import { paymentErrorCopy } from '@/lib/payments/errorCopy';

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

/**
 * Guards the ERP-supplied `iconUrl` before it reaches an `<img src>`.
 *
 * https-only, mirroring `isAllowedPaymentUrl`: the funnel is always served over
 * https in production, so an http icon would be blocked as mixed content and
 * render as a broken image. Returning `null` makes the caller fall back to the
 * text-only chip, which is the honest outcome for anything unusable.
 */
function resolveMethodIconUrl(url: string | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    // Anything that is not a real https URL — a `data:`, `javascript:`, or
    // relative value — is refused rather than passed through.
    if (parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Gateway mark for one payment method.
 *
 * A plain `<img>`, not `next/image`: the ERP catalogue's icon host is not in
 * `next.config.js` `images.remotePatterns`, and `next/image` throws a runtime
 * error for a non-allowlisted remote host. Adding the host there is the correct
 * fix and belongs to the PR that owns `next.config.js`; until then this is the
 * same justified escape hatch the codebase already uses in
 * `components/account/UploadAvatar.tsx`.
 *
 * `alt=""` is deliberate: the icon is decorative, and the method's accessible
 * name is the adjacent label. A load failure hides the image entirely rather
 * than showing a broken-image glyph next to the text.
 */
function MethodIcon({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote gateway icon host is not allowlisted in next.config.js (owned by another change)
    <img
      src={src}
      alt=""
      width={20}
      height={20}
      loading="lazy"
      decoding="async"
      className="h-5 w-5 shrink-0 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * The code this component raises when the customer activates a method the ERP
 * catalogue already reported as unavailable.
 *
 * A member of the shared vocabulary in `lib/payments/errorCopy.ts`, not a
 * second local one. The picker is the producer for this code — nothing in the
 * BFF can emit it, because the availability contract is enforced on the read
 * path (`lib/erp.ts` `fetchAvailableMethods`) and the write path's check
 * belongs to PG-06's server-authoritative order creation.
 */
const METHOD_NOT_AVAILABLE_CODE = 'method-not-available';

/** Id of the `<h3>` that names the method group for assistive technology. */
const METHOD_GROUP_LABEL_ID = 'erp-payment-method-heading';
/** Prefix for the per-method unavailability description elements. */
const METHOD_REASON_ID_PREFIX = 'erp-payment-method-reason-';

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

  // PG-24: coming back from the gateway with the browser's Back button restores
  // this page from the back/forward cache, React state and all. `submitting`
  // was never cleared — the redirect ended the JS context instead — so without
  // this the picker would come back permanently disabled, with the customer
  // unable to retry or switch method. `pageshow` with `persisted` is the only
  // event that fires for a bfcache restore.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setSubmitting(null);
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  // Free package or unknown package → no payment step needed (trial only)
  if (loading || !pkg || !pkg.priceMonthly || pkg.priceMonthly <= 0) {
    return null;
  }

  const handlePay = async (method: ErpPaymentMethod) => {
    if (submitting) return;

    // `aria-disabled` (not the `disabled` attribute) keeps an unavailable
    // method focusable so a screen-reader user can hear *why* it is offered but
    // inert — so the refusal has to be enforced here instead, and because the
    // button is not natively disabled a sighted click must produce a visible
    // reason rather than nothing at all.
    if (!method.available) {
      setError(
        paymentErrorCopy(
          METHOD_NOT_AVAILABLE_CODE,
          t,
          t('erp-payment-general-error')
        )
      );
      return;
    }

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
        // `body.error.message` is a stable code from the shared taxonomy
        // (`lib/payments/publicErpError.ts`), never upstream prose — so this is
        // a lookup, not a string match. `paymentErrorCopy` returns the fallback
        // for anything that is not a known code, which is why the raw value is
        // never rendered: an unknown failure gets honest generic copy instead
        // of an English ERP sentence in an Arabic UI.
        //
        // `body.data?.status` is deliberately NOT consulted as a fallback
        // source any more: the ERP's status vocabulary ('Pending', 'Paid',
        // 'Failed') is not an error vocabulary, and treating it as one is how
        // the old matcher ended up rendering the bare word "failed".
        setError(
          paymentErrorCopy(
            body.error?.message,
            t,
            t('erp-payment-general-error')
          )
        );
        setSubmitting(null);
        return;
      }

      // PG-24: record the attempt immediately before leaving the app. This is
      // the last moment the app can write anything — the next navigation is a
      // full-page redirect to the gateway, so anything not persisted here is
      // lost. Written only after the URL passes the allow-list, so a rejected
      // response never leaves a marker behind.
      savePaymentInFlight({
        orderReference,
        packageId,
        methodKey: method.key,
        startedAt: new Date().toISOString(),
      });

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
      <h3
        id={METHOD_GROUP_LABEL_ID}
        className="mb-1 text-lg font-bold text-gray-800"
      >
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

      {/*
        The live region is always in the DOM, not conditionally rendered: a
        region that appears at the same moment its content does is not reliably
        announced. It is empty (and so takes no visual space) until a submission
        is in flight — that is what turns the redirect into a status change the
        customer is told about, rather than a silent freeze.
      */}
      <p
        className={`text-sm font-medium text-primary ${submitting ? 'mb-3' : ''}`}
        role="status"
        aria-live="polite"
      >
        {submitting ? t('erp-payment-redirecting') : ''}
      </p>

      {/*
        A group of action buttons, NOT a radiogroup. Each option performs the
        payment immediately, and selection-triggers-the-action is structurally
        incompatible with `role="radio"`: the radio keyboard model makes arrow
        keys *select*, so conforming to it would fire a gateway redirect every
        time someone pressed Down. Announcing radio buttons that do not behave
        like radio buttons is worse for assistive-technology users than plain
        buttons, so the honest role is used and the label is borrowed from the
        heading.
      */}
      <div
        role="group"
        aria-labelledby={METHOD_GROUP_LABEL_ID}
        aria-busy={submitting ? true : undefined}
        className="flex flex-wrap justify-center gap-2"
      >
        {methods.map((method) => {
          const inFlight = submitting === method.key;
          const unavailable = !method.available;
          const reasonId = `${METHOD_REASON_ID_PREFIX}${method.key}`;

          return (
            <button
              key={method.key}
              type="button"
              aria-disabled={unavailable || !!submitting ? true : undefined}
              aria-busy={inFlight ? true : undefined}
              aria-describedby={unavailable ? reasonId : undefined}
              onClick={() => handlePay(method)}
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-primary hover:text-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            >
              <MethodIcon src={resolveMethodIconUrl(method.iconUrl)} />
              <span>
                {inFlight ? t('erp-payment-redirecting-short') : method.label}
              </span>
              {unavailable && (
                // Gives the `aria-disabled` button an accessible explanation.
                // Visually hidden: the chip already reads as unavailable, and
                // repeating the reason on every chip would be noise for sighted
                // users while remaining the only cue for non-sighted ones.
                <span id={reasonId} className="sr-only">
                  {t('erp-payment-unsupported-method')}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-gray-500">
        {t('erp-payment-security-notice')}
      </p>
    </div>
  );
}

export default PaymentActivation;
