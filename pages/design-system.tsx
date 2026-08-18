import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { Cairo, Montserrat, Tajawal, Almarai } from 'next/font/google';
import type { NextPageWithLayout } from 'types';
import type { LucideIcon } from 'lucide-react';
import {
  TriangleAlert,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  BadgeCheck,
  Bell,
  Check,
  CircleCheckBig,
  CreditCard,
  RectangleEllipsis,
  Info,
  Layers,
  Lock,
  Mail,
  Megaphone,
  MousePointerClick,
  Palette,
  Shield,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Tag,
  TrendingUp,
  Type,
  Users,
  CircleX,
  Zap,
  Building2,
  Landmark,
  Store,
  Rocket,
  Headset,
} from 'lucide-react';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
});

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
});

const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '700'],
  variable: '--font-tajawal',
});

const almarai = Almarai({
  subsets: ['arabic'],
  weight: ['300', '400', '700', '800'],
  variable: '--font-almarai',
});

/* ------------------------------------------------------------------ */
/* Data                                                               */
/* ------------------------------------------------------------------ */

const PRIMARY_SCALE = [
  { token: '--ds-primary-50', hex: '#EEF4FF' },
  { token: '--ds-primary-100', hex: '#DBE7FF' },
  { token: '--ds-primary-200', hex: '#BCD2FF' },
  { token: '--ds-primary-300', hex: '#8FB4FF' },
  { token: '--ds-primary-400', hex: '#5D8BFF' },
  { token: '--ds-primary-500', hex: '#3A63F5' },
  { token: '--ds-primary-600', hex: '#2548D9' },
  { token: '--ds-primary-700', hex: '#1D3AB0' },
  { token: '--ds-primary-800', hex: '#1B3189' },
  { token: '--ds-primary-900', hex: '#182A68' },
  { token: '--ds-primary-950', hex: '#101B3F' },
];

const BRONZE_SCALE = [
  { token: '--ds-bronze-50', hex: '#FBF5EF' },
  { token: '--ds-bronze-100', hex: '#F5E6D5' },
  { token: '--ds-bronze-200', hex: '#EACBAB' },
  { token: '--ds-bronze-300', hex: '#DCAB7D' },
  { token: '--ds-bronze-400', hex: '#CC8A54' },
  { token: '--ds-bronze-500', hex: '#B8733A' },
  { token: '--ds-bronze-600', hex: '#9A5C2E' },
  { token: '--ds-bronze-700', hex: '#7C4827' },
  { token: '--ds-bronze-800', hex: '#643B24' },
  { token: '--ds-bronze-900', hex: '#53311F' },
];

const INK_TOKENS = [
  { token: '--ds-ink-950', hex: '#070D1D', hint: 'أعمق سطح داكن — الفوتر' },
  { token: '--ds-ink-900', hex: '#0B1428', hint: 'الهيرو الداكن' },
  { token: '--ds-ink-800', hex: '#101C36', hint: 'البطاقات على الداكن' },
  { token: '--ds-ink-700', hex: '#16274A', hint: 'hover على الداكن' },
];

const SEMANTIC = [
  {
    token: '--ds-success-500',
    hex: '#10B981',
    name: 'نجاح',
    wrap: 'bg-[var(--ds-success-50)] text-[var(--ds-success-700)]',
  },
  {
    token: '--ds-warning-500',
    hex: '#F59E0B',
    name: 'تنبيه',
    wrap: 'bg-[var(--ds-warning-50)] text-[var(--ds-warning-700)]',
  },
  {
    token: '--ds-danger-500',
    hex: '#EF4444',
    name: 'خطأ',
    wrap: 'bg-[var(--ds-danger-50)] text-[var(--ds-danger-700)]',
  },
  {
    token: '--ds-info-500',
    hex: '#3A63F5',
    name: 'معلومة',
    wrap: 'bg-[var(--ds-info-50)] text-[var(--ds-primary-700)]',
  },
];

const TYPE_SCALE = [
  {
    token: '--ds-h1',
    size: 64,
    name: 'H1 — العنوان الرئيسي',
    sample: 'نظام تخطيط موارد المؤسسات الذكي',
  },
  {
    token: '--ds-h2',
    size: 40,
    name: 'H2 — عنوان قسم',
    sample: 'حلول متكاملة لإدارة أعمالك',
  },
  {
    token: '--ds-h3',
    size: 28,
    name: 'H3 — عنوان فرعي',
    sample: 'ميزات SMART ERP الأساسية',
  },
  {
    token: '--ds-h4',
    size: 20,
    name: 'H4 — عنوان بطاقة',
    sample: 'محاسبة ومخزون ومشتريات',
  },
  {
    token: '--ds-body',
    size: 17,
    name: 'Body — النص الأساسي',
    sample:
      'نظام متكامل لإدارة المحاسبة والمخزون والمشتريات والموارد البشرية في مكان واحد.',
  },
  {
    token: '--ds-caption',
    size: 13,
    name: 'Caption — نص مساعد',
    sample: 'وصف مختصر أو تلميح إضافي بجانب العناصر.',
  },
];

const SPACING = [
  { token: '--ds-space-1', px: 4 },
  { token: '--ds-space-2', px: 8 },
  { token: '--ds-space-3', px: 12 },
  { token: '--ds-space-4', px: 16 },
  { token: '--ds-space-5', px: 24 },
  { token: '--ds-space-6', px: 32 },
  { token: '--ds-space-7', px: 48 },
  { token: '--ds-space-8', px: 64 },
];

const RADII = [
  { token: '--ds-radius-sm', px: 8, label: 'صغير — العناصر التفاعلية' },
  { token: '--ds-radius-md', px: 12, label: 'متوسط — الحقول والمدخلات' },
  { token: '--ds-radius-lg', px: 16, label: 'كبير — البطاقات' },
  { token: '--ds-radius-xl', px: 20, label: 'أكبر — البطاقات المميزة' },
  { token: '--ds-radius-pill', px: 9999, label: 'Pill — أزرار الدعوة CTA' },
];

