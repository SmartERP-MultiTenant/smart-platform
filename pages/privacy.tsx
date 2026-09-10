import { type ReactElement } from 'react';
import type { NextPageWithLayout } from 'types';
import { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ShieldCheckIcon,
  LockClosedIcon,
  ServerStackIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

import { PublicLayout } from '@/components/layouts';
import SEO from '@/components/shared/SEO';

const PrivacyPage: NextPageWithLayout = () => {
  const router = useRouter();
  const isEn = router.locale === 'en';

  const lastUpdated = isEn ? 'September 10, 2026' : '10 سبتمبر 2026';
  const title = isEn
    ? 'Privacy Policy — SMART PLATFORM'
    : 'سياسة الخصوصية — SMART PLATFORM';
  const description = isEn
    ? 'Privacy Statement, PDPL compliance, and data protection policies for SMART PLATFORM.'
    : 'سياسة الخصوصية، الامتثال لنظام حماية البيانات الشخصية السعودي وسياسات الأمان لمنصة سمارت.';

  return (
    <>
      <SEO title={title} description={description} ogType="article" />

      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12 border-b border-gray-100 pb-8 text-center sm:text-start">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-primary-50)] px-3.5 py-1 text-xs font-semibold text-[var(--ds-primary-700)]">
            <ShieldCheckIcon className="h-4 w-4" />
            {isEn ? 'Data Protection' : 'حماية البيانات'}
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#111827] sm:text-4xl">
            {isEn ? 'Privacy Policy' : 'سياسة الخصوصية'}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {isEn
              ? `Last updated: ${lastUpdated}`
              : `آخر تحديث: ${lastUpdated}`}
          </p>
        </div>

        {/* Content Clauses */}
        <div className="space-y-10 text-[15px] leading-relaxed text-gray-700">
          {/* Section 1: PDPL */}
          <section className="rounded-2xl border border-primary/20 bg-[var(--ds-primary-50)]/40 p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-2 text-[var(--ds-primary-700)]">
              <LockClosedIcon className="h-6 w-6" />
              <h2 className="text-xl font-bold text-[#111827]">
                {isEn
                  ? '1. Commitment to Saudi PDPL Regulations'
                  : '1. الالتزام بنظام حماية البيانات الشخصية السعودي (PDPL)'}
              </h2>
            </div>
            <p className="mt-3 text-gray-700">
              {isEn
                ? 'SMART PLATFORM is fully committed to the Personal Data Protection Law (PDPL) enacted in the Kingdom of Saudi Arabia. We ensure that all personal and enterprise records are gathered, processed, and maintained in strict adherence to Saudi privacy regulations.'
                : 'تلتزم منصة SMART PLATFORM بشكل كامل بنظام حماية البيانات الشخصية (PDPL) المعمول به في المملكة العربية السعودية، ونحرص على جمع ومعالجة وحفظ كافة البيانات بما يتماشى مع أعلى المعايير واللوائح التنظيمية بالمملكة.'}
            </p>
          </section>

          {/* Section 2 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold text-[#111827]">
              {isEn ? '2. Information We Collect' : '2. البيانات التي نجمعها'}
            </h2>
            <ul className="mt-3 list-disc space-y-2 ps-5 text-gray-600">
              <li>
                <strong className="text-[#111827]">
                  {isEn ? 'Account Information: ' : 'بيانات الحساب: '}
                </strong>
                {isEn
                  ? 'Name, corporate email, mobile number, organization name, and commercial registration (CR).'
                  : 'الاسم، البريد الإلكتروني للعمل، رقم الجوال، اسم المنشأة، والسجل التجاري.'}
              </li>
              <li>
                <strong className="text-[#111827]">
                  {isEn ? 'Operational Data: ' : 'البيانات التشغيلية: '}
                </strong>
                {isEn
                  ? 'Invoices, accounting records, items, and inventory data entered by your team members in the ERP.'
                  : 'الفواتير، القيود المحاسبية، المخزون، وسجلات المبيعات والعملاء المدخلة في المنظومة.'}
              </li>
              <li>
                <strong className="text-[#111827]">
                  {isEn
                    ? 'Security & Technical Logs: '
                    : 'سجلات الأمان والتقنية: '}
                </strong>
                {isEn
                  ? 'IP addresses, browser session identifiers, and audit logs to protect your workspace against unauthorized access.'
                  : 'عنوان IP، سجلات الدخول والأمان، وجلسات المستخدمين لحماية الحساب من أي وصول غير مصرح به.'}
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold text-[#111827]">
              {isEn ? '3. How We Use Your Data' : '3. أوجه استخدام البيانات'}
            </h2>
            <p className="mt-3 text-gray-600">
              {isEn
                ? 'We utilize customer and organizational data exclusively to:'
                : 'نستخدم البيانات حصرياً للأغراض التشغيلية التالية:'}
            </p>
            <ul className="mt-3 list-disc space-y-2 ps-5 text-gray-600">
              <li>
                {isEn
                  ? 'Provision, operate, and maintain your cloud ERP workspace and database.'
                  : 'توفير وتشغيل وتحديث منظومة الـ ERP الخاصة بمنشأتك وقواعد بياناتها.'}
              </li>
              <li>
                {isEn
                  ? 'Authenticate users and enforce multi-tenant organization isolation.'
                  : 'التحقق من هوية المستخدمين وضمان العزل التام لبيانات كل مستأجر.'}
              </li>
              <li>
                {isEn
                  ? 'Process billing subscriptions and issue ZATCA-compliant e-invoices.'
                  : 'إدارة وتجديد الاشتراكات وإصدار الفواتير الضريبية الإلكترونية المعتمدة.'}
              </li>
              <li>
                {isEn
                  ? 'Deliver technical support, system alerts, and critical security notices.'
                  : 'تقديم الدعم الفني، والتنبيهات الذكية وإشعارات الأمان الضرورية.'}
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-2 text-[#111827]">
              <ServerStackIcon className="h-6 w-6 text-primary" />
              <h2 className="text-xl font-bold">
                {isEn
                  ? '4. Data Security & AES-256 Encryption'
                  : '4. أمان وتشفير البيانات'}
              </h2>
            </div>
            <p className="mt-3 text-gray-600">
              {isEn
                ? 'Security is embedded at the core of SMART PLATFORM architecture:'
                : 'الأمان هو الركيزة الأساسية في معمارية SMART PLATFORM:'}
            </p>
            <ul className="mt-3 list-disc space-y-2 ps-5 text-gray-600">
              <li>
                {isEn
                  ? 'All data at rest is encrypted using bank-grade AES-256 algorithms.'
                  : 'تشفير كافة البيانات المخزنة باستخدام خوارزميات التشفير المصرفي المتقدم (AES-256).'}
              </li>
              <li>
                {isEn
                  ? 'All communication between your browser and our servers is secured via TLS 1.3 / HTTPS.'
                  : 'تشفير كامل لكافة الاتصالات والبيانات أثناء النقل عبر بروتوكولات (TLS 1.3 / HTTPS).'}
              </li>
              <li>
                {isEn
                  ? 'Automated daily snapshots and encrypted backups ensure full disaster recovery and zero data loss.'
                  : 'نسخ احتياطي يومي مشفر متعدد المواقع لضمان استعادة البيانات واستمرارية الأعمال.'}
              </li>
            </ul>
          </section>

          {/* Section 5: Zero Selling */}
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-2 text-[#111827]">
              <UserGroupIcon className="h-6 w-6 text-primary" />
              <h2 className="text-xl font-bold">
                {isEn
                  ? '5. Zero Data Selling & Third-Party Privacy'
                  : '5. منع بيع أو مشاركة البيانات'}
              </h2>
            </div>
            <p className="mt-3 text-gray-600">
              {isEn
                ? 'We have a strict policy: SMART PLATFORM will never sell, lease, or monetize your organization data or personal contact records to any third party for marketing or advertising purposes.'
                : 'نلتزم بسياسة صارمة وواضحة: لا نقوم على الإطلاق ببيع أو تأجير أو مشاركة بيانات منشأتك أو معلومات الاتصال مع أي طرف ثالث لأغراض دعائية أو إعلانية.'}
            </p>
          </section>

          {/* Section 6 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold text-[#111827]">
              {isEn
                ? '6. Cookies & Session Storage'
                : '6. ملفات تعريف الارتباط (Cookies)'}
            </h2>
            <p className="mt-3 text-gray-600">
              {isEn
                ? 'We only utilize essential, secure cookies necessary to maintain authenticated sessions (NextAuth JWT) and remember your UI locale (Arabic / English) and theme preference.'
                : 'نستخدم فقط ملفات تعريف الارتباط الضرورية والآمنة للحفاظ على جلسات تسجيل الدخول المشفرة (NextAuth JWT) وحفظ تفضيل اللغة والسمة.'}
            </p>
          </section>

          {/* Section 7 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold text-[#111827]">
              {isEn
                ? '7. Contacting the Data Protection Team'
                : '7. التواصل مع مسؤول حماية البيانات'}
            </h2>
            <p className="mt-3 text-gray-600">
              {isEn
                ? 'For privacy inquiries, data export requests, or regulatory questions, please contact our support team through the official support channel or by email.'
                : 'لأي استفسار يتعلق بالخصوصية، أو لطلب تصدير البيانات أو حذف الحساب، يمكنك التواصل مباشرة مع فريق الدعم عبر القناة المعتمدة.'}
            </p>
          </section>
        </div>

        {/* Footer CTA */}
        <div className="mt-12 text-center">
          <Link
            href="/register"
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--ds-primary-600)] px-8 text-sm font-medium text-white transition hover:bg-[var(--ds-primary-700)]"
          >
            {isEn ? 'Get Started Safely' : 'ابدأ الآن بأمان'}
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

PrivacyPage.getLayout = function getLayout(page: ReactElement) {
  return <PublicLayout>{page}</PublicLayout>;
};

export default PrivacyPage;
