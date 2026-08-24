import { useState } from 'react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';

const TESTIMONIALS = [
  {
    quote:
      'ساعدت SMART PLATFORM منشأتنا على توفير آلاف الريالات في الأشهر الأولى — وأخيرًا شعرنا بالسيطرة الكاملة على أموالنا وعملياتنا.',
    name: 'عبدالله المطيري',
    role: 'مدير عام شركة النخبة',
    avatar: 'ع',
  },
  {
    quote:
      'نظام قوي يوحّد المحاسبة والمخزون والمبيعات في مكان واحد، ووفّر علينا ساعات من العمل اليدوي كل أسبوع.',
    name: 'سارة العتيبي',
    role: 'مديرة العمليات — شركة أفق للتجارة',
    avatar: 'س',
  },
  {
    quote:
      'تجربة المنصة سلسة، وفريق الدعم يستجيب بسرعة. أنصح به أي منشأة تبحث عن إدارة ذكية وقرارات أدق.',
    name: 'خالد الشمري',
    role: 'رئيس الحسابات — مصنع الشرق',
    avatar: 'خ',
  },
];

export default function TestimonialsSection() {
  const [index, setIndex] = useState(0);
  const testimonial = TESTIMONIALS[index];

  const prev = () =>
    setIndex((i) => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
  const next = () => setIndex((i) => (i + 1) % TESTIMONIALS.length);

  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <span className="text-xs font-medium text-[var(--ds-primary-600)]">
            آراء العملاء
          </span>
          <h2 className="mt-4 text-4xl font-bold text-[#111827]">
            أناس حقيقيون. تقدم حقيقي.
          </h2>
          <div className="mt-10">
            <Quote className="mx-auto h-8 w-8 text-[var(--ds-primary-600)]" />
            <p className="mx-auto mt-6 max-w-3xl text-2xl font-bold leading-relaxed text-gray-600">
              &ldquo;{testimonial.quote}&rdquo;
            </p>
            <div className="mt-8 flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ds-primary-600)] text-xl font-bold text-white">
                {testimonial.avatar}
              </div>
              <div className="mr-4 text-right">
                <p className="text-lg font-bold text-[#111827]">
                  {testimonial.name}
                </p>
                <p className="text-sm text-gray-500">{testimonial.role}</p>
              </div>
            </div>
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                aria-label="السابق"
                onClick={prev}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-[var(--ds-primary-600)] transition hover:bg-gray-50"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <button
                aria-label="التالي"
                onClick={next}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-[var(--ds-primary-600)] transition hover:bg-gray-50"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
