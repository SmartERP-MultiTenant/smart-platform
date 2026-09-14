import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import type { NextPageWithLayout } from 'types';

import { PublicLayout } from '@/components/layouts';
import PaymentReceipt from '@/components/payment/PaymentReceipt';
import PaymentStatus from '@/components/payment/PaymentStatus';
import {
  clearPaymentInFlight,
  readPaymentInFlight,
} from '@/components/payment/paymentInFlight';
import SEO from '@/components/shared/SEO';
import {
  getErpLoginTargetUrl,
  isAllowedRedirectUrl,
  submitErpPostHandoff,
} from '@/lib/erp/handoff';
import env from '@/lib/env';

// `failed` is deliberately absent from this union: a failed payment never
// renders on this page, it is redirected to /payment/failed by the poll loop.
//
// `resume` is the PG-24 recovery state: the URL carried no order reference, but
// this tab recorded a payment still in flight, so instead of the error panel
// the customer is offered a link back into the verification loop.
type Status = 'loading' | 'success' | 'pending' | 'error' | 'resume';

/**
 * Normalised view of the ERP `status` field. The documented wire format is
 * PascalCase (`Pending | Paid | Failed`, see `.agents/context/shared/
 * integration-contracts.md`); the comparison is case-insensitive.
 *
 * Three outcomes, and the difference between them is load-bearing:
 *  - a recognised value (`pending | paid | failed`);
 *  - `null` — the field is absent, blank, or not a string at all. That means a
 *    pre-rollout ERP, and it is the ONLY case allowed to take the optimistic
 *    settle (the PR #59 rollout-compatibility path);
 *  - `'unknown'` — the field is present and non-blank but not a value this kit
 *    understands. That is a contract violation, not an in-flight payment, so
 *    it must never be allowed to claim success: the poll loop keeps polling
 *    and then lands on the honest pending state.
 */
type VerifyStatus = 'pending' | 'paid' | 'failed' | 'unknown';

const normaliseVerifyStatus = (value: unknown): VerifyStatus | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalised = value.trim().toLowerCase();

  if (normalised === '') {
    return null;
  }

  return normalised === 'pending' ||
    normalised === 'paid' ||
    normalised === 'failed'
    ? normalised
    : 'unknown';
};

const MAX_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 2000;

// Test/dev-only speed knob: when served from localhost, the `attempts` and
// `interval` (ms) query params shorten the poll window so the e2e suite can
// exercise the MAX_ATTEMPTS terminal states deterministically without
// waiting ~30s of real polling. Production origins (not localhost) are
// never affected.
const parsePositiveInt = (
  value: string | string[] | undefined
): number | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

interface ErpLoginData {
  token?: string;
  expiresIn?: string;
  subdomain?: string;
  redirectTo?: string;
}

/** Resolved, allowlisted ERP handoff target held for the click-to-enter CTA. */
interface ErpHandoff {
  targetUrl: string;
  token?: string;
  expiresIn?: string;
}

const PaymentSuccess: NextPageWithLayout<
  InferGetServerSidePropsType<typeof getServerSideProps>
