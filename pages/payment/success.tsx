import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import type { NextPageWithLayout } from 'types';

import { PublicLayout } from '@/components/layouts';
import PaymentStatus from '@/components/payment/PaymentStatus';

type Status = 'loading' | 'success' | 'failed' | 'error';

const MAX_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 2000;

interface ErpLoginData {
  token?: string;
  expiresIn?: string;
  subdomain?: string;
  redirectTo?: string;
}

const buildErpLoginUrl = (erpLogin: ErpLoginData): string => {
  const tokenParam = `token=${encodeURIComponent(erpLogin.token || '')}&expiresIn=${encodeURIComponent(
    erpLogin.expiresIn || ''
  )}`;

  // Local full-stack dev: the Angular ERP client runs on :4200 (http).
  if (
    typeof window !== 'undefined' &&
    window.location.hostname === 'localhost'
  ) {
    return `http://localhost:4200/auth/login?${tokenParam}`;
  }

  // Production: prefer the ERP-provided redirect (tenant subdomain), fall back
  // to the subdomain pattern.
  const base =
    erpLogin.redirectTo ||
    `https://${erpLogin.subdomain || 'app'}.smartapro.com`;
  return `${base}/auth/login?${tokenParam}`;
};

const PaymentSuccess: NextPageWithLayout = () => {
  const { t } = useTranslation('common');
  const router = useRouter();

  const order =
    typeof router.query.order === 'string' ? router.query.order : null;

  const [status, setStatus] = useState<Status>('loading');
  const [erpLoginUrl, setErpLoginUrl] = useState<string>('');
  const attemptsRef = useRef(0);
  const cancelledRef = useRef(false);

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

        if (attemptsRef.current >= MAX_ATTEMPTS) {
          // NOTE: the ERP /verify endpoint cannot distinguish "Paid" from
          // "Pending" yet (documented ERP limitation) — after the poll window
          // we optimistically treat it as received and let the ERP webhook
          // settle the final state.
          const erpLoginRaw = window.sessionStorage.getItem('erpLogin');
          if (erpLoginRaw) {
            try {
              const erpLogin = JSON.parse(erpLoginRaw) as ErpLoginData;
              setErpLoginUrl(buildErpLoginUrl(erpLogin));
            } catch {
              // malformed payload → CTA stays hidden
            } finally {
              window.sessionStorage.removeItem('erpLogin');
            }
          }
          setStatus('success');
          return;
        }

        setTimeout(check, POLL_INTERVAL_MS);
      } catch {
        if (cancelledRef.current) return;

        if (attemptsRef.current >= MAX_ATTEMPTS) {
          setStatus('error');
          return;
        }

        setTimeout(check, POLL_INTERVAL_MS);
      }
    };

    check();

    return () => {
      cancelledRef.current = true;
    };
  }, [order, router]);

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
            primaryLabel={
              erpLoginUrl ? t('erp-enter-system-button') : undefined
            }
            primaryHref={erpLoginUrl || undefined}
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
      <Head>
        <title>{t('erp-payment-success-page-title')}</title>
      </Head>

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
    },
  };
}

PaymentSuccess.getLayout = function getLayout(page: ReactElement) {
  return <PublicLayout compact>{page}</PublicLayout>;
};

export default PaymentSuccess;
