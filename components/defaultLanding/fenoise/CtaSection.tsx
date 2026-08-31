import Link from 'next/link';

export default function CtaSection() {
  return (
    <section id="pricing" className="bg-[var(--ds-primary-600)] py-20">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-4xl font-bold text-white">جاهز تتقدم لمنشأتك؟</h2>
        <p className="mt-4 text-base text-[#f9fafb]/95">
          انضم إلى آلاف المستخدمين الذين طوّروا عملياتهم المالية مع SMART
          PLATFORM.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/register"
            className="flex h-[52px] items-center rounded-full bg-white px-8 text-base font-medium text-[var(--ds-primary-600)] transition hover:bg-gray-50"
          >
            ابدأ تجربتك مجانًا
          </Link>
          <Link
            href="/pricing"
            className="flex h-[52px] items-center rounded-full border-2 border-[var(--ds-bronze-500)] px-8 text-base font-medium text-white transition hover:bg-[var(--ds-bronze-500)]/10"
          >
            استعرض الأسعار
          </Link>
        </div>
      </div>
    </section>
  );
}
