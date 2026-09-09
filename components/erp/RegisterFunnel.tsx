import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Button } from 'react-daisyui';
import { useTranslation } from 'next-i18next';

import { Alert, InputWithLabel } from '@/components/shared';
import GoogleReCAPTCHA from '@/components/shared/GoogleReCAPTCHA';
import type ReCAPTCHA from 'react-google-recaptcha';
import { maxLengthPolicies } from '@/lib/common';
import { buildErpLoginUrl, type ErpRegistrationResult } from '@/lib/erp';
import { getErpLoginTargetUrl, submitErpPostHandoff } from '@/lib/erp/handoff';
import PaymentActivation from '@/components/erp/PaymentActivation';

interface RegisterFunnelProps {
  erpClientUrl: string;
  erpLoginPath: string;
  erpBaseDomain: string;
  recaptchaSiteKey?: string | null;
}

type Availability = 'idle' | 'checking' | 'available' | 'taken';
type Step = 'form' | 'success';

const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLengthPolicies.slug);
}

function getErpErrorMessage(
  message: unknown,
  t: (k: string) => string
): string {
  const raw = typeof message === 'string' ? message : '';
  if (raw.startsWith('erp-error-')) return t(raw);
  if (raw === 'Subdomain already taken.') return t('erp-error-subdomain-taken');
  if (raw === 'Admin email or username is already in use.')
    return t('erp-error-admin-exists');
  if (raw === 'Invalid package.') return t('erp-error-invalid-package');
  if (raw === 'You must select a package or custom modules.')
    return t('erp-error-must-select-package');
  if (raw === 'Tenant.Owner role is not configured.')
    return t('erp-error-role-unconfigured');
  return raw || t('erp-error-unexpected');
}

function isAllowedRedirectUrl(
  url: string,
  opts: { erpClientUrl: string; erpBaseDomain: string }
): boolean {
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }

  try {
    const u = new URL(url);

    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      return true;
    }

    if (opts.erpClientUrl) {
      const clientHost = new URL(opts.erpClientUrl).hostname;
      if (u.hostname === clientHost) {
        return true;
      }
    }

    return (
      u.hostname === opts.erpBaseDomain ||
      u.hostname.endsWith(`.${opts.erpBaseDomain}`)
    );
  } catch {
    return false;
  }
}

