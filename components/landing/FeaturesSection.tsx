import { useTranslation } from 'next-i18next';
import {
  BookOpenCheck,
  Boxes,
  Bell,
  ChartColumnIncreasing,
  FileBarChart,
} from 'lucide-react';

export default function FeaturesSection() {
  const { t } = useTranslation('marketing');

  const features = [
    {
      icon: BookOpenCheck,
      title: t('landing-feat-f1-title'),
      desc: t('landing-feat-f1-desc'),
    },
    {
      icon: Boxes,
      title: t('landing-feat-f2-title'),
      desc: t('landing-feat-f2-desc'),
    },
    {
      icon: Bell,
      title: t('landing-feat-f3-title'),
      desc: t('landing-feat-f3-desc'),
    },
    {
      icon: ChartColumnIncreasing,
      title: t('landing-feat-f4-title'),
      desc: t('landing-feat-f4-desc'),
    },
  ];

  return (
    <section id="features" className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.1fr]">
          {/* Left: stat / report cards */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[var(--ds-shadow-sm)]">
              <p className="text-xs font-bold text-[#111827]">
                {t('landing-feat-overview')}
              </p>
              <p className="mt-2 text-2xl font-bold text-[var(--ds-primary-600)]">
                248,339 {t('landing-feat-currency')}
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-[9px] text-gray-500">
                <span>{t('landing-feat-tag-accounting')}</span>
                <span>{t('landing-feat-tag-inventory')}</span>
                <span>{t('landing-feat-tag-sales')}</span>
              </div>
            </div>
            <div className="rounded-2xl bg-[var(--ds-primary-600)] p-6 text-white shadow-[var(--ds-shadow-md)]">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-xl font-bold">
                  S
                </span>
                <p className="text-sm font-bold">
                  {t('landing-feat-smart-insights')}
                </p>
              </div>
              <p className="mt-4 text-[10px] text-[var(--ds-primary-100)]">
                {t('landing-feat-insights-tip')}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[var(--ds-shadow-sm)]">
              <div className="flex items-center gap-2">
                <FileBarChart className="h-5 w-5 text-[var(--ds-primary-600)]" />
                <p className="text-sm font-bold text-[#111827]">
                  {t('landing-feat-financial-reports')}
                </p>
              </div>
              <p className="mt-4 text-[10px] text-gray-500">
                {t('landing-feat-net-profit')}
              </p>
              <p className="text-lg font-bold text-[#111827]">
                62,180 {t('landing-feat-currency')}
              </p>
            </div>
          </div>

          {/* Right: heading + feature grid */}
          <div>
            <span className="text-sm font-bold text-[var(--ds-primary-600)]">
              {t('landing-feat-eyebrow')}
            </span>
            <h2 className="mt-3 text-4xl font-extrabold text-[#111827]">
              {t('landing-feat-heading')}
            </h2>
            <p className="mt-2 text-sm font-bold text-[var(--ds-bronze-500)]">
              {t('landing-feat-tagline')}
            </p>
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {features.map((f) => (
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
              {t('landing-feat-cta-all')}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
