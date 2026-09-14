import { useTranslation } from 'next-i18next';

export default function TrustSection() {
  const { t } = useTranslation('marketing');

  const trustItems = [
    {
      icon: '🔒',
      title: t('landing-trust-item1-title'),
      desc: t('landing-trust-item1-desc'),
    },
    {
      icon: '💬',
      title: t('landing-trust-item2-title'),
      desc: t('landing-trust-item2-desc'),
    },
    {
      icon: '🛡️',
      title: t('landing-trust-item3-title'),
      desc: t('landing-trust-item3-desc'),
    },
  ];

  return (
    <section
      id="about"
      className="border-y border-gray-100 bg-[var(--ds-surface-alt)] py-16"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-[var(--ds-text)]">
            {t('landing-trust-heading')}
          </h2>
          <p className="mt-3 text-base text-gray-500">
            {t('landing-trust-subtitle')}
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
          {trustItems.map((item) => (
            <div key={item.title} className="text-center">
              <div className="text-3xl">{item.icon}</div>
              <h3 className="mt-4 text-xl font-bold text-[var(--ds-text)]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
