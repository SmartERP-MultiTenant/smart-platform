import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

import { Alert } from '@/components/shared';
import { savePaymentInFlight } from '@/components/payment/paymentInFlight';
import type {
  ErpBillingCycle,
  ErpPackage,
  ErpPaymentMethod,
  ErpPaymentResult,
} from '@/lib/erp';
import { paymentErrorCopy } from '@/lib/payments/errorCopy';

interface PaymentActivationProps {
  companyName: string;
  customerEmail: string;
  customerPhone?: string;
  packageId: string;
  /**
   * PG-31 — whether the yearly cycle may be OFFERED at all.
   *
   * Defaults to `false`, so a caller that forgets to pass it gets no toggle
   * rather than a purchasable annual order: the switch is fail-closed in the
   * component as well as in the two API routes. Threaded from the page
   * (`pages/register.tsx` reads `env.yearlyBillingEnabled` in
   * `getServerSideProps` and passes it down through `RegisterFunnel`) — a
   * server-side switch, not a `NEXT_PUBLIC_*` value, so it can be changed by a
   * restart instead of a rebuild and stays one setting for both halves.
   */
  yearlyBillingEnabled?: boolean;
}

/**
 * The response of `POST /api/public/erp/orders` (PG-06).
 *
 * The reference is minted by the SERVER and is the ONLY reference the customer's
 * order will ever have. The client used to invent its own `pay-…` reference and
 * put it in the gateway `callbackUrl`; the server overwrites that parameter with
 * its own, so a client-minted value could never match what came back — which is
 * exactly why the in-flight marker has to be written from THIS response.
 */
interface ErpOrderIntentResponse {
  data?: {
    orderReference: string;
    amount: number;
    currency: string;
    packageId: string;
    packageName: string;
    expiresAt: string;
    /** Signed token proving the terms; the only price authority accepted. */
    intent: string;
  };
  error?: { message?: string };
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
  yearlyBillingEnabled = false,
}: PaymentActivationProps) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const [pkg, setPkg] = useState<ErpPackage | null>(null);
  const [methods, setMethods] = useState<ErpPaymentMethod[]>([]);
  const [billingCycle, setBillingCycle] = useState<ErpBillingCycle>('monthly');
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

  const hasYearlyPrice =
    typeof pkg.priceYearly === 'number' && pkg.priceYearly > 0;
  const currentAmount =
    billingCycle === 'yearly' && hasYearlyPrice
      ? pkg.priceYearly!
      : pkg.priceMonthly;

  // Only the KEY differs per cycle. The interpolation values are built once so
  // the two summaries cannot drift apart.
  const summaryValues = {
    name: pkg.name,
    amount: formatAmount(currentAmount),
  };

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

    // Preserve the active locale in the gateway callback: default 'ar' has
    // no URL prefix; non-default locales are served under /<locale>/... .
    //
    // PG-06: the `order` parameter is deliberately NOT set here. The server owns
    // the reference and overwrites whatever we send (`buildCallbackUrl`), so
    // appending our own would only look authoritative while being discarded.
    const localePrefix =
      router.locale && router.locale !== 'ar' ? `/${router.locale}` : '';

    try {
      // ── 1. Ask the SERVER what this order costs (PG-06) ────────────────
      //
      // The funnel used to send its own `amount` and `orderReference` straight
      // to the payment route, which forwarded both to the ERP — so a hand-rolled
      // POST priced a tenant at any number the caller chose. This call is how
      // the price stops being the browser's opinion: the server resolves it
      // against the ERP catalogue and mints a reference we could not guess.
      const ordersRes = await fetch('/api/public/erp/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId, billingCycle }),
      });

      let ordersBody: ErpOrderIntentResponse = {};
      try {
        ordersBody = await ordersRes.json();
      } catch {
        ordersBody = {};
      }

      const serverOrderReference = ordersBody.data?.orderReference;
      const intent = ordersBody.data?.intent;

      // No fallback to a locally-minted reference. A client that cannot be
      // priced must not reach the gateway at all: proceeding would recreate the
      // exact defect this flow exists to close, and the customer cannot be
      // charged against terms the server never agreed to.
      if (!ordersRes.ok || !serverOrderReference || !intent) {
        setError(
          paymentErrorCopy(
            ordersBody.error?.message,
            t,
            t('erp-payment-general-error')
          )
        );
        setSubmitting(null);
        return;
      }

      // ── 2. Pay the order the server just priced ────────────────────────
      //
      // `packageId` and `billingCycle` travel alongside `intent` on purpose: the route cross-checks
      // them and refuses a mismatch, which is what stops a cheap package being
      // attached to an expensive intent.
      const res = await fetch('/api/public/erp/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent,
          packageId,
          billingCycle,
          paymentMethod: method.key,
          customerName: companyName,
          customerEmail,
          customerPhone: customerPhone || undefined,
          description: t('erp-payment-order-description', { name: pkg.name }),
          callbackUrl: `${window.location.origin}${localePrefix}/payment/success`,
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
      //
      // The SERVER's reference, not one we minted. The gateway returns to the
      // callback URL the server built, which carries the server's reference — so
      // storing anything else makes the success page's exact match impossible:
      // the receipt could never resolve its package and the marker would never
      // be cleared.
      //
      // The cycle and the amount travel too (PG-31), because the success page
      // has no other route to either. Both are the values THIS attempt sent to
      // and received from `/orders`: the closure pins them for the whole
      // attempt, so flipping the toggle mid-flight cannot relabel the marker
      // with a cycle the customer never paid for.
      savePaymentInFlight({
        orderReference: serverOrderReference,
        packageId,
        methodKey: method.key,
        startedAt: new Date().toISOString(),
        billingCycle,
        amount: ordersBody.data?.amount,
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

      {/*
        PG-31: the toggle is rendered ONLY when the server says yearly billing
        is enabled. Hiding the control is the client half of a fail-closed
        switch — the routes refuse a yearly order regardless of what this
        renders, so a stale bundle or a hand-rolled POST gains nothing here.
      */}
      {hasYearlyPrice && yearlyBillingEnabled && (
        <div className="my-3 flex items-center justify-center gap-2">
          {/* The selection is conveyed to the class names alone, so without a
              group label and a pressed state a screen reader user hears two
              unlabelled buttons. */}
          <div
            role="group"
            aria-label={t('erp-payment-billing-cycle')}
            className="inline-flex rounded-lg bg-gray-100 p-1"
          >
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              aria-pressed={billingCycle === 'monthly'}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                billingCycle === 'monthly'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('erp-payment-cycle-monthly')}
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              aria-pressed={billingCycle === 'yearly'}
              className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                billingCycle === 'yearly'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('erp-payment-cycle-yearly')}
            </button>
          </div>
        </div>
      )}

      {/* Both key names must stay literal: the locale gate in
          `scripts/check-locale.js` only recognises a statically written key, so
          choosing the KEY with a ternary makes every key on it invisible. */}
      <p className="mb-4 text-sm text-gray-600 text-center">
        {billingCycle === 'yearly'
          ? t('erp-payment-pkg-summary-yearly', summaryValues)
          : t('erp-payment-pkg-summary', summaryValues)}
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
