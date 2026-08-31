import Image from 'next/image';
import Link from 'next/link';

export default function HeroSection() {
  return (
    <section id="home" className="relative overflow-hidden">
      {/* subtle background glow */}
      <div className="pointer-events-none absolute -right-32 -top-20 h-96 w-96 rounded-full bg-[var(--ds-primary-100)]/60 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 top-40 h-80 w-80 rounded-full bg-[var(--ds-bronze-100)]/50 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-16 sm:px-6 lg:px-8 lg:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full bg-[var(--ds-primary-50)] px-4 py-1.5 text-xs font-medium text-[var(--ds-primary-600)]">
            نظام إدارة الأعمال المتكامل
          </span>
          <h1 className="mt-6 text-5xl font-semibold leading-tight text-[#111827] md:text-[58px]">
            ندير منشأتك بذكاء،
            <br />
            ببساطة وأمان
          </h1>
          <p className="mx-auto mt-6 max-w-[820px] text-base leading-[var(--ds-leading-body)] text-gray-500 md:text-[16px]">
            منصة ERP سعودية واحدة تجمع المحاسبة والمخزون والموارد البشرية
            والمبيعات — بتقنية بسيطة وذكية وآمنة لتسيير أعمالك بالكامل.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/register"
              className="flex h-[52px] items-center rounded-full bg-[var(--ds-primary-600)] px-8 text-base font-medium text-white transition hover:bg-[var(--ds-primary-700)]"
            >
              ابدأ مجانًا
            </Link>
            <a
              href="#features"
              className="flex h-[52px] items-center rounded-full border border-gray-300 bg-white px-8 text-base font-medium text-[#111827] transition hover:bg-gray-50"
            >
              استكشف المميزات
            </a>
          </div>
        </div>

        {/* Dashboard mockup in a browser frame */}
        <div className="relative mx-auto mt-14 max-w-5xl">
          <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-[var(--ds-shadow-xl)]">
            {/* browser top bar */}
            <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-yellow-400" />
              <span className="h-3 w-3 rounded-full bg-green-400" />
              <span className="ml-4 flex h-6 flex-1 items-center justify-center rounded-md bg-white text-xs text-gray-400">
                app.smarterp.sa/dashboard
              </span>
            </div>
            <Image
              src="/landing/hero-dashboard.png"
              alt="SMART PLATFORM dashboard"
              width={1440}
              height={900}
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="h-auto w-full"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
