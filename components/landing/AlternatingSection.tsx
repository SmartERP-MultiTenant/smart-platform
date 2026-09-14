import Image from 'next/image';
import { useTranslation } from 'next-i18next';
import {
  Calculator,
  Workflow,
  BellRing,
  Sparkles,
  Link2,
  ShieldCheck,
} from 'lucide-react';

interface RowItem {
  icon: typeof Calculator;
  eyebrow: string;
  title: string;
  desc: string;
  img?: string;
}

// A small visual shown opposite each feature row (real screenshot or stylized panel)
function VisualCard({ row, index }: { row: RowItem; index: number }) {
  if (row.img) {
    return (
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[var(--ds-shadow-md)]">
        {/* `aspect-[16/10]` + `fill` reserve the box before the bytes arrive, so
            these below-the-fold screenshots cannot shift the layout (CLS 0).
            `loading="lazy"` is already `next/image`'s default — it is written
            out here because this is the ticket's explicit requirement and the
            prop alone survives a future refactor to `unoptimized`/`<img>`. */}
        <div className="relative aspect-[16/10]">
          <Image
            src={row.img}
            alt={row.title}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            loading="lazy"
            className="object-cover"
          />
        </div>
      </div>
    );
  }
  const accent =
    index % 2 === 0 ? 'var(--ds-primary-600)' : 'var(--ds-bronze-500)';
  return (
    <div className="rounded-2xl border border-gray-100 bg-[var(--ds-surface-alt)] p-8">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-white"
        style={{ backgroundColor: accent }}
      >
        {index % 2 === 0 ? <Calculator className="h-7 w-7" /> : <ChartBars />}
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
  const { t } = useTranslation('marketing');

  const rows: RowItem[] = [
    {
      icon: Calculator,
      eyebrow: t('landing-alt-r1-eyebrow'),
      title: t('landing-alt-r1-title'),
      desc: t('landing-alt-r1-desc'),
      img: '/landing/dashboard.webp',
    },
    {
      icon: Workflow,
      eyebrow: t('landing-alt-r2-eyebrow'),
      title: t('landing-alt-r2-title'),
      desc: t('landing-alt-r2-desc'),
      img: '/landing/pos.webp',
    },
    {
      icon: BellRing,
      eyebrow: t('landing-alt-r3-eyebrow'),
      title: t('landing-alt-r3-title'),
      desc: t('landing-alt-r3-desc'),
    },
    {
      icon: Sparkles,
      eyebrow: t('landing-alt-r4-eyebrow'),
      title: t('landing-alt-r4-title'),
      desc: t('landing-alt-r4-desc'),
      img: '/landing/reports.webp',
    },
    {
      icon: Link2,
      eyebrow: t('landing-alt-r5-eyebrow'),
      title: t('landing-alt-r5-title'),
      desc: t('landing-alt-r5-desc'),
      img: '/landing/inventory.webp',
    },
    {
      icon: ShieldCheck,
      eyebrow: t('landing-alt-r6-eyebrow'),
      title: t('landing-alt-r6-title'),
      desc: t('landing-alt-r6-desc'),
    },
  ];

  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-7xl space-y-24 px-4 sm:px-6 lg:px-8">
        {rows.map((row, index) => {
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
                <h3 className="mt-4 text-[34px] font-extrabold leading-tight text-[var(--ds-text)]">
                  {row.title}
                </h3>
                <p className="mt-4 text-[15px] leading-[var(--ds-leading-body)] text-gray-500">
                  {row.desc}
                </p>
              </div>
              <div className={reversed ? 'lg:order-1' : ''}>
                <VisualCard row={row} index={index} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
