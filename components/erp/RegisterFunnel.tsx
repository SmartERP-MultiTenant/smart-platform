import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Button } from 'react-daisyui';

import { Alert, InputWithLabel } from '@/components/shared';
import { maxLengthPolicies } from '@/lib/common';
import { buildErpLoginUrl, type ErpRegistrationResult } from '@/lib/erp';
import PaymentActivation from '@/components/erp/PaymentActivation';

interface RegisterFunnelProps {
  erpClientUrl: string;
  erpLoginPath: string;
  erpBaseDomain: string;
}

type Availability = 'idle' | 'checking' | 'available' | 'taken';
type Step = 'form' | 'success';

const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

const ERP_ERROR_MAP: Record<string, string> = {
  'Subdomain already taken.': 'هذا الرابط الفرعي محجوز بالفعل، اختر اسماً آخر',
  'Admin email or username is already in use.':
    'البريد الإلكتروني أو اسم المستخدم مستخدم بالفعل',
  'Invalid package.': 'الباقة غير صالحة، اختر باقة من صفحة الأسعار',
  'You must select a package or custom modules.': 'يجب اختيار باقة',
  'Tenant.Owner role is not configured.': 'خطأ في تجهيز النظام، تواصل مع الدعم',
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLengthPolicies.slug);
}

function mapErpError(message: unknown): string {
  const raw = typeof message === 'string' ? message : '';
  return ERP_ERROR_MAP[raw] || raw || 'حدث خطأ غير متوقع، حاول مرة أخرى';
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
}: RegisterFunnelProps) {
  const router = useRouter();
  const packageId =
    typeof router.query.package === 'string' ? router.query.package : '';

  const [step, setStep] = useState<Step>('form');
  const [result, setResult] = useState<ErpRegistrationResult | null>(null);
  const [registeredCompany, setRegisteredCompany] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [subdomainCheck, setSubdomainCheck] = useState<Availability>('idle');
  const [emailCheck, setEmailCheck] = useState<Availability>('idle');
  const [copied, setCopied] = useState(false);
  const [redirectError, setRedirectError] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    validationSchema: Yup.object().shape({
      companyName: Yup.string()
        .required('الاسم التجاري مطلوب')
        .max(maxLengthPolicies.name),
      subdomain: Yup.string()
        .required('الرابط الفرعي مطلوب')
        .matches(
          SUBDOMAIN_REGEX,
          'أحرف إنجليزية صغيرة وأرقام وشرطات فقط (من 3 إلى 32 حرفاً)'
        )
        .max(maxLengthPolicies.slug),
      adminEmail: Yup.string()
        .required('البريد الإلكتروني مطلوب')
        .email('صيغة البريد الإلكتروني غير صحيحة')
        .max(maxLengthPolicies.email),
      adminUserName: Yup.string()
        .required('اسم المستخدم مطلوب')
        .min(3, 'اسم المستخدم لا يقل عن 3 أحرف')
        .max(50),
      adminPassword: Yup.string()
        .required('كلمة المرور مطلوبة')
        .min(8, 'كلمة المرور لا تقل عن 8 أحرف')
        .max(maxLengthPolicies.password),
      confirmPassword: Yup.string()
        .required('تأكيد كلمة المرور مطلوب')
        .oneOf([Yup.ref('adminPassword')], 'كلمتا المرور غير متطابقتين'),
      phoneNumber: Yup.string().notRequired().max(20),
    }),
    onSubmit: async (values) => {
      if (!packageId) {
        setServerError('اختر باقة أولاً من صفحة الأسعار');
        return;
      }

      if (subdomainCheck === 'taken') {
        setServerError('هذا الرابط الفرعي محجوز بالفعل، اختر اسماً آخر');
        return;
      }

      if (emailCheck === 'taken') {
        setServerError('البريد الإلكتروني مستخدم بالفعل');
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
          setServerError(
            mapErpError(body.error?.message || body.data?.message)
          );
          return;
        }

        if (!body.data) {
          setServerError('حدث خطأ غير متوقع، حاول مرة أخرى');
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
        setServerError('تعذر الاتصال بالخادم، حاول مرة أخرى');
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
    if (isAllowedRedirectUrl(loginUrl, { erpClientUrl, erpBaseDomain })) {
      window.location.href = loginUrl;
      return;
    }

    setRedirectError(true);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(loginUrl);
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
          تم إنشاء شركتك بنجاح
        </h2>
        <p className="mb-1 text-gray-700">
          {registeredCompany || result.subdomain}
        </p>
        <p className="mb-8 text-sm text-gray-600">
          الرابط الفرعي:{' '}
          <span dir="ltr" className="font-mono">
            {result.subdomain}
          </span>
        </p>

        {redirectError && (
          <Alert status="error" className="mb-5">
            تعذر إعداد رابط الدخول، تواصل مع الدعم
          </Alert>
        )}

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button color="primary" size="md" onClick={handleEnter}>
            الدخول إلى النظام
          </Button>
          <Button variant="outline" size="md" onClick={handleCopy}>
            {copied ? 'تم النسخ ✓' : 'نسخ الرابط'}
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
          اختر باقة أولاً من صفحة الأسعار ثم عد إلى هنا
          <Link href="/pricing" className="mr-2 font-medium underline">
            صفحة الأسعار
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
          label="الاسم التجاري للشركة"
          name="companyName"
          placeholder="مثال: مؤسسة النور التجارية"
          value={formik.values.companyName}
          error={
            formik.touched.companyName ? formik.errors.companyName : undefined
          }
          onChange={formik.handleChange}
        />

        <div>
          <InputWithLabel
            type="text"
            label="الرابط الفرعي"
            name="subdomain"
            placeholder="your-company"
            value={formik.values.subdomain}
            error={
              formik.touched.subdomain ? formik.errors.subdomain : undefined
            }
            onChange={formik.handleChange}
          />
          {subdomainCheck === 'checking' && (
            <p className="mt-1 text-sm text-gray-500">جاري التحقق…</p>
          )}
          {subdomainCheck === 'taken' && (
            <p className="mt-1 text-sm text-error">
              هذا الرابط الفرعي محجوز بالفعل
            </p>
          )}
        </div>

        <div>
          <InputWithLabel
            type="email"
            label="بريد المدير"
            name="adminEmail"
            placeholder="admin@company.com"
            value={formik.values.adminEmail}
            error={
              formik.touched.adminEmail ? formik.errors.adminEmail : undefined
            }
            onChange={formik.handleChange}
          />
          {emailCheck === 'taken' && (
            <p className="mt-1 text-sm text-error">
              البريد الإلكتروني مستخدم بالفعل
            </p>
          )}
        </div>

        <InputWithLabel
          type="text"
          label="اسم المستخدم"
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
          label="كلمة المرور"
          name="adminPassword"
          placeholder="8 أحرف على الأقل"
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
          label="تأكيد كلمة المرور"
          name="confirmPassword"
          placeholder="أعد إدخال كلمة المرور"
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
          label="رقم الجوال (اختياري)"
          name="phoneNumber"
          placeholder="05xxxxxxxx"
          value={formik.values.phoneNumber}
          error={
            formik.touched.phoneNumber ? formik.errors.phoneNumber : undefined
          }
          onChange={formik.handleChange}
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
            إنشاء الشركة والبدء
          </Button>
        </div>

        <p className="text-center text-xs text-gray-500">
          بالتسجيل أنت توافق على شروط الاستخدام وسياسة الخصوصية · تجربة مجانية
          14 يوماً بدون بطاقة ائتمانية
        </p>
      </form>
    </div>
  );
}
