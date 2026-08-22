import {
  Calculator,
  Workflow,
  BellRing,
  Sparkles,
  Link2,
  ShieldCheck,
} from 'lucide-react';

const ROWS = [
  {
    icon: Calculator,
    eyebrow: 'تحكّم كامل في أموالك',
    title: 'المحاسبة الذكية',
    desc: 'إدارة دفاتر يومية وقيود محاسبية وميزانيات، مع تقارير مالية دقيقة تمنحك صورة واضحة عن أداء منشأتك.',
    img: '/landing/dashboard.png',
  },
  {
    icon: Workflow,
    eyebrow: 'نمو ثروتك بسهولة',
    title: 'الأتمتة الذكية',
    desc: 'أتمتة العمليات المتكررة بحكمة، من خلال تدفقات ذكية توفّر وقتك وتقلّل الجهد اليدوي.',
    img: '/landing/pos.png',
  },
  {
    icon: BellRing,
    eyebrow: 'ابقَ مطّلِعًا فورًا',
    title: 'تنبيهات لحظية',
    desc: 'احصل على إشعارات فورية حول المعاملات والتجديدات ونشاط الحساب، لتكون دائمًا في المقدمة.',
  },
  {
    icon: Sparkles,
    eyebrow: 'قرارات أذكى تبدأ هنا',
    title: 'رؤى مدعومة بالذكاء',
    desc: 'يحلّل ذكاء SMART ERP عاداتك ويقترح طرقًا أذكى للتوفير والاستثمار وإدارة الأعمال.',
    img: '/landing/reports.png',
  },
  {
    icon: Link2,
    eyebrow: 'كل شيء في مكان واحد',
    title: 'مزامنة موحّدة',
    desc: 'اربط الفروع والمخزون والحسابات في منظومة واحدة متكاملة — بدون تنقّل بين الأنظمة.',
    img: '/landing/inventory.png',
  },
  {
    icon: ShieldCheck,
    eyebrow: 'مصمم لأقصى حماية',
    title: 'الأمان والخصوصية',
    desc: 'تشفير AES-256 ونسخ احتياطي يومي وسياسات خصوصية صارمة تحمي بياناتك بكل خطوة.',
  },
];

// A small visual shown opposite each feature row (real screenshot or stylized panel)
function VisualCard({ row }: { row: (typeof ROWS)[number] }) {
  if (row.img) {
    return (
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[var(--ds-shadow-md)]">
        <img
          src={row.img}
          alt={row.title}
          className="h-auto w-full object-cover"
        />
      </div>
    );
  }
  const accent =
    ROWS.indexOf(row) % 2 === 0
      ? 'var(--ds-primary-600)'
      : 'var(--ds-bronze-500)';
  return (
    <div className="rounded-2xl border border-gray-100 bg-[var(--ds-surface-alt)] p-8">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-white"
        style={{ backgroundColor: accent }}
      >
        {ROWS.indexOf(row) % 2 === 0 ? (
          <Calculator className="h-7 w-7" />
        ) : (
          <ChartBars />
        )}
      </div>
      <div className="mt-6 h-4 w-3/4 rounded bg-gray-200" />
      <div className="mt-3 h-4 w-1/2 rounded bg-gray-100" />
      <div className="mt-8 space-y-2">
        <div className="h-2 w-full rounded bg-gray-200" />
        <div className="h-2 w-5/6 rounded bg-gray-200" />
        <div className="h-2 w-4/6 rounded bg-gray-200" />
      </div>
    </div>
  );
}

function ChartBars() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="12" width="4" height="8" rx="1" />
      <rect x="10" y="6" width="4" height="14" rx="1" />
      <rect x="16" y="9" width="4" height="11" rx="1" />
    </svg>
  );
}

export default function AlternatingSection() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-7xl space-y-24 px-4 sm:px-6 lg:px-8">
        {ROWS.map((row, index) => {
          const reversed = index % 2 === 1;
          return (
            <div
              key={row.title}
              className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2"
            >
              <div className={reversed ? 'lg:order-2' : ''}>
                <span className="text-sm font-bold text-[var(--ds-primary-600)]">
                  {row.eyebrow}
                </span>
                <h3 className="mt-4 text-[34px] font-extrabold leading-tight text-[#111827]">
                  {row.title}
                </h3>
                <p className="mt-4 text-[15px] leading-[var(--ds-leading-body)] text-gray-500">
                  {row.desc}
                </p>
              </div>
              <div className={reversed ? 'lg:order-1' : ''}>
                <VisualCard row={row} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