const ALERTS = [
  {
    title: 'تمت العملية بنجاح',
    desc: 'تم حفظ التغييرات وعرضها على الموقع.',
    icon: CircleCheckBig,
    wrap: 'border-[var(--ds-success-500)]/20 bg-[var(--ds-success-50)] text-[var(--ds-success-700)]',
    iconCls: 'text-[var(--ds-success-500)]',
  },
  {
    title: 'معلومة',
    desc: 'تم تحديث النظام إلى الإصدار الأحدث.',
    icon: Info,
    wrap: 'border-[var(--ds-primary-300)]/40 bg-[var(--ds-primary-50)] text-[var(--ds-primary-800)]',
    iconCls: 'text-[var(--ds-primary-600)]',
  },
  {
    title: 'تنبيه',
    desc: 'اقتربت مساحة التخزين من الحد الأقصى.',
    icon: TriangleAlert,
    wrap: 'border-[var(--ds-warning-500)]/30 bg-[var(--ds-warning-50)] text-[var(--ds-warning-700)]',
    iconCls: 'text-[var(--ds-warning-500)]',
  },
  {
    title: 'خطأ',
    desc: 'تعذر الاتصال بالخادم، حاول مرة أخرى.',
    icon: CircleX,
    wrap: 'border-[var(--ds-danger-500)]/20 bg-[var(--ds-danger-50)] text-[var(--ds-danger-700)]',
    iconCls: 'text-[var(--ds-danger-500)]',
  },
];

const STATS = [
  { value: '+40,000', label: 'شركة تستخدم النظام', icon: Building2 },
  { value: '98%', label: 'رضا العملاء', icon: Star },
  { value: '24/7', label: 'دعم فني سعودي', icon: Headset },
  { value: '+15', label: 'دولة تعمل بها', icon: Landmark },
];

const CLIENT_LOGOS = [
  { name: 'شركة الأفق', icon: Landmark },
  { name: 'مؤسسة النخبة', icon: Store },
  { name: 'مجموعة الرواد', icon: Building2 },
  { name: 'شركة الابتكار', icon: Rocket },
  { name: 'بنك المستقبل', icon: Landmark },
  { name: 'مصنع الجزيرة', icon: Building2 },
];

const TRUST_CHIPS = [
  'متوافق مع الفوترة الإلكترونية',
  'تجربة مجانية — بدون بطاقة ائتمان',
  'جاهز للعمل فوراً',
  'بياناتك مشفرة وآمنة',
];

const DOS = [
  'استخدم التدرج اللوني في الهيرو وCTA فقط',
  'البرونز حصري للأسعار والميزات المميزة',
  'زوايا 16px للبطاقات و 8px للعناصر التفاعلية',
  'نص أبيض على الخلفيات الزرقاء الداكنة',
  'السطوح الداكنة (Ink) للهيرو والإحصائيات والفوتر',
  'استخدم ظلالاً متعددة الطبقات ناعمة — لا ظلالاً ثقيلة',
];

const DONTS = [
  'لا تستخدم التدرج في الأزرار أو العناصر الصغيرة',
  'لا تستخدم البرونز للنصوص أو الأزرار العادية',
  'لا تخلط أحجام الزوايا داخل نفس المكوّن',
  'لا تستخدم نصاً داكناً على الأزرق الداكن',
  'لا تستخدم Pill إلا لأزرار الدعوة الرئيسية',
  'تجنّب الأيقونات المعمّمة والصور المخزنية (stock)',
];

/* ------------------------------------------------------------------ */
/* Small building blocks                                              */
/* ------------------------------------------------------------------ */

const inputCls =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-gray-200)] bg-white px-4 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-all placeholder:text-[var(--ds-text-muted)] focus:border-[var(--ds-primary-500)] focus:ring-4 focus:ring-[var(--ds-primary-100)]';

const FieldLabel = ({ ar, en }: { ar: string; en: string }) => (
  <label className="mb-1.5 block text-sm font-bold text-[var(--ds-text)]">
    {ar}{' '}
    <span className="font-en text-xs font-medium text-[var(--ds-text-muted)]">
      ({en})
    </span>
  </label>
);

const Section = ({
  id,
  icon: Icon,
  title,
  en,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  en: string;
  children: ReactNode;
}) => (
  <section id={id} className="scroll-mt-10">
    <div className="mb-8 flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[var(--ds-primary-50)] text-[var(--ds-primary-600)]">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h2 className="text-2xl font-extrabold text-[var(--ds-text)]">
          {title}
        </h2>
        <p className="font-en text-xs font-semibold uppercase tracking-widest text-[var(--ds-text-muted)]">
          {en}
        </p>
      </div>
    </div>
    {children}
  </section>
);

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

