import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';

export default function TestimonialsSection() {
  const { t } = useTranslation('marketing');

  const testimonials = [
    {
      quote: t('landing-test-t1-quote'),
      name: t('landing-test-t1-name'),
      role: t('landing-test-t1-role'),
    },
    {
      quote: t('landing-test-t2-quote'),
      name: t('landing-test-t2-name'),
      role: t('landing-test-t2-role'),
    },
    {
      quote: t('landing-test-t3-quote'),
      name: t('landing-test-t3-name'),
      role: t('landing-test-t3-role'),
    },
  ];

  const [index, setIndex] = useState(0);
  const testimonial = testimonials[index];

  const prev = () =>
    setIndex((i) => (i - 1 + testimonials.length) % testimonials.length);
  const next = () => setIndex((i) => (i + 1) % testimonials.length);

  return (
    <section id="testimonials" className="bg-white py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <span className="text-xs font-medium text-[var(--ds-primary-600)]">
            {t('landing-test-badge')}
          </span>
          <h2 className="mt-4 text-4xl font-bold text-[var(--ds-text)]">
            {t('landing-test-title')}
          </h2>
          <div className="mt-10">
            <Quote className="mx-auto h-8 w-8 text-[var(--ds-primary-600)]" />
            <p className="mx-auto mt-6 max-w-3xl text-2xl font-bold leading-relaxed text-gray-600">
              &ldquo;{testimonial.quote}&rdquo;
            </p>
            <div className="mt-8 flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ds-primary-600)] text-xl font-bold text-white">
                {testimonial.name?.trim().charAt(0).toUpperCase()}
              </div>
              <div className="mx-4 text-start">
                <p className="text-lg font-bold text-[var(--ds-text)]">
                  {testimonial.name}
                </p>
                <p className="text-sm text-gray-500">{testimonial.role}</p>
              </div>
            </div>
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                aria-label={t('landing-test-prev')}
                onClick={prev}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-[var(--ds-primary-600)] transition hover:bg-gray-50"
              >
                <ChevronRight className="h-5 w-5 rtl:rotate-0 ltr:rotate-180" />
              </button>
              <button
                aria-label={t('landing-test-next')}
                onClick={next}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-[var(--ds-primary-600)] transition hover:bg-gray-50"
              >
                <ChevronLeft className="h-5 w-5 rtl:rotate-0 ltr:rotate-180" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
