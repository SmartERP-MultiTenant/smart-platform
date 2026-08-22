import {
  BookOpenCheck,
  Boxes,
  Bell,
  ChartColumnIncreasing,
  FileBarChart,
} from 'lucide-react';

const FEATURES = [
  {
    icon: BookOpenCheck,
    title: 'محاسبة متكاملة',
    desc: 'فواتير، قيود، ودفاتر يومية لتقارير مالية دقيقة.',
  },
  {
    icon: Boxes,
    title: 'إدارة المخزون',
    desc: 'مستودعات وتسعير متعدد مع تتبّع مباشر.',
  },
  {
    icon: Bell,
    title: 'تنبيهات ذكية',
    desc: 'إشعارات فورية حول المعاملات والتجديدات.',
  },
  {
    icon: ChartColumnIncreasing,
    title: 'تقارير وتحليلات',
    desc: 'لوحات تحكم لحظية لاتخاذ قرارات أذكى.',
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.1fr]">
          {/* Left: stat / report cards */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[var(--ds-shadow-sm)]">
              <p className="text-xs font-bold text-[#111827]">نظرة عامة</p>
              <p className="mt-2 text-2xl font-bold text-[var(--ds-primary-600)]">
                248,339 ر.س
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-[9px] text-gray-500">
                <span>محاسبة</span>
                <span>مخزون</span>
                <span>مبيعات</span>
              </div>
            </div>
            <div className="rounded-2xl bg-[var(--ds-primary-600)] p-6 text-white shadow-[var(--ds-shadow-md)]">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-xl font-bold">
                  S
                </span>
                <p className="text-sm font-bold">رؤى ذكية</p>
              </div>
              <p className="mt-4 text-[10px] text-[var(--ds-primary-100)]">
                يمكنك توفير 3,000 ر.س شهريًا بتحسين المشتريات.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[var(--ds-shadow-sm)]">
              <div className="flex items-center gap-2">
                <FileBarChart className="h-5 w-5 text-[var(--ds-primary-600)]" />
                <p className="text-sm font-bold text-[#111827]">
                  التقارير المالية
                </p>
              </div>
              <p className="mt-4 text-[10px] text-gray-500">صافي الأرباح</p>
              <p className="text-lg font-bold text-[#111827]">62,180 ر.س</p>
            </div>
          </div>

          {/* Right: heading + feature grid */}
          <div>
            <span className="text-sm font-bold text-[var(--ds-primary-600)]">
              الميزات الأساسية
            </span>
            <h2 className="mt-3 text-4xl font-extrabold text-[#111827]">
              كل ما تحتاجه لأعمالك
            </h2>
            <p className="mt-2 text-sm font-bold text-[var(--ds-bronze-500)]">
              كل ما تحتاجه. لا شيء أكثر.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-gray-200 p-6 transition hover:shadow-[var(--ds-shadow-md)]"
                >
                  <f.icon className="h-7 w-7 text-[var(--ds-primary-600)]" />
                  <h3 className="mt-4 text-lg font-bold text-[#111827]">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-[13px] text-gray-500">{f.desc}</p>
                </div>
              ))}
            </div>
            <a
              href="#features"
              className="mt-8 inline-flex h-12 items-center rounded-full bg-[var(--ds-primary-600)] px-8 text-[15px] font-bold text-white transition hover:bg-[var(--ds-primary-700)]"
            >
              عرض كل الميزات
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