const DesignSystem: NextPageWithLayout = () => {
  const [toggleOn, setToggleOn] = useState(true);

  return (
    <>
      <Head>
        <title>Design System</title>
      </Head>
      <div
        dir="rtl"
        style={{ fontFamily: 'var(--font-cairo)' }}
        className={`min-h-screen bg-[var(--ds-surface-alt)] text-[var(--ds-text)] ${cairo.variable} ${montserrat.variable} ${tajawal.variable} ${almarai.variable}`}
      >
        {/* ==================== Header / Hero (dark — Zid/Moyasar style) ==================== */}
        <header className="ds-gradient-dark relative overflow-hidden text-white">
          <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[var(--ds-primary-500)]/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-[var(--ds-bronze-500)]/20 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:28px_28px]" />
          <div className="relative mx-auto max-w-6xl px-6 py-16">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur transition hover:bg-white/20"
            >
              <ArrowRight className="h-4 w-4" />
              العودة للرئيسية
            </Link>
            <h1 className="mt-8 text-4xl font-extrabold leading-tight md:text-5xl">
              نظام التصميم —{' '}
              <span className="font-en tracking-wide">SMART ERP</span>
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-[var(--ds-leading-body)] text-white/80">
              مرجع موحّد للألوان والخطوط والمسافات والمكوّنات الأساسية لهوية
              SMART ERP — مبني على أفضل ممارسات منصات المنطقة الرائدة، ومصمم
              ليكون عصرياً وواضحاً وسريعاً.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {[
                'الألوان',
                'الخطوط',
                'الأزرار',
                'المدخلات',
                'البطاقات',
                'السطوح الداكنة',
              ].map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold backdrop-blur"
                >
                  {chip}
                </span>
              ))}
            </div>
            {/* Trust chips — Daftra style */}
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 pt-6">
              {TRUST_CHIPS.map((chip) => (
                <span
                  key={chip}
                  className="flex items-center gap-2 text-sm text-white/85"
                >
                  <Check className="h-4 w-4 text-[var(--ds-success-500)]" />
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-20 px-6 py-20">
          {/* ==================== 1. Colors ==================== */}
          <Section id="colors" icon={Palette} title="الألوان" en="Color Tokens">
            {/* Primary scale */}
            <h3 className="mb-4 flex items-center gap-2 text-lg font-extrabold text-[var(--ds-text)]">
              <span className="font-en text-xs font-bold uppercase tracking-widest text-[var(--ds-text-muted)]">
                Primary
              </span>
              <span className="text-sm font-medium text-[var(--ds-text-muted)]">
                — الأزرق الملكي (من Wafeq & Zid)
              </span>
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PRIMARY_SCALE.map((c) => (
                <div
                  key={c.token}
                  className="overflow-hidden rounded-2xl bg-white ring-1 ring-[var(--ds-gray-100)]"
                  style={{ boxShadow: 'var(--ds-shadow-sm)' }}
                >
                  <div
                    className="h-14"
                    style={{ background: `var(${c.token})` }}
                  />
                  <div className="space-y-1 p-4">
                    <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                      {c.token}
                    </p>
                    <p className="font-en text-sm font-extrabold text-[var(--ds-text)]">
                      {c.hex}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Bronze scale */}
            <h3 className="mb-4 mt-10 flex items-center gap-2 text-lg font-extrabold text-[var(--ds-text)]">
              <span className="font-en text-xs font-bold uppercase tracking-widest text-[var(--ds-text-muted)]">
                Accent
              </span>
              <span className="text-sm font-medium text-[var(--ds-text-muted)]">
                — البرونز (هوية SMART ERP المميزة)
              </span>
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {BRONZE_SCALE.map((c) => (
                <div
                  key={c.token}
                  className="overflow-hidden rounded-2xl bg-white ring-1 ring-[var(--ds-gray-100)]"
                  style={{ boxShadow: 'var(--ds-shadow-sm)' }}
                >
                  <div
                    className="h-14"
                    style={{ background: `var(${c.token})` }}
                  />
                  <div className="space-y-1 p-4">
                    <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                      {c.token}
                    </p>
                    <p className="font-en text-sm font-extrabold text-[var(--ds-text)]">
                      {c.hex}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Semantic + Ink */}
            <div className="mt-10 grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-4 text-lg font-extrabold text-[var(--ds-text)]">
                  الألوان الدلالية{' '}
                  <span className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                    Semantic
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {SEMANTIC.map((s) => (
                    <div
                      key={s.token}
                      className="flex items-center gap-3 rounded-2xl border border-[var(--ds-gray-100)] bg-white p-4"
                      style={{ boxShadow: 'var(--ds-shadow-sm)' }}
                    >
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-extrabold ${s.wrap}`}
                      >
                        {s.name[0]}
                      </span>
                      <div>
                        <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                          {s.token}
                        </p>
                        <p className="font-en text-sm font-extrabold text-[var(--ds-text)]">
                          {s.hex} · {s.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-4 text-lg font-extrabold text-[var(--ds-text)]">
                  السطوح الداكنة{' '}
                  <span className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                    Ink
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {INK_TOKENS.map((c) => (
                    <div
                      key={c.token}
                      className="overflow-hidden rounded-2xl"
                      style={{
                        background: `var(${c.token})`,
                        boxShadow: 'var(--ds-shadow-sm)',
                      }}
                    >
                      <div className="space-y-1 p-4">
                        <p className="font-en text-[10px] font-bold text-white/60">
                          {c.token}
                        </p>
                        <p className="font-en text-sm font-extrabold text-white">
                          {c.hex}
                        </p>
                        <p className="text-xs text-white/65">{c.hint}</p>
                      </div>
                      <div className="mx-4 mb-4 h-1 rounded-full bg-white/15">
                        <div
                          className="h-full rounded-full bg-white/40"
                          style={{
                            width:
                              c.token === '--ds-ink-950'
                                ? '25%'
                                : c.token === '--ds-ink-900'
                                  ? '50%'
                                  : c.token === '--ds-ink-800'
                                    ? '75%'
                                    : '100%',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Gradients */}
            <h3 className="mb-4 mt-10 text-lg font-extrabold text-[var(--ds-text)]">
              التدرجات{' '}
              <span className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                Gradients
              </span>
            </h3>
            <div className="grid gap-5 sm:grid-cols-3">
              <div className="overflow-hidden rounded-2xl ring-1 ring-[var(--ds-gray-100)]">
                <div className="ds-gradient h-24" />
                <div className="space-y-1 bg-white p-4">
                  <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                    --ds-gradient
                  </p>
                  <p className="text-sm font-extrabold text-[var(--ds-text)]">
                    الهوية — الهيرو وCTA
                  </p>
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl ring-1 ring-[var(--ds-gray-100)]">
                <div className="ds-gradient-dark h-24" />
                <div className="space-y-1 bg-white p-4">
                  <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                    --ds-gradient-dark
                  </p>
                  <p className="text-sm font-extrabold text-[var(--ds-text)]">
                    السطوح الداكنة — Ink hero
                  </p>
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl ring-1 ring-[var(--ds-gray-100)]">
                <div className="ds-gradient-bronze h-24" />
                <div className="space-y-1 bg-white p-4">
                  <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                    --ds-gradient-bronze
                  </p>
                  <p className="text-sm font-extrabold text-[var(--ds-text)]">
                    البرونز — الأسعار والمميز
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* ==================== 2. Typography ==================== */}
          <Section id="typography" icon={Type} title="الخطوط" en="Typography">
            {/* Display sample on dark — Zid style */}
            <div
              className="ds-gradient-dark relative mb-8 overflow-hidden rounded-[var(--ds-radius-xl)] p-12 text-center"
              style={{ boxShadow: 'var(--ds-shadow-lg)' }}
            >
              <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[var(--ds-primary-500)]/30 blur-3xl" />
              <p className="font-en relative text-5xl font-extrabold tracking-wide text-white md:text-6xl">
                SMART ERP
              </p>
              <p className="font-en relative mt-3 text-xs font-semibold uppercase tracking-[0.4em] text-[var(--ds-primary-300)]">
                Montserrat — Display
              </p>
              <p className="relative mt-6 text-2xl font-extrabold text-white md:text-3xl">
                نظام متكامل لإدارة أعمالك
              </p>
            </div>

            {/* Type scale */}
            <div className="space-y-4">
              {TYPE_SCALE.map((t) => (
                <div
                  key={t.token}
                  className="flex flex-col gap-2 rounded-2xl bg-white p-6 ring-1 ring-[var(--ds-gray-100)] md:flex-row md:items-baseline md:gap-8"
                  style={{ boxShadow: 'var(--ds-shadow-sm)' }}
                >
                  <div className="w-52 shrink-0">
                    <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                      {t.token}
                    </p>
                    <p className="font-en text-sm font-extrabold text-[var(--ds-text)]">
                      {t.size}px · {t.name}
                    </p>
                  </div>
                  <p
                    className="font-bold leading-[var(--ds-leading-body)] text-[var(--ds-text)]"
                    style={{ fontSize: `var(${t.token})` }}
                  >
                    {t.sample}
                  </p>
                </div>
              ))}
            </div>

            {/* Font families */}
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div
                className="rounded-2xl bg-white p-6 ring-1 ring-[var(--ds-gray-100)]"
                style={{ boxShadow: 'var(--ds-shadow-sm)' }}
              >
                <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                  Almarai
                </p>
                <p
                  className="mt-3 text-3xl font-extrabold text-[var(--ds-text)]"
                  style={{ fontFamily: 'var(--font-almarai)' }}
                >
                  الذكاء
                </p>
                <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
                  الخط التصميمي للعناوين — (Salla)
                </p>
              </div>
              <div
                className="rounded-2xl bg-white p-6 ring-1 ring-[var(--ds-gray-100)]"
                style={{ boxShadow: 'var(--ds-shadow-sm)' }}
              >
                <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                  Cairo
                </p>
                <p className="mt-3 text-3xl font-bold text-[var(--ds-text)]">
                  النمو
                </p>
                <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
                  الخط الأساسي للنصوص
                </p>
              </div>
              <div
                className="rounded-2xl bg-white p-6 ring-1 ring-[var(--ds-gray-100)]"
                style={{ boxShadow: 'var(--ds-shadow-sm)' }}
              >
                <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                  Tajawal
                </p>
                <p className="mt-3 text-3xl font-bold text-[var(--ds-text)]">
                  العمل
                </p>
                <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
                  بديل للعناوين
                </p>
              </div>
              <div
                className="rounded-2xl bg-white p-6 ring-1 ring-[var(--ds-gray-100)]"
                style={{ boxShadow: 'var(--ds-shadow-sm)' }}
              >
                <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                  Montserrat
                </p>
                <p className="font-en mt-3 text-3xl font-extrabold text-[var(--ds-text)]">
                  SMART
                </p>
                <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
                  الأرقام والأسماء اللاتينية
                </p>
              </div>
            </div>
          </Section>

          {/* ==================== 3. Radius ==================== */}
          <Section id="radius" icon={Square} title="الزوايا" en="Border Radius">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
              {RADII.map((r) => (
                <div
                  key={r.token}
                  className="flex flex-col items-center gap-4 rounded-2xl bg-white p-8 ring-1 ring-[var(--ds-gray-100)]"
                  style={{ boxShadow: 'var(--ds-shadow-sm)' }}
                >
                  <div
                    className="h-16 w-16 bg-[var(--ds-primary-600)]"
                    style={{ borderRadius: `var(${r.token})` }}
                  />
                  <div className="text-center">
                    <p className="font-en text-sm font-extrabold text-[var(--ds-text)]">
                      {r.px}px
                    </p>
                    <p className="font-en text-xs text-[var(--ds-text-muted)]">
                      {r.token}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                      {r.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ==================== 4. Spacing ==================== */}
          <Section
            id="spacing"
            icon={Layers}
            title="المسافات"
            en="Spacing Scale"
          >
            <div
              className="flex flex-wrap items-end gap-8 rounded-2xl bg-white p-8 ring-1 ring-[var(--ds-gray-100)]"
              style={{ boxShadow: 'var(--ds-shadow-sm)' }}
            >
              {SPACING.map((s) => (
                <div key={s.token} className="flex flex-col items-center gap-3">
                  <div
                    className="bg-[var(--ds-primary-600)]"
                    style={{
                      width: `var(${s.token})`,
                      height: `var(${s.token})`,
                    }}
                  />
                  <div className="text-center">
                    <p className="font-en text-sm font-extrabold text-[var(--ds-text)]">
                      {s.px}px
                    </p>
                    <p className="font-en text-[10px] text-[var(--ds-text-muted)]">
                      {s.token}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ==================== 5. Buttons ==================== */}
          <Section
            id="buttons"
            icon={MousePointerClick}
            title="الأزرار"
            en="Buttons"
          >
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Variants */}
              <div
                className="rounded-2xl bg-white p-8 ring-1 ring-[var(--ds-gray-100)]"
                style={{ boxShadow: 'var(--ds-shadow-sm)' }}
              >
                <h3 className="mb-6 text-lg font-extrabold text-[var(--ds-text)]">
                  الأنماط
                </h3>
                <div className="flex flex-wrap items-center gap-4">
                  <button className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] bg-[var(--ds-primary-600)] px-5 py-2.5 text-sm font-extrabold text-white shadow-[var(--ds-shadow-sm)] transition hover:bg-[var(--ds-primary-700)]">
                    <Zap className="h-4 w-4" />
                    أساسي
                  </button>
                  <button className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] bg-[var(--ds-bronze-500)] px-5 py-2.5 text-sm font-extrabold text-white shadow-[var(--ds-shadow-bronze)] transition hover:bg-[var(--ds-bronze-600)]">
                    <Star className="h-4 w-4" />
                    برونزي
                  </button>
                  <button className="rounded-[var(--ds-radius-md)] border-2 border-[var(--ds-primary-600)] px-5 py-2.5 text-sm font-extrabold text-[var(--ds-primary-700)] transition hover:bg-[var(--ds-primary-50)]">
                    مخطط
                  </button>
                  <button className="rounded-[var(--ds-radius-md)] px-5 py-2.5 text-sm font-extrabold text-[var(--ds-primary-700)] transition hover:bg-[var(--ds-primary-50)]">
                    شفاف (Ghost)
                  </button>
                  <button className="rounded-[var(--ds-radius-md)] bg-[var(--ds-gray-100)] px-5 py-2.5 text-sm font-extrabold text-[var(--ds-text)] transition hover:bg-[var(--ds-gray-200)]">
                    ثانوي
                  </button>
                  <button className="text-sm font-extrabold text-[var(--ds-primary-700)] underline underline-offset-4 transition hover:text-[var(--ds-primary-800)]">
                    رابط نصي
                  </button>
                </div>

                {/* Pill CTA — Zid / Idaratech */}
                <h3 className="mb-4 mt-10 text-base font-extrabold text-[var(--ds-text)]">
                  زر الدعوة Pill CTA
                </h3>
                <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-[var(--ds-primary-50)] p-5">
                  <button className="group inline-flex items-center gap-2 rounded-full bg-[var(--ds-primary-600)] px-6 py-3 text-sm font-extrabold text-white shadow-[var(--ds-shadow-glow)] transition hover:bg-[var(--ds-primary-700)]">
                    ابدأ تجربتك المجانية
                    <ArrowUpLeft className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </button>
                  <button className="inline-flex items-center gap-2 rounded-full border border-[var(--ds-primary-300)] px-6 py-3 text-sm font-extrabold text-[var(--ds-primary-700)] transition hover:bg-white">
                    احجز عرضاً توضيحياً
                  </button>
                </div>
              </div>

              {/* Sizes + disabled + dark surface */}
              <div className="space-y-5">
                <div
                  className="rounded-2xl bg-white p-8 ring-1 ring-[var(--ds-gray-100)]"
                  style={{ boxShadow: 'var(--ds-shadow-sm)' }}
                >
                  <h3 className="mb-6 text-lg font-extrabold text-[var(--ds-text)]">
                    الأحجام والحالات
                  </h3>
                  <div className="flex flex-wrap items-center gap-4">
                    <button className="rounded-[var(--ds-radius-md)] bg-[var(--ds-primary-600)] px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-[var(--ds-primary-700)]">
                      صغير
                    </button>
                    <button className="rounded-[var(--ds-radius-md)] bg-[var(--ds-primary-600)] px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[var(--ds-primary-700)]">
                      متوسط
                    </button>
                    <button className="rounded-[var(--ds-radius-md)] bg-[var(--ds-primary-600)] px-7 py-3.5 text-base font-extrabold text-white transition hover:bg-[var(--ds-primary-700)]">
                      كبير
                    </button>
                    <button
                      disabled
                      className="cursor-not-allowed rounded-[var(--ds-radius-md)] bg-[var(--ds-primary-600)] px-5 py-2.5 text-sm font-extrabold text-white opacity-40"
                    >
                      معطّل
                    </button>
                    <button className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] bg-[var(--ds-primary-600)] px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[var(--ds-primary-700)]">
                      <Shield className="h-4 w-4" />
                      بأيقونة
                    </button>
                  </div>
                </div>

                {/* Dark surface buttons — Zid */}
                <div
                  className="ds-gradient-dark relative overflow-hidden rounded-2xl p-8"
                  style={{ boxShadow: 'var(--ds-shadow-md)' }}
                >
                  <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-[var(--ds-primary-500)]/30 blur-2xl" />
                  <h3 className="relative mb-6 text-lg font-extrabold text-white">
                    على السطح الداكن
                  </h3>
                  <div className="relative flex flex-wrap items-center gap-4">
                    <button className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-extrabold text-[var(--ds-primary-800)] shadow-[var(--ds-shadow-lg)] transition hover:bg-[var(--ds-primary-50)]">
                      ابدأ الآن
                      <ArrowUpLeft className="h-4 w-4" />
                    </button>
                    <button className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-extrabold text-white transition hover:bg-white/10">
                      اكتشف المزيد
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* ==================== 6. Inputs ==================== */}
          <Section
            id="inputs"
            icon={RectangleEllipsis}
            title="المدخلات"
            en="Form Inputs"
          >
            <div className="grid gap-5 lg:grid-cols-2">
              <div
                className="rounded-2xl bg-white p-8 ring-1 ring-[var(--ds-gray-100)]"
                style={{ boxShadow: 'var(--ds-shadow-sm)' }}
              >
                <h3 className="mb-6 text-lg font-extrabold text-[var(--ds-text)]">
                  الحقول النصية
                </h3>
                <div className="space-y-5">
                  <div>
                    <FieldLabel ar="الاسم الكامل" en="text" />
                    <input
                      type="text"
                      placeholder="أدخل اسمك الكامل"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <FieldLabel ar="البريد الإلكتروني" en="email" />
                    <div className="relative">
                      <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
                      <input
                        type="email"
                        placeholder="name@example.com"
                        className={`${inputCls} pr-10`}
                      />
                    </div>
                  </div>
                  <div>
                    <FieldLabel ar="كلمة المرور" en="password" />
                    <div className="relative">
                      <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
                      <input
                        type="password"
                        defaultValue="secret123"
                        className={`${inputCls} pr-10`}
                      />
                    </div>
                  </div>
                  <div>
                    <FieldLabel ar="الدولة" en="select" />
                    <select defaultValue="sa" className={inputCls}>
                      <option value="sa">السعودية</option>
                      <option value="ae">الإمارات</option>
                      <option value="kw">الكويت</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel ar="ملاحظات إضافية" en="textarea" />
                    <textarea
                      rows={3}
                      placeholder="اكتب ملاحظاتك هنا…"
                      className={`${inputCls} resize-none`}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div
                  className="rounded-2xl bg-white p-8 ring-1 ring-[var(--ds-gray-100)]"
                  style={{ boxShadow: 'var(--ds-shadow-sm)' }}
                >
                  <h3 className="mb-6 text-lg font-extrabold text-[var(--ds-text)]">
                    الاختيارات
                  </h3>
                  <div className="flex flex-wrap items-center gap-8">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[var(--ds-text)]">
                      <input
                        type="checkbox"
                        defaultChecked
                        className="h-5 w-5 rounded"
                        style={{ accentColor: 'var(--ds-primary-600)' }}
                      />
                      أوافق على الشروط
                    </label>
                    <div className="flex items-center gap-5">
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[var(--ds-text)]">
                        <input
                          type="radio"
                          name="ds-plan"
                          defaultChecked
                          className="h-5 w-5"
                          style={{ accentColor: 'var(--ds-primary-600)' }}
                        />
                        شهري
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[var(--ds-text)]">
                        <input
                          type="radio"
                          name="ds-plan"
                          className="h-5 w-5"
                          style={{ accentColor: 'var(--ds-primary-600)' }}
                        />
                        سنوي
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-[var(--ds-text)]">
                        {toggleOn ? 'مفعّل' : 'متوقف'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setToggleOn(!toggleOn)}
                        aria-pressed={toggleOn}
                        className={`relative h-7 w-12 rounded-full transition-colors ${
                          toggleOn
                            ? 'bg-[var(--ds-primary-600)]'
                            : 'bg-[var(--ds-gray-300)]'
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                            toggleOn ? 'right-6' : 'right-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-2xl bg-white p-8 ring-1 ring-[var(--ds-gray-100)]"
                  style={{ boxShadow: 'var(--ds-shadow-sm)' }}
                >
                  <h3 className="mb-6 text-lg font-extrabold text-[var(--ds-text)]">
                    حقل بتركيز
                  </h3>
                  <input
                    type="text"
                    placeholder="ركّز على هذا الحقل لترى حلقة التركيز"
                    className={`${inputCls} border-[var(--ds-primary-500)] ring-4 ring-[var(--ds-primary-100)]`}
                  />
                  <p className="mt-3 text-xs leading-relaxed text-[var(--ds-text-muted)]">
                    حلقة التركيز: حدود بلون{' '}
                    <span className="font-en">--ds-primary-500</span> مع توهّج
                    خفيف عند التفاعل مع الحقول.
                  </p>
                </div>

                {/* Dark surface input — Envaglo */}
                <div
                  className="ds-gradient-dark relative overflow-hidden rounded-2xl p-8"
                  style={{ boxShadow: 'var(--ds-shadow-md)' }}
                >
                  <h3 className="relative mb-5 text-lg font-extrabold text-white">
                    نموذج على السطح الداكن
                  </h3>
                  <div className="relative space-y-4">
                    <input
                      type="text"
                      placeholder="الاسم الكامل"
                      className="w-full rounded-[var(--ds-radius-md)] border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-white/50 focus:border-[var(--ds-primary-400)] focus:bg-white/15 focus:ring-4 focus:ring-[var(--ds-primary-500)]/25"
                    />
                    <input
                      type="tel"
                      placeholder="رقم الجوال"
                      className="w-full rounded-[var(--ds-radius-md)] border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-white/50 focus:border-[var(--ds-primary-400)] focus:bg-white/15 focus:ring-4 focus:ring-[var(--ds-primary-500)]/25"
                    />
                    <button className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-extrabold text-[var(--ds-primary-800)] shadow-[var(--ds-shadow-lg)] transition hover:bg-[var(--ds-primary-50)]">
                      تواصل معنا
                      <ArrowUpLeft className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* ==================== 7. Cards ==================== */}
          <Section id="cards" icon={CreditCard} title="البطاقات" en="Cards">
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {/* Pricing card — bronze popular (Idaratech/Salla) */}
              <div
                className="relative overflow-hidden rounded-[var(--ds-radius-xl)] bg-white p-8 ring-1 ring-[var(--ds-gray-100)]"
                style={{ boxShadow: 'var(--ds-shadow-lg)' }}
              >
                <div className="pointer-events-none absolute -left-12 -top-12 h-32 w-32 rounded-full bg-[var(--ds-bronze-100)] blur-2xl" />
                <div className="relative flex items-center justify-between">
                  <h3 className="text-lg font-extrabold text-[var(--ds-text)]">
                    الباقة المتقدمة
                  </h3>
                  <span className="flex items-center gap-1 rounded-full bg-[var(--ds-bronze-500)] px-3 py-1 text-xs font-bold text-white shadow-[var(--ds-shadow-bronze)]">
                    <Star className="h-3 w-3 fill-current" />
                    الأكثر طلباً
                  </span>
                </div>
                <p className="relative mt-1 text-sm text-[var(--ds-text-muted)]">
                  للمؤسسات المتوسطة
                </p>
                <div className="relative mt-6 flex items-end gap-2">
                  <span className="text-4xl font-extrabold text-[var(--ds-bronze-600)]">
                    499
                  </span>
                  <span className="pb-1 text-sm text-[var(--ds-text-muted)]">
                    ريال / شهرياً
                  </span>
                </div>
                <ul className="relative mt-6 space-y-3">
                  {[
                    'محاسبة ومخزون متكامل',
                    'تقارير ذكية ولحظية',
                    'دعم فني على مدار الساعة',
                  ].map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-[var(--ds-text)]"
                    >
                      <CircleCheckBig className="h-4 w-4 text-[var(--ds-success-500)]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button className="mt-8 w-full rounded-full bg-[var(--ds-bronze-500)] py-3 text-sm font-extrabold text-white shadow-[var(--ds-shadow-bronze)] transition hover:bg-[var(--ds-bronze-600)]">
                  ابدأ الآن
                </button>
              </div>

              {/* Feature card — icon tile */}
              <div
                className="relative overflow-hidden rounded-[var(--ds-radius-xl)] bg-white p-8 ring-1 ring-[var(--ds-gray-100)]"
                style={{ boxShadow: 'var(--ds-shadow-md)' }}
              >
                <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[var(--ds-primary-50)] blur-2xl" />
                <span className="relative flex h-12 w-12 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[var(--ds-primary-600)] text-white shadow-[var(--ds-shadow-glow)]">
                  <Zap className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-extrabold text-[var(--ds-text)]">
                  أتمتة ذكية
                </h3>
                <p className="mt-2 text-sm leading-[var(--ds-leading-body)] text-[var(--ds-text-muted)]">
                  أتمتة العمليات المتكررة وتقليل الجهد اليدوي عبر سير عمل مخصصة
                  لكل إدارة.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {['مبيعات', 'مشتريات', 'مخزون'].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[var(--ds-gray-100)] px-2.5 py-0.5 text-xs font-bold text-[var(--ds-gray-600)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <button className="mt-6 text-sm font-extrabold text-[var(--ds-primary-700)] transition hover:text-[var(--ds-primary-800)]">
                  اعرف المزيد ←
                </button>
              </div>

              {/* Stat card on dark — Salla/Idaratech */}
              <div
                className="ds-gradient-dark relative overflow-hidden rounded-[var(--ds-radius-xl)] p-8 text-white"
                style={{ boxShadow: 'var(--ds-shadow-lg)' }}
              >
                <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[var(--ds-primary-500)]/25 blur-3xl" />
                <p className="font-en relative text-5xl font-extrabold tracking-tight">
                  98%
                </p>
                <p className="relative mt-1 text-sm text-white/70">
                  رضا العملاء
                </p>
                <div className="relative mt-4 flex items-center gap-2">
                  <span className="font-en text-2xl font-extrabold tracking-tight text-[var(--ds-gold-500)]">
                    4.9
                  </span>
                  <span className="font-en text-sm font-bold text-white/70">
                    / 5
                  </span>
                  <span className="mr-auto rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-bold text-white/85">
                    1,200+ تقييم
                  </span>
                </div>
                <div className="relative mt-6 flex items-center gap-2 text-sm text-white/70">
                  <TrendingUp className="h-4 w-4" />
                  +12% هذا الربع
                </div>
                <div className="relative mt-6 border-t border-white/10 pt-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">مؤشر الأداء</span>
                    <span className="font-en font-extrabold">92 / 100</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[92%] rounded-full bg-gradient-to-l from-[var(--ds-primary-400)] to-[var(--ds-primary-600)]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Layered product mockup — Wafeq depth */}
            <div
              className="relative mt-8 hidden overflow-hidden rounded-[var(--ds-radius-xl)] bg-white p-10 ring-1 ring-[var(--ds-gray-100)] md:block"
              style={{ boxShadow: 'var(--ds-shadow-xl)' }}
            >
              <h3 className="mb-8 text-center text-lg font-extrabold text-[var(--ds-text)]">
                عرض المنتج متعدد الطبقات —{' '}
                <span className="font-en">Wafeq style</span>
              </h3>
              <div className="relative mx-auto flex max-w-3xl items-end justify-center">
                {/* back layer */}
                <div className="absolute left-4 top-2 w-64 -rotate-6 rounded-[var(--ds-radius-lg)] border border-[var(--ds-gray-200)] bg-white p-4 opacity-70 shadow-[var(--ds-shadow-lg)]">
                  <div className="h-2 w-2/3 rounded-full bg-[var(--ds-gray-200)]" />
                  <div className="mt-3 space-y-2">
                    <div className="h-8 rounded-md bg-[var(--ds-primary-50)]" />
                    <div className="h-8 rounded-md bg-[var(--ds-gray-100)]" />
                  </div>
                </div>
                {/* right layer */}
                <div className="absolute right-4 top-2 w-64 rotate-6 rounded-[var(--ds-radius-lg)] border border-[var(--ds-gray-200)] bg-white p-4 opacity-80 shadow-[var(--ds-shadow-lg)]">
                  <div className="flex items-center justify-between">
                    <div className="h-2 w-12 rounded-full bg-[var(--ds-bronze-300)]" />
                    <div className="h-2 w-8 rounded-full bg-[var(--ds-gray-200)]" />
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="h-8 rounded-md bg-[var(--ds-gray-100)]" />
                    <div className="h-8 rounded-md bg-[var(--ds-bronze-50)]" />
                  </div>
                </div>
                {/* front layer — main dashboard */}
                <div className="relative z-10 w-72 rounded-[var(--ds-radius-lg)] border border-[var(--ds-gray-200)] bg-white p-5 shadow-[var(--ds-shadow-xl)]">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--ds-danger-500)]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--ds-warning-500)]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--ds-success-500)]" />
                    <span className="mr-auto font-en text-[10px] font-bold text-[var(--ds-text-muted)]">
                      SMART ERP
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="h-2 w-16 rounded-full bg-[var(--ds-gray-300)]" />
                    <div className="h-6 w-16 rounded-full bg-[var(--ds-primary-600)]" />
                  </div>
                  <div className="mt-4 flex gap-3">
                    <div className="flex-1 rounded-lg bg-[var(--ds-primary-50)] p-3">
                      <div className="h-2 w-8 rounded-full bg-[var(--ds-primary-200)]" />
                      <div className="mt-2 h-4 w-12 rounded-full bg-[var(--ds-primary-600)]" />
                    </div>
                    <div className="flex-1 rounded-lg bg-[var(--ds-success-50)] p-3">
                      <div className="h-2 w-8 rounded-full bg-[var(--ds-success-500)]/40" />
                      <div className="mt-2 h-4 w-12 rounded-full bg-[var(--ds-success-500)]" />
                    </div>
                    <div className="flex-1 rounded-lg bg-[var(--ds-bronze-50)] p-3">
                      <div className="h-2 w-8 rounded-full bg-[var(--ds-bronze-300)]" />
                      <div className="mt-2 h-4 w-12 rounded-full bg-[var(--ds-bronze-500)]" />
                    </div>
                  </div>
                  <div className="mt-4 h-20 rounded-lg bg-gradient-to-b from-[var(--ds-primary-100)] to-[var(--ds-primary-50)]" />
                </div>
              </div>
            </div>
          </Section>

          {/* ==================== 8. Badges & Trust ==================== */}
          <Section
            id="badges"
            icon={Tag}
            title="الشارات والثقة"
            en="Badges & Trust"
          >
            {/* Status badges */}
            <div
              className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-8 ring-1 ring-[var(--ds-gray-100)]"
              style={{ boxShadow: 'var(--ds-shadow-sm)' }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-primary-600)] px-3 py-1 text-xs font-bold text-white">
                <Sparkles className="h-3.5 w-3.5" />
                أساسي
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-bronze-500)] px-3 py-1 text-xs font-bold text-white">
                <Star className="h-3.5 w-3.5" />
                برونزي
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-success-50)] px-3 py-1 text-xs font-bold text-[var(--ds-success-700)]">
                <CircleCheckBig className="h-3.5 w-3.5 text-[var(--ds-success-500)]" />
                مفعّل
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-warning-50)] px-3 py-1 text-xs font-bold text-[var(--ds-warning-700)]">
                <TriangleAlert className="h-3.5 w-3.5 text-[var(--ds-warning-500)]" />
                معلّق
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-primary-50)] px-3 py-1 text-xs font-bold text-[var(--ds-primary-700)]">
                <Info className="h-3.5 w-3.5 text-[var(--ds-primary-500)]" />
                معلومات
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--ds-primary-600)] bg-white px-3 py-1 text-xs font-bold text-[var(--ds-primary-700)]">
                مخطط
              </span>
            </div>

            {/* Compliance badges — ZATCA/ISO style (Wafeq) */}
            <h3 className="mb-4 mt-10 text-lg font-extrabold text-[var(--ds-text)]">
              شارات الامتثال{' '}
              <span className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                Compliance
              </span>
            </h3>
            <div className="flex flex-wrap items-center gap-4">
              {[
                {
                  icon: BadgeCheck,
                  label: 'متوافق مع ZATCA',
                  cls: 'text-[var(--ds-success-700)]',
                },
                {
                  icon: ShieldCheck,
                  label: 'SOC 2',
                  cls: 'text-[var(--ds-primary-700)]',
                },
                {
                  icon: Shield,
                  label: 'ISO 27001',
                  cls: 'text-[var(--ds-gray-600)]',
                },
                {
                  icon: Lock,
                  label: 'تشفير البيانات',
                  cls: 'text-[var(--ds-bronze-600)]',
                },
              ].map((b) => (
                <span
                  key={b.label}
                  className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-gray-200)] bg-white px-4 py-2 text-sm font-bold text-[var(--ds-text)] shadow-[var(--ds-shadow-xs)]"
                >
                  <b.icon className={`h-4 w-4 ${b.cls}`} />
                  {b.label}
                </span>
              ))}
            </div>

            {/* Client logos — grayscale bar (Idaratech) */}
            <h3 className="mb-4 mt-10 text-lg font-extrabold text-[var(--ds-text)]">
              عملاء يثقون بنا{' '}
              <span className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                Client logos
              </span>
            </h3>
            <div
              className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-[var(--ds-gray-100)] bg-white px-8 py-6"
              style={{ boxShadow: 'var(--ds-shadow-sm)' }}
            >
              {CLIENT_LOGOS.map((c) => (
                <span
                  key={c.name}
                  className="flex items-center gap-2 text-sm font-extrabold text-[var(--ds-gray-400)] transition hover:text-[var(--ds-gray-600)]"
                >
                  <c.icon className="h-5 w-5" />
                  {c.name}
                </span>
              ))}
            </div>
          </Section>

          {/* ==================== 9. Alerts ==================== */}
          <Section id="alerts" icon={Bell} title="التنبيهات" en="Alerts">
            <div className="grid gap-4 lg:grid-cols-2">
              {ALERTS.map((a) => (
                <div
                  key={a.title}
                  className={`flex items-start gap-3 rounded-[var(--ds-radius-lg)] border-2 p-5 ${a.wrap}`}
                >
                  <a.icon className={`mt-0.5 h-5 w-5 shrink-0 ${a.iconCls}`} />
                  <div>
                    <p className="text-sm font-extrabold">{a.title}</p>
                    <p className="mt-1 text-sm opacity-80">{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ==================== 10. Stats band on dark — Salla ==================== */}
          <Section
            id="stats"
            icon={TrendingUp}
            title="شريط الإحصائيات"
            en="Stats Band"
          >
            <div
              className="ds-gradient-dark relative overflow-hidden rounded-[var(--ds-radius-xl)] px-8 py-14"
              style={{ boxShadow: 'var(--ds-shadow-lg)' }}
            >
              <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-[var(--ds-primary-500)]/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-[var(--ds-bronze-500)]/15 blur-3xl" />
              <div className="relative grid grid-cols-2 gap-10 text-center md:grid-cols-4">
                {STATS.map((s) => (
                  <div key={s.label}>
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[var(--ds-radius-lg)] border border-white/15 bg-white/10">
                      <s.icon className="h-6 w-6 text-white" />
                    </div>
                    <p className="font-en text-4xl font-extrabold tracking-tight text-white">
                      {s.value}
                    </p>
                    <p className="mt-1 text-sm text-white/70">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* ==================== 11. CTA band ==================== */}
          <Section id="cta" icon={Megaphone} title="شريط الدعوة" en="CTA Band">
            <div
              className="ds-gradient relative overflow-hidden rounded-[var(--ds-radius-xl)] px-8 py-14 text-center text-white"
              style={{ boxShadow: 'var(--ds-shadow-xl)' }}
            >
              <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white/10" />
              <div className="pointer-events-none absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-white/10" />
              <h2 className="relative text-3xl font-extrabold">
                جرّب SMART ERP مجاناً — 14 يوم
              </h2>
              <p className="relative mt-3 text-white/85">
                ابدأ رحلتك نحو إدارة ذكية لمؤسستك دون أي التزام.
              </p>
              <button className="group relative mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-base font-extrabold text-[var(--ds-primary-800)] shadow-[var(--ds-shadow-lg)] transition hover:bg-[var(--ds-primary-50)]">
                ابدأ التجربة المجانية
                <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" />
              </button>
            </div>
          </Section>

          {/* ==================== 12. Usage notes ==================== */}
          <Section
            id="usage"
            icon={Shield}
            title="قواعد الاستخدام"
            en="Do & Don't"
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-[var(--ds-radius-lg)] border-2 border-[var(--ds-success-500)]/20 bg-[var(--ds-success-50)] p-8">
                <h3 className="mb-5 flex items-center gap-2 text-lg font-extrabold text-[var(--ds-success-700)]">
                  <CircleCheckBig className="h-5 w-5" />
                  افعل
                </h3>
                <ul className="space-y-3">
                  {DOS.map((d) => (
                    <li
                      key={d}
                      className="flex items-start gap-2 text-sm text-[var(--ds-success-700)]"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-success-500)]" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[var(--ds-radius-lg)] border-2 border-[var(--ds-danger-500)]/20 bg-[var(--ds-danger-50)] p-8">
                <h3 className="mb-5 flex items-center gap-2 text-lg font-extrabold text-[var(--ds-danger-700)]">
                  <CircleX className="h-5 w-5" />
                  لا تفعل
                </h3>
                <ul className="space-y-3">
                  {DONTS.map((d) => (
                    <li
                      key={d}
                      className="flex items-start gap-2 text-sm text-[var(--ds-danger-700)]"
                    >
                      <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-danger-500)]" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>
        </main>

        {/* ==================== Footer ==================== */}
        <footer className="ds-gradient-dark border-t border-white/10 py-8">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 text-center">
            <div className="flex items-center gap-2 text-sm text-white/70">
              <Users className="h-4 w-4" />
              <span>
                مبني على تحليل 15 منصة منافسة — راجع{' '}
                <span className="font-en">docs/design-synthesis.md</span>
              </span>
            </div>
            <p className="font-en text-xs text-white/50">
              SMART ERP Design System · v2.0
            </p>
          </div>
        </footer>
      </div>
    </>
  );
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  const { locale } = context;

  return {
    props: {
      ...(locale ? await serverSideTranslations(locale, ['common']) : {}),
    },
  };
};

DesignSystem.getLayout = function getLayout(page: ReactNode) {
  return <>{page}</>;
};

export default DesignSystem;
