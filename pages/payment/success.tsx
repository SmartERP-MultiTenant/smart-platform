import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import type { NextPageWithLayout } from 'types';

import { PublicLayout } from '@/components/layouts';
import PaymentStatus from '@/components/payment/PaymentStatus';
import SEO from '@/components/shared/SEO';
import {
  getErpLoginTargetUrl,
  isAllowedRedirectUrl,
  submitErpPostHandoff,
} from '@/lib/erp/handoff';
import env from '@/lib/env';

// `failed` is deliberately absent from this union: a failed payment never
// renders on this page, it is redirected to /payment/failed by the poll loop.
type Status = 'loading' | 'success' | 'pending' | 'error';

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
  const attemptsRef = useRef(0);
  const cancelledRef = useRef(false);

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
      setStatus('error');
      return;
    }

    cancelledRef.current = false;

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
          setStatus('pending');
          return;
        }

        setTimeout(check, pollIntervalMs);
      } catch {
        if (cancelledRef.current) return;

        if (attemptsRef.current >= maxAttempts) {
          setStatus('error');
          return;
        }

        setTimeout(check, pollIntervalMs);
      }
    };

    check();

    return () => {
      cancelledRef.current = true;
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
          <PaymentStatus
            variant="pending"
            title={t('erp-payment-status-pending-title')}
            message={t('erp-payment-status-pending-msg')}
            secondaryLabel={t('erp-payment-back-home')}
            secondaryHref="/"
          />
        );
      case 'success':
        return (
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
