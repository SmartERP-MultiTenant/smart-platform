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

type Status = 'loading' | 'success' | 'failed' | 'error';

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
        const json = await res.json();

        if (cancelledRef.current) return;

        // ERP verify returns { success } — true means Paid OR still Pending.
        // Only a webhook can move it to Failed; a hard false means it failed.
        if (json?.data?.success === false) {
          router.replace(`/payment/failed?order=${encodeURIComponent(order)}`);
          return;
        }

        if (attemptsRef.current >= maxAttempts) {
          // NOTE: the ERP /verify endpoint cannot distinguish "Paid" from
          // "Pending" yet (documented ERP limitation) — after the poll window
          // we optimistically treat it as received and let the ERP webhook
          // settle the final state.
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
          setStatus('success');
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
      case 'success':
        return (
          <PaymentStatus
            variant="success"
            title={t('erp-payment-status-received-title')}
            message={t('erp-payment-status-received-msg')}
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
      case 'failed':
        return (
          <PaymentStatus
            variant="failed"
            title={t('erp-payment-status-failed-title')}
            message={t('erp-payment-status-failed-msg')}
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