export function RegisterFunnel({
  erpClientUrl,
  erpLoginPath,
  erpBaseDomain,
  recaptchaSiteKey,
}: RegisterFunnelProps) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const packageId =
    typeof router.query.package === 'string' ? router.query.package : '';

  const [step, setStep] = useState<Step>('form');
  const [result, setResult] = useState<ErpRegistrationResult | null>(null);
  const [registeredCompany, setRegisteredCompany] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [subdomainCheck, setSubdomainCheck] = useState<Availability>('idle');
  const [emailCheck, setEmailCheck] = useState<Availability>('idle');
  const [recaptchaToken, setRecaptchaToken] = useState<string>('');
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const [copied, setCopied] = useState(false);
  const [redirectError, setRedirectError] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validationSchema = useMemo(
    () =>
      Yup.object().shape({
        companyName: Yup.string()
          .required(t('erp-validation-company-name-required'))
          .max(maxLengthPolicies.name),
        subdomain: Yup.string()
          .required(t('erp-validation-subdomain-required'))
          .matches(SUBDOMAIN_REGEX, t('erp-validation-subdomain-invalid'))
          .max(maxLengthPolicies.slug),
        adminEmail: Yup.string()
          .required(t('erp-validation-email-required'))
          .email(t('erp-validation-email-invalid'))
          .max(maxLengthPolicies.email),
        adminUserName: Yup.string()
          .required(t('erp-validation-username-required'))
          .min(3, t('erp-validation-username-min'))
          .max(50),
        adminPassword: Yup.string()
          .required(t('erp-validation-password-required'))
          .min(8, t('erp-validation-password-min'))
          .max(maxLengthPolicies.password),
        confirmPassword: Yup.string()
          .required(t('erp-validation-confirm-password-required'))
          .oneOf(
            [Yup.ref('adminPassword')],
            t('erp-validation-passwords-must-match')
          ),
        phoneNumber: Yup.string().notRequired().max(20),
      }),
    [t]
  );

  const formik = useFormik({
    initialValues: {
      companyName: '',
      subdomain: '',
      adminEmail: '',
      adminUserName: '',
      adminPassword: '',
      confirmPassword: '',
      phoneNumber: '',
    },
    validationSchema,
    enableReinitialize: true,
    onSubmit: async (values) => {
      if (!packageId) {
        setServerError(t('erp-register-select-package-first'));
        return;
      }

      if (subdomainCheck === 'taken') {
        setServerError(t('erp-error-subdomain-taken'));
        return;
      }

      if (emailCheck === 'taken') {
        setServerError(t('erp-error-admin-exists'));
        return;
      }

      setServerError(null);

      try {
        const res = await fetch('/api/public/erp/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName: values.companyName,
            subdomain: values.subdomain,
            adminEmail: values.adminEmail,
            adminUserName: values.adminUserName,
            adminPassword: values.adminPassword,
            phoneNumber: values.phoneNumber || undefined,
            packageId,
            trialDays: 14,
            recaptchaToken: recaptchaToken || undefined,
          }),
        });

        let body: {
          data?: ErpRegistrationResult;
          error?: { message?: string };
        } = {};
        try {
          body = await res.json();
        } catch {
          body = {};
        }

        if (!res.ok || body.data?.success === false) {
          // The reCAPTCHA token is single-use: once the server has validated
          // it (or the request failed), force a fresh solve on the next try.
          recaptchaRef.current?.reset();
          setRecaptchaToken('');
          setServerError(
            getErpErrorMessage(body.error?.message || body.data?.message, t)
          );
          return;
        }

        if (!body.data) {
          setServerError(t('erp-error-unexpected'));
          return;
        }

        setRegisteredCompany(values.companyName);
        setResult(body.data);
        setStep('success');

        // Keep the ERP login data for the post-payment success page
        try {
          sessionStorage.setItem(
            'erpLogin',
            JSON.stringify({
              token: body.data.authToken ?? null,
              expiresIn: body.data.expiresIn ?? null,
              subdomain: body.data.subdomain ?? '',
              redirectTo: body.data.redirectTo ?? '',
            })
          );
        } catch {
          // sessionStorage unavailable — the direct login button still works
        }
      } catch {
        // Network failure — the token may or may not have been consumed;
        // reset it so the user re-solves before retrying.
        recaptchaRef.current?.reset();
        setRecaptchaToken('');
        setServerError(t('erp-error-connection-failed'));
      }
    },
  });

  // Auto-suggest a slug from the company name until the user edits it
  useEffect(() => {
    if (!formik.values.subdomain && formik.values.companyName) {
      const slug = slugify(formik.values.companyName);
      if (slug) {
        void formik.setFieldValue('subdomain', slug);
      }
    }
  }, [formik.values.companyName, formik.values.subdomain, formik]);

  // Debounced live availability checks
  useEffect(() => {
    const subdomain = formik.values.subdomain;

    if (!SUBDOMAIN_REGEX.test(subdomain)) {
      setSubdomainCheck('idle');
      return;
    }

    setSubdomainCheck('checking');

    const timer = setTimeout(() => {
      fetch(
        `/api/public/erp/check-subdomain?subdomain=${encodeURIComponent(
          subdomain
        )}`
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          setSubdomainCheck(body?.data?.available ? 'available' : 'taken');
        })
        .catch(() => setSubdomainCheck('idle'));
    }, 600);

    return () => clearTimeout(timer);
  }, [formik.values.subdomain]);

  useEffect(() => {
    const email = formik.values.adminEmail;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailCheck('idle');
      return;
    }

    setEmailCheck('checking');

    const timer = setTimeout(() => {
      fetch(`/api/public/erp/check-email?email=${encodeURIComponent(email)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          setEmailCheck(body?.data?.available ? 'available' : 'taken');
        })
        .catch(() => setEmailCheck('idle'));
    }, 600);

    return () => clearTimeout(timer);
  }, [formik.values.adminEmail]);

  const targetLoginUrl = result
    ? getErpLoginTargetUrl(result, {
        isLocalhost:
          typeof window !== 'undefined' &&
          window.location.hostname === 'localhost',
        clientUrl: erpClientUrl,
        loginPath: erpLoginPath,
        baseDomain: erpBaseDomain,
      })
    : '';

  const loginUrl = result
    ? buildErpLoginUrl(result, {
        isLocalhost:
          typeof window !== 'undefined' &&
          window.location.hostname === 'localhost',
        clientUrl: erpClientUrl,
        loginPath: erpLoginPath,
        baseDomain: erpBaseDomain,
      })
    : '';

  const handleEnter = () => {
    if (isAllowedRedirectUrl(targetLoginUrl, { erpClientUrl, erpBaseDomain })) {
      submitErpPostHandoff({
        targetUrl: targetLoginUrl,
        token: result?.authToken,
        expiresIn: result?.expiresIn,
      });
      return;
    }

    setRedirectError(true);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(targetLoginUrl || loginUrl);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  if (step === 'success' && result) {
    return (
      <div className="rounded-2xl border border-green-300 bg-green-50 p-8 text-center">
        <div className="mb-4 text-5xl">🎉</div>
        <h2 className="mb-2 text-2xl font-bold text-green-800">
          {t('erp-success-title')}
        </h2>
        <p className="mb-1 text-gray-700">
          {registeredCompany || result.subdomain}
        </p>
        <p className="mb-8 text-sm text-gray-600">
          {t('erp-subdomain-display-label')}{' '}
          <span dir="ltr" className="font-mono">
            {result.subdomain}
          </span>
        </p>

        {redirectError && (
          <Alert status="error" className="mb-5">
            {t('erp-login-redirect-error')}
          </Alert>
        )}

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button color="primary" size="md" onClick={handleEnter}>
            {t('erp-enter-system-button')}
          </Button>
          <Button variant="outline" size="md" onClick={handleCopy}>
            {copied ? t('erp-link-copied') : t('erp-copy-link-button')}
          </Button>
        </div>

        <PaymentActivation
          companyName={registeredCompany || result.subdomain || ''}
          customerEmail={formik.values.adminEmail}
          customerPhone={formik.values.phoneNumber}
          packageId={packageId}
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 p-6 shadow-sm sm:p-8">
      {!packageId && (
        <Alert status="warning" className="mb-5">
          {t('erp-register-choose-package-banner')}
          <Link href="/pricing" className="mr-2 font-medium underline">
            {t('erp-register-pricing-page-link')}
          </Link>
        </Alert>
      )}

      {serverError && (
        <Alert status="error" className="mb-5">
          {serverError}
        </Alert>
      )}

      <form onSubmit={formik.handleSubmit} className="space-y-3">
        <InputWithLabel
          type="text"
          label={t('erp-company-name-label')}
          name="companyName"
          placeholder={t('erp-company-name-placeholder')}
          value={formik.values.companyName}
          error={
            formik.touched.companyName ? formik.errors.companyName : undefined
          }
          onChange={formik.handleChange}
        />

        <div>
          <InputWithLabel
            type="text"
            label={t('erp-subdomain-label')}
            name="subdomain"
            placeholder={t('erp-subdomain-placeholder')}
            value={formik.values.subdomain}
            error={
              formik.touched.subdomain ? formik.errors.subdomain : undefined
            }
            onChange={formik.handleChange}
          />
          {subdomainCheck === 'checking' && (
            <p className="mt-1 text-sm text-gray-500">
              {t('erp-subdomain-checking')}
            </p>
          )}
          {subdomainCheck === 'taken' && (
            <p className="mt-1 text-sm text-error">
              {t('erp-subdomain-taken')}
            </p>
          )}
        </div>

        <div>
          <InputWithLabel
            type="email"
            label={t('erp-admin-email-label')}
            name="adminEmail"
            placeholder="admin@company.com"
            value={formik.values.adminEmail}
            error={
              formik.touched.adminEmail ? formik.errors.adminEmail : undefined
            }
            onChange={formik.handleChange}
          />
          {emailCheck === 'taken' && (
            <p className="mt-1 text-sm text-error">{t('erp-email-taken')}</p>
          )}
        </div>

        <InputWithLabel
          type="text"
          label={t('erp-admin-username-label')}
          name="adminUserName"
          placeholder="admin"
          value={formik.values.adminUserName}
          error={
            formik.touched.adminUserName
              ? formik.errors.adminUserName
              : undefined
          }
          onChange={formik.handleChange}
        />

        <InputWithLabel
          type="password"
          label={t('erp-admin-password-label')}
          name="adminPassword"
          placeholder={t('erp-password-placeholder')}
          value={formik.values.adminPassword}
          error={
            formik.touched.adminPassword
              ? formik.errors.adminPassword
              : undefined
          }
          onChange={formik.handleChange}
        />

        <InputWithLabel
          type="password"
          label={t('erp-confirm-password-label')}
          name="confirmPassword"
          placeholder={t('erp-confirm-password-placeholder')}
          value={formik.values.confirmPassword}
          error={
            formik.touched.confirmPassword
              ? formik.errors.confirmPassword
              : undefined
          }
          onChange={formik.handleChange}
        />

        <InputWithLabel
          type="tel"
          label={t('erp-phone-number-label')}
          name="phoneNumber"
          placeholder={t('erp-phone-number-placeholder')}
          value={formik.values.phoneNumber}
          error={
            formik.touched.phoneNumber ? formik.errors.phoneNumber : undefined
          }
          onChange={formik.handleChange}
        />

        <GoogleReCAPTCHA
          recaptchaRef={recaptchaRef}
          onChange={setRecaptchaToken}
          siteKey={recaptchaSiteKey || null}
        />

        <div className="mt-6">
          <Button
            type="submit"
            color="primary"
            loading={formik.isSubmitting}
            disabled={!packageId}
            fullWidth
            size="md"
          >
            {t('erp-register-submit-button')}
          </Button>
        </div>

        <p className="text-center text-xs text-gray-500">
          {t('erp-register-disclaimer')}
        </p>
      </form>
    </div>
  );
}
