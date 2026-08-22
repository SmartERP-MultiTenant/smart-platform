const TRUST_ITEMS = [
  {
    icon: '🔒',
    title: 'بياناتك مشفرة',
    desc: 'بياناتك مشفرة بالكامل ومحمية ولا تُباع أبدًا.',
  },
  {
    icon: '💬',
    title: 'دعم على مدار الساعة',
    desc: 'معك في أي وقت. اسأل أي شيء — بجدية.',
  },
  {
    icon: '🛡️',
    title: 'أمان متكامل',
    desc: 'نسخ احتياطي يومية وتشفير AES-256 لبياناتك.',
  },
];

export default function TrustSection() {
  return (
    <section
      id="about"
      className="border-y border-gray-100 bg-[var(--ds-surface-alt)] py-16"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-[#111827]">
            نغيّر طريقة إدارة المنشآت لأعمالهم
          </h2>
          <p className="mt-3 text-base text-gray-500">
            بتقنية بسيطة وذكية وآمنة — نجرّب أفضل الممارسات العالمية وتصميم
            متماسك لمؤسستك السعودية.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
          {TRUST_ITEMS.map((item) => (
            <div key={item.title} className="text-center">
              <div className="text-3xl">{item.icon}</div>
              <h3 className="mt-4 text-xl font-bold text-[#111827]">
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