> = ({ erpClientUrl, erpLoginPath, erpBaseDomain }) => {
  const { t } = useTranslation('common');
  const router = useRouter();

  const order =
    typeof router.query.order === 'string' ? router.query.order : null;

  const [status, setStatus] = useState<Status>('loading');
  const [handoff, setHandoff] = useState<ErpHandoff | null>(null);
  // Distinguishes an ERP-confirmed payment ("Paid") from the rollout-compat
  // optimistic settle, so the success panel can show honest copy for each.
  const [confirmedPaid, setConfirmedPaid] = useState(false);
  // Order reference recovered from the in-flight marker when the URL has none.
  const [resumeReference, setResumeReference] = useState<string | null>(null);
  // PG-23: the `packageId` the funnel recorded for THIS order. It is the only
  // route to a package name and price on this page — the `verify` response
  // carries neither, and the callback URL carries only the reference.
  const [receiptPackageId, setReceiptPackageId] = useState<string | null>(null);
  const [receiptPackage, setReceiptPackage] = useState<{
    name: string | null;
    amountMonthly: number | null;
  } | null>(null);
  const attemptsRef = useRef(0);
  const cancelledRef = useRef(false);
  // The single pending timer. Holding it in a ref is what makes a resume safe:
  // "a check is already scheduled" is observable, so resuming cannot double-fire.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the poll loop is live, false once a terminal state is set — so a
  // visibilitychange arriving after the loop finished cannot resurrect it.
  const pollActiveRef = useRef(false);
  // Lets the visibilitychange listener resume a poll that parked while hidden,
  // without reaching into the poll effect's closure.
  const scheduleNextRef = useRef<(() => void) | null>(null);

  const isLocalhost =
    typeof window !== 'undefined' && window.location.hostname === 'localhost';
  const maxAttempts = isLocalhost
    ? (parsePositiveInt(router.query.attempts) ?? MAX_ATTEMPTS)
    : MAX_ATTEMPTS;
  const pollIntervalMs = isLocalhost
    ? (parsePositiveInt(router.query.interval) ?? POLL_INTERVAL_MS)
    : POLL_INTERVAL_MS;

  useEffect(() => {
    if (!order) {
      // PG-24: a refresh or a Back-navigation mid-payment arrives here with no
      // reference in the URL. If this tab still has a payment in flight, offer
      // to resume checking it rather than declaring the payment unverifiable —
      // the customer may well have paid. The URL remains the source of truth:
      // the stored record is only used to rebuild the `?order=` link.
      const inFlight = readPaymentInFlight();
      setResumeReference(inFlight?.orderReference ?? null);
      setStatus(inFlight ? 'resume' : 'error');
      return;
    }

    // The callback URL now carries the reference, so the session marker has
    // done its job. Clearing it here keeps its lifetime exactly as long as the
    // gap it exists to bridge, and guarantees the query string always wins.
    //
    // PG-23: the marker is also read for the receipt's `packageId`, which must
    // happen BEFORE it is cleared. The match is exact and on the reference — a
    // marker left by a different attempt must never be shown against this
    // order, or the receipt would name the wrong package.
    const inFlight = readPaymentInFlight();
    if (inFlight?.orderReference === order) {
      setReceiptPackageId(inFlight.packageId);
      clearPaymentInFlight();
    }

    cancelledRef.current = false;
    pollActiveRef.current = true;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    // Every terminal branch routes through this, so a finished poll can never
    // be restarted by a later visibilitychange.
    const stopPolling = () => {
      pollActiveRef.current = false;
      clearTimer();
    };

    // PG-24: never spend the attempt budget, or issue a request, while the tab
    // is hidden. A backgrounded tab would otherwise burn the whole poll window
    // — and could derive a terminal state from an outage nobody was watching.
    // Parking instead of counting keeps the budget about *attempts*, not about
    // elapsed wall-clock time.
    const scheduleNext = () => {
      clearTimer();
      if (cancelledRef.current || !pollActiveRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      timerRef.current = setTimeout(check, pollIntervalMs);
    };

    scheduleNextRef.current = scheduleNext;

    const check = async () => {
      if (cancelledRef.current) return;

      attemptsRef.current += 1;

      try {
        const res = await fetch(
          `/api/public/erp/verify?reference=${encodeURIComponent(order)}`
        );

        if (cancelledRef.current) return;

        // A non-2xx response hides two very different failure classes, and
        // they must not be collapsed into one:
        //
        //  - A **4xx other than 429** is a client-side rejection — the BFF
        //    refusing an unknown/oversized reference, say. That is permanent:
        //    retrying can never turn it into a valid payment, so it is a hard
        //    error and must not be papered over with the reassuring settle.
        //  - A **429 or 5xx** is a transient infrastructure failure (rate
        //    limiter, BFF or ERP briefly down). It says nothing at all about
        //    the payment, so it must NOT be a hard error: it falls through to
        //    the normal poll path below, which means an outage during the poll
        //    window can still end in the optimistic settle instead of
        //    dead-ending a customer who may already have paid. Its body is
        //    deliberately not read — error responses are frequently not JSON
        //    (a gateway HTML page), and calling `res.json()` on one is itself
        //    a throw.
        //  - A **network failure** throws out of `fetch` and is handled by the
        //    catch below, unchanged.
        const isHardRejection =
          !res.ok &&
          res.status >= 400 &&
          res.status < 500 &&
          res.status !== 429;

        if (isHardRejection) {
          throw new Error('verify-rejected');
        }

        // `null` for a transient failure: the poll loop then treats the attempt
        // as "no status reported", which is precisely the pre-rollout
        // optimistic-settle semantics it already implements.
        const json = res.ok ? await res.json() : null;

        if (cancelledRef.current) return;

        const paymentStatus = normaliseVerifyStatus(json?.data?.status);
        const paid = paymentStatus === 'paid';

        // `success: false` is a hard failed payment regardless of `status`.
        if (paymentStatus === 'failed' || json?.data?.success === false) {
          stopPolling();
          router.replace(`/payment/failed?order=${encodeURIComponent(order)}`);
          return;
        }

        // The optimistic settle requires a genuinely ABSENT status: it is the
        // only way to stay compatible with a pre-rollout ERP that never sends
        // `status`. An explicit `Pending`, or a value this kit does not
        // recognise (`'unknown'`), must never be treated as success.
        const settleOptimistically =
          paymentStatus === null && attemptsRef.current >= maxAttempts;

        if (paid || settleOptimistically) {
          // Two ways to land here:
          //  - the ERP explicitly reported Paid; or
          //  - the poll window expired with NO `status` field at all, i.e.
          //    the ERP /verify endpoint cannot distinguish "Paid" from
          //    "Pending" yet (documented ERP limitation, P2.14). This is the
          //    PR #59 optimistic settle: treat it as received and let the ERP
          //    webhook settle the final state. It becomes unreachable once
          //    the ERP always returns `status`.
          const erpLoginRaw = window.sessionStorage.getItem('erpLogin');
          if (erpLoginRaw) {
            try {
              const erpLogin = JSON.parse(erpLoginRaw) as ErpLoginData;
              const targetUrl = getErpLoginTargetUrl(erpLogin, {
                isLocalhost: window.location.hostname === 'localhost',
                clientUrl: erpClientUrl,
                loginPath: erpLoginPath,
                baseDomain: erpBaseDomain,
              });

              // Never fall back to a token-in-URL link: an off-allowlist
              // target hides the CTA instead (the token stays unused).
              if (
                isAllowedRedirectUrl(targetUrl, {
                  erpClientUrl,
                  erpBaseDomain,
                })
              ) {
                setHandoff({
                  targetUrl,
                  token: erpLogin.token,
                  expiresIn: erpLogin.expiresIn,
                });
              } else {
                console.warn(
                  '[payment/success] rejected ERP handoff target (allowlist)',
                  targetUrl
                );
              }
            } catch {
              // malformed payload → CTA stays hidden
            } finally {
              window.sessionStorage.removeItem('erpLogin');
            }
          }

          stopPolling();
          setConfirmedPaid(paid);
          setStatus('success');
          return;
        }

        if (attemptsRef.current >= maxAttempts) {
          // The ERP still reports "Pending", or reported a status this kit
          // does not recognise, after the whole poll window — show the honest
          // pending state. No ERP CTA here: the webhook is what activates the
          // subscription, and handing over a login token before activation
          // would be misleading.
          stopPolling();
          setStatus('pending');
          return;
        }

        scheduleNext();
      } catch {
        if (cancelledRef.current) return;

        if (attemptsRef.current >= maxAttempts) {
          stopPolling();
          setStatus('error');
          return;
        }

        scheduleNext();
      }
    };

    check();

    return () => {
      cancelledRef.current = true;
      stopPolling();
      scheduleNextRef.current = null;
    };
  }, [
    order,
    router,
    maxAttempts,
    pollIntervalMs,
    erpClientUrl,
    erpLoginPath,
    erpBaseDomain,
  ]);

  // PG-23: resolve the recorded `packageId` against the public catalogue to get
  // the package name and its monthly price. Best-effort by design — every
  // failure mode (no catalogue access, a non-array body, an id that no longer
  // exists, a package without a price) leaves the receipt showing only what is
  // certain, the order reference. It never blocks or delays the poll loop, and
  // it never substitutes a placeholder for a missing field.
  useEffect(() => {
    if (!receiptPackageId) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/public/erp/packages');
        if (cancelled || !res.ok) return;

        const body = await res.json();
        const list = body?.data;
        if (!Array.isArray(list)) return;

        const match = list.find(
          (item: unknown) =>
            typeof item === 'object' &&
            item !== null &&
            (item as { id?: unknown }).id === receiptPackageId
        );
        if (!match || cancelled) return;

        const { name, priceMonthly } = match as {
          name?: unknown;
          priceMonthly?: unknown;
        };

        setReceiptPackage({
          name:
            typeof name === 'string' && name.trim() !== '' ? name.trim() : null,
          amountMonthly:
            typeof priceMonthly === 'number' && priceMonthly > 0
              ? priceMonthly
              : null,
        });
      } catch {
        // Non-fatal: the receipt degrades to the order reference alone.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [receiptPackageId]);

  // PG-24: the other half of the park/resume pair. Resuming is deliberately
  // narrow — it happens only when a check is NOT already pending (`timerRef`
  // would otherwise double-fire a request) and the loop is still live (`a
  // finished loop must not restart). The attempt counter is untouched, so time
  // spent hidden never consumes the poll budget.
  useEffect(() => {
    if (!order) return;

    const handleVisibilityChange = () => {
      if (document.hidden) return;
      if (!pollActiveRef.current || timerRef.current !== null) return;
      scheduleNextRef.current?.();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [order]);

  const render = () => {
    switch (status) {
      case 'loading':
        return (
          <PaymentStatus
            variant="loading"
            title={t('erp-payment-status-verifying-title')}
            message={t('erp-payment-status-verifying-msg')}
          />
        );
      case 'pending':
        return (
          <>
            <PaymentStatus
              variant="pending"
              title={t('erp-payment-status-pending-title')}
              message={t('erp-payment-status-pending-msg')}
              secondaryLabel={t('erp-payment-back-home')}
              secondaryHref="/"
            />
            {/* PG-23: the customer is told the payment is still being
                confirmed, so they need the reference to quote — and, when it
                resolved, what they are waiting on. */}
            {order && (
              <PaymentReceipt
                orderReference={order}
                packageName={receiptPackage?.name ?? null}
                amountMonthly={receiptPackage?.amountMonthly ?? null}
              />
            )}
          </>
        );
      case 'success':
        return (
          <>
            <PaymentStatus
              variant="success"
              title={
                confirmedPaid
                  ? t('erp-payment-status-paid-title')
                  : t('erp-payment-status-received-title')
              }
              message={
                confirmedPaid
                  ? t('erp-payment-status-paid-msg')
                  : t('erp-payment-status-received-msg')
              }
              primaryLabel={handoff ? t('erp-enter-system-button') : undefined}
              onPrimaryClick={
                handoff
                  ? () =>
                      submitErpPostHandoff({
                        targetUrl: handoff.targetUrl,
                        token: handoff.token,
                        expiresIn: handoff.expiresIn,
                      })
                  : undefined
              }
              secondaryLabel={t('erp-payment-back-home')}
              secondaryHref="/"
            />
            {order && (
              <PaymentReceipt
                orderReference={order}
                packageName={receiptPackage?.name ?? null}
                amountMonthly={receiptPackage?.amountMonthly ?? null}
              />
            )}
          </>
        );
      case 'resume':
        return (
          <PaymentStatus
            variant="pending"
            title={t('erp-payment-status-pending-title')}
            message={t('erp-payment-status-pending-msg')}
            primaryLabel={t('erp-payment-resume-check')}
            primaryHref={`/payment/success?order=${encodeURIComponent(
              resumeReference ?? ''
            )}`}
            secondaryLabel={t('erp-payment-back-home')}
            secondaryHref="/"
          />
        );
      case 'error':
        return (
          <PaymentStatus
            variant="error"
            title={t('erp-payment-status-error-title')}
            message={t('erp-payment-status-error-msg')}
            secondaryLabel={t('erp-payment-back-home')}
            secondaryHref="/"
          />
        );
    }
  };

  return (
    <>
      <SEO title={t('erp-payment-success-page-title')} noIndex={true} />

      <div className="bg-gradient-to-b from-slate-50 to-white px-4 py-16">
        {render()}
      </div>
    </>
  );
};

export async function getServerSideProps({
  locale,
}: GetServerSidePropsContext) {
  return {
    props: {
      ...(locale
        ? await serverSideTranslations(locale, ['common', 'marketing'])
        : await serverSideTranslations('ar', ['common', 'marketing'])),
      erpClientUrl: env.erp.clientUrl,
      erpLoginPath: env.erp.clientLoginPath,
      erpBaseDomain: env.erp.baseDomain,
    },
  };
}

PaymentSuccess.getLayout = function getLayout(page: ReactElement) {
  return <PublicLayout compact>{page}</PublicLayout>;
};

export default PaymentSuccess;
