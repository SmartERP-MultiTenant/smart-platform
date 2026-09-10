import { type ReactElement } from 'react';
import type { NextPageWithLayout } from 'types';
import { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  DocumentTextIcon,
  CreditCardIcon,
  BuildingLibraryIcon,
} from '@heroicons/react/24/outline';

import { PublicLayout } from '@/components/layouts';
import SEO from '@/components/shared/SEO';

const TermsPage: NextPageWithLayout = () => {
  const router = useRouter();
  const isEn = router.locale === 'en';

  const lastUpdated = isEn ? 'September 10, 2026' : '10 سبتمبر 2026';
  const title = isEn
    ? 'Terms & Conditions — SMART PLATFORM'
    : 'الشروط والأحكام — SMART PLATFORM';
  const description = isEn
    ? 'Terms of Service, KSA VAT compliance, and refund policies for SMART PLATFORM.'
    : 'الشروط والأحكام، الامتثال لضريبة القيمة المضافة السعودية وسياسات الاسترجاع لمنصة سمارت.';

  return (
    <>
      <SEO title={title} description={description} ogType="article" />

      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12 border-b border-gray-100 pb-8 text-center sm:text-start">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-primary-50)] px-3.5 py-1 text-xs font-semibold text-[var(--ds-primary-700)]">
            <DocumentTextIcon className="h-4 w-4" />
            {isEn ? 'Legal Agreement' : 'اتفاقية الاستخدام'}
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#111827] sm:text-4xl">
            {isEn ? 'Terms & Conditions' : 'الشروط والأحكام'}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {isEn ? `Last updated: ${lastUpdated}` : `آخر تحديث: ${lastUpdated}`}
          </p>
        </div>

        {/* Content Clauses */}
        <div className="space-y-10 text-[15px] leading-relaxed text-gray-700">
          {/* Section 1 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold text-[#111827]">
              {isEn ? '1. Introduction & Acceptance' : '1. مقدمة وقبول الشروط'}
            </h2>
            <p className="mt-3">
              {isEn
                ? 'Welcome to SMART PLATFORM, an integrated cloud Enterprise Resource Planning (ERP) platform designed for Saudi and regional enterprises. By creating an account, subscribing to our services, or using any part of the platform, you agree to be bound by these Terms and Conditions.'
                : 'أهلاً بك في منصة SMART PLATFORM، منظومة تخطيط الموارد السحابية (ERP) المتكاملة المصممة للمنشآت في المملكة العربية السعودية والمنطقة. بمجرد إنشاء حسابك أو الاشتراك في خدماتنا، فإنك توافق على الالتزام الكامل بهذه الشروط والأحكام.'}
            </p>
          </section>

          {/* Section 2 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold text-[#111827]">
              {isEn ? '2. Services & Enterprise Account' : '2. نطاق الخدمة وحساب المنشأة'}
            </h2>
            <ul className="mt-3 list-disc space-y-2 ps-5 text-gray-600">
              <li>
                {isEn
                  ? 'SMART PLATFORM provides cloud-based modules including Accounting, Inventory, Sales, HR, and e-Invoicing.'
                  : 'توفر المنصة حلولاً سحابية تشمل المحاسبة العامة، إدارة المخزون، المبيعات ونقاط البيع، الموارد البشرية والفوترة الإلكترونية.'}
              </li>
              <li>
                {isEn
                  ? 'You are responsible for maintaining the confidentiality of your login credentials and for all activities conducted under your organization account.'
                  : 'تتحمل المنشأة المشتركة المسؤولية الكاملة عن سرية بيانات الدخول وصحة العمليات والقيود المحاسبية المدخلة في النظام.'}
              </li>
              <li>
                {isEn
                  ? 'Data entered by your team remains your exclusive property, and you can export your data at any time.'
                  : 'تظل كافة البيانات والمدخلات المالية والمحاسبية ملكاً حصرياً للمنشأة، ويحق لك تصديرها واستخراج نسخ منها في أي وقت.'}
              </li>
            </ul>
          </section>

          {/* Section 3: KSA VAT & ZATCA */}
          <section className="rounded-2xl border border-primary/20 bg-[var(--ds-primary-50)]/40 p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-2 text-[var(--ds-primary-700)]">
              <BuildingLibraryIcon className="h-6 w-6" />
              <h2 className="text-xl font-bold text-[#111827]">
                {isEn
                  ? '3. KSA VAT (15%) & ZATCA e-Invoicing Compliance'
                  : '3. ضريبة القيمة المضافة (15%) والامتثال لمنظومة زاتكا (ZATCA)'}
              </h2>
            </div>
            <div className="mt-4 space-y-3 text-gray-700">
              <p>
                {isEn
                  ? 'All subscription fees and platform services are subject to the Value Added Tax (VAT) rate of 15% in accordance with the regulations of the Zakat, Tax and Customs Authority (ZATCA) in the Kingdom of Saudi Arabia.'
                  : 'تخضع جميع رسوم الاشتراكات والخدمات لضريبة القيمة المضافة بنسبة 15% وفقاً للوائح هيئة الزكاة والضريبة والجمارك (ZATCA) في المملكة العربية السعودية.'}
              </p>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-sm font-semibold text-gray-900">
                  {isEn
                    ? 'Official Tax Identification Number (TRN): 310428442600003'
                    : 'الرقم الضريبي المعتمد للمنشأة (TRN): 310428442600003'}
                </p>
              </div>
              <p>
                {isEn
                  ? 'SMART PLATFORM generates compliant Phase 2 e-Invoices with cryptographic stamps and QR codes for all paid transactions and subscription renewals.'
                  : 'تصدر المنصة فواتير ضريبية إلكترونية معتمدة ومتوافقة مع متطلبات المرحلة الثانية للربط والتكامل مع هيئة الزكاة والضريبة والجمارك لكل عملية اشتراك أو تجديد.'}
              </p>
            </div>
          </section>

          {/* Section 4: Refund Policy per Provider */}
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-2 text-[#111827]">
              <CreditCardIcon className="h-6 w-6 text-primary" />
              <h2 className="text-xl font-bold">
                {isEn
                  ? '4. Payment Methods & Provider Refund Policies'
                  : '4. طرق الدفع وسياسات الاسترجاع المعتمدة'}
              </h2>
            </div>
            <p className="mt-3 text-gray-600">
              {isEn
                ? 'We offer transparent refund and cancellation policies based on your chosen payment gateway:'
                : 'نلتزم بسياسات استرجاع وإلغاء واضحة وشفافة وفق بوابة الدفع المستخدمة:'}
            </p>

            <div className="mt-6 space-y-4">
              {/* Moyasar */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
                <h3 className="font-bold text-[#111827]">
                  {isEn
                    ? 'Moyasar (mada, Visa, Mastercard, Apple Pay)'
                    : 'بوابة ميسر (مدى، فيزا، ماستركارد، Apple Pay)'}
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  {isEn
                    ? 'Eligible refund requests approved within our 14-day trial period are processed back to the original bank card. Depending on your issuing bank, the funds typically reflect within 5 to 14 business days.'
                    : 'في حال طلب الاسترجاع المؤهل خلال فترة الضمان (14 يوماً من الاشتراك الأول)، يتم رد المبلغ مباشرة لنفس البطاقة المصرفية المستخدمة خلال 5 إلى 14 يوم عمل حسب البنك المصدر للبطاقة.'}
                </p>
              </div>

              {/* Tabby */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
                <h3 className="font-bold text-[#111827]">
                  {isEn
                    ? 'Tabby (Buy Now, Pay Later - BNPL)'
                    : 'خدمة تابي (الدفع الآجل والأقساط - Tabby)'}
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  {isEn
                    ? 'For subscriptions paid via Tabby, refunds are handled through Tabby. Upcoming scheduled installments are canceled, and any paid installments are refunded directly to your Tabby wallet/account according to Tabby policies.'
                    : 'للاشتراكات المدفوعة عبر تابي، تتم معالجة الاسترجاع عبر منصة تابي حيث يتم إلغاء الأقساط القادمة ورد المبالغ المدفوعة لحساب العميل في تابي وفق سياسات الخدمة.'}
                </p>
              </div>

              {/* Tamara */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
                <h3 className="font-bold text-[#111827]">
                  {isEn
                    ? 'Tamara (Buy Now, Pay Later - BNPL)'
                    : 'خدمة تمارا (الدفع الآجل والأقساط - Tamara)'}
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  {isEn
                    ? 'Approved refunds for Tamara transactions are automatically communicated to Tamara. Your payment schedule will be adjusted, and refunded amounts will be processed back to your Tamara payment method.'
                    : 'عند الموافقة على استرجاع اشتراك مدفوع عبر تمارا، يتم تعديل خطة الدفع ورد المبالغ المستحقة لحسابك لدى تمارا تلقائياً.'}
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold text-[#111827]">
              {isEn
                ? '5. Service Availability & Security SLA'
                : '5. مستوى الخدمة واستمرارية التشغيل'}
            </h2>
            <p className="mt-3 text-gray-600">
              {isEn
                ? 'We target 99.9% uptime for cloud services. All customer data is secured with AES-256 encryption at rest and TLS 1.3 in transit, with automated daily backups to protect business continuity.'
                : 'نلتزم بتوفير المنظومة بنسبة توافر 99.9% مع تطبيق معايير الأمان والتشفير المتقدم (AES-256) أثناء الحفظ و(TLS 1.3) أثناء النقل، إضافة إلى النسخ الاحتياطي اليومي لضمان استمرارية أعمالك.'}
            </p>
          </section>

          {/* Section 6 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold text-[#111827]">
              {isEn
                ? '6. Governing Law & Jurisdiction'
                : '6. القانون الحاكم والاختصاص القضائي'}
            </h2>
            <p className="mt-3 text-gray-600">
              {isEn
                ? 'These Terms and Conditions are governed by and construed in accordance with the laws and regulations of the Kingdom of Saudi Arabia. Any disputes shall be subject to the exclusive jurisdiction of the competent commercial courts in Saudi Arabia.'
                : 'تخضع هذه الشروط والأحكام وتفسر وفقاً للأنظمة واللوائح السارية في المملكة العربية السعودية، وتختص المحاكم التجارية بالمملكة بالفصل في أي نزاع ينشأ عنها.'}
            </p>
          </section>
        </div>

        {/* Footer CTA */}
        <div className="mt-12 text-center">
          <Link
            href="/register"
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--ds-primary-600)] px-8 text-sm font-medium text-white transition hover:bg-[var(--ds-primary-700)]"
          >
            {isEn ? 'Start Your Free Trial' : 'ابدأ تجربتك المجانية الآن'}
          </Link>
        </div>
      </div>
    </>
  );
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  const { locale } = context;
  const currentLocale = locale || 'ar';

  return {
    props: {
      ...(await serverSideTranslations(currentLocale, ['common', 'marketing'])),
    },
  };
};

TermsPage.getLayout = function getLayout(page: ReactElement) {
  return <PublicLayout>{page}</PublicLayout>;
};

export default TermsPage;
