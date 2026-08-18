import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { GetServerSidePropsContext } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { Cairo, Montserrat, Tajawal } from 'next/font/google';
import type { NextPageWithLayout } from 'types';
import type { LucideIcon } from 'lucide-react';
import {
  TriangleAlert,
  ArrowLeft,
  ArrowRight,
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
  Sparkles,
  Square,
  Star,
  Tag,
  TrendingUp,
  Type,
  Users,
  CircleX,
  Zap,
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

/* ------------------------------------------------------------------ */
/* Data                                                               */
/* ------------------------------------------------------------------ */

const COLORS = [
  { token: '--ds-primary', hex: '#1565E0', hint: 'CTAs والهيدر' },
  { token: '--ds-primary-dark', hex: '#0D47A1', hint: 'hovers والفوتر' },
  { token: '--ds-primary-light', hex: '#42A5F5', hint: 'خلفيات معلومات' },
  { token: '--ds-sky', hex: '#2196F3', hint: 'لمسات سماوية' },
  { token: '--ds-glint', hex: '#E0F7FA', hint: 'بريق (glint)' },
  { token: '--ds-accent', hex: '#B8733A', hint: 'البرونز للأسعار والمميز' },
  { token: '--ds-accent-light', hex: '#D4A574', hint: 'برونز فاتح' },
  { token: '--ds-copper', hex: '#8B5E3C', hint: 'نحاس داكن' },
  { token: '--ds-surface', hex: '#FFFFFF', hint: 'السطوح' },
  { token: '--ds-surface-alt', hex: '#F0F4FA', hint: 'خلفية بديلة' },
  { token: '--ds-text', hex: '#1A2332', hint: 'النص الأساسي' },
  { token: '--ds-text-muted', hex: '#64748B', hint: 'نص ثانوي' },
];

const LIGHT_TOKENS = [
  '--ds-glint',
  '--ds-surface',
  '--ds-surface-alt',
  '--ds-primary-light',
  '--ds-accent-light',
];

const TYPE_SCALE = [
  {
    token: '--ds-h1',
    size: 48,
    name: 'H1 — العنوان الرئيسي',
    sample: 'نظام تخطيط موارد المؤسسات الذكي',
  },
  {
    token: '--ds-h2',
    size: 32,
    name: 'H2 — عنوان قسم',
    sample: 'حلول متكاملة لإدارة أعمالك',
  },
  {
    token: '--ds-h3',
    size: 24,
    name: 'H3 — عنوان فرعي',
    sample: 'ميزات SMART ERP الأساسية',
  },
  {
    token: '--ds-body',
    size: 18,
    name: 'Body — النص الأساسي',
    sample:
      'نظام متكامل لإدارة المحاسبة والمخزون والمشتريات والموارد البشرية في مكان واحد.',
  },
  {
    token: '--ds-caption',
    size: 14,
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
];

const RADII = [
  { token: '--ds-radius-sm', px: 8, label: 'صغير — العناصر التفاعلية' },
  { token: '--ds-radius-md', px: 12, label: 'متوسط — الحقول والمدخلات' },
  { token: '--ds-radius-lg', px: 16, label: 'كبير — البطاقات' },
];

const ALERTS = [
  {
    title: 'تمت العملية بنجاح',
    desc: 'تم حفظ التغييرات وعرضها على الموقع.',
    icon: CircleCheckBig,
    wrap: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    iconCls: 'text-emerald-500',
  },
  {
    title: 'معلومة',
    desc: 'تم تحديث النظام إلى الإصدار الأحدث.',
    icon: Info,
    wrap: 'border-[var(--ds-primary-light)] bg-[var(--ds-glint)] text-[var(--ds-primary-dark)]',
    iconCls: 'text-[var(--ds-primary)]',
  },
  {
    title: 'تنبيه',
    desc: 'اقتربت مساحة التخزين من الحد الأقصى.',
    icon: TriangleAlert,
    wrap: 'border-amber-200 bg-amber-50 text-amber-800',
    iconCls: 'text-amber-500',
  },
  {
    title: 'خطأ',
    desc: 'تعذر الاتصال بالخادم، حاول مرة أخرى.',
    icon: CircleX,
    wrap: 'border-red-200 bg-red-50 text-red-800',
    iconCls: 'text-red-500',
  },
];

const DOS = [
  'استخدم التدرج اللوني في الهيرو وCTA فقط',
  'البرونز حصري للأسعار والميزات المميزة',
  'زوايا 16px للبطاقات و 8px للعناصر التفاعلية',
  'نص أبيض على الخلفيات الزرقاء',
  'أسطح مسطحة مع ظلال ناعمة خفيفة',
];

const DONTS = [
  'لا تستخدم التدرج في الأزرار أو العناصر الصغيرة',
  'لا تستخدم البرونز للنصوص أو الأزرار العادية',
  'لا تخلط أحجام الزوايا داخل نفس المكوّن',
  'لا تستخدم نصاً داكناً على الأزرق الداكن',
  'تجنّب الظلال الثقيلة والتأثيرات ثلاثية الأبعاد',
];

/* ------------------------------------------------------------------ */
/* Small building blocks                                              */
/* ------------------------------------------------------------------ */

const inputCls =
  'w-full rounded-lg border-2 border-gray-200 bg-white px-4 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-muted)] focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]';

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
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-glint)] text-[var(--ds-primary)]">
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
        className={`min-h-screen bg-[var(--ds-surface-alt)] text-[var(--ds-text)] ${cairo.variable} ${montserrat.variable} ${tajawal.variable}`}
      >
        {/* ==================== Header / Hero ==================== */}
        <header className="ds-gradient relative overflow-hidden text-white">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-white/10" />
          <div className="relative mx-auto max-w-6xl px-6 py-16">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur transition hover:bg-white/25"
            >
              <ArrowRight className="h-4 w-4" />
              العودة للرئيسية
            </Link>
            <h1 className="mt-8 text-4xl font-extrabold md:text-5xl">
              نظام التصميم — <span className="font-en">SMART ERP</span>
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/85">
              مرجع موحّد للألوان والخطوط والمسافات والمكوّنات الأساسية لهوية
              SMART ERP — صُمم لضمان تجربة متسقة في كل صفحات الموقع.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {['الألوان', 'الخطوط', 'الأزرار', 'المدخلات', 'البطاقات'].map(
                (chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur"
                  >
                    {chip}
                  </span>
                )
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-20 px-6 py-20">
          {/* ==================== 1. Colors ==================== */}
          <Section id="colors" icon={Palette} title="الألوان" en="Color Tokens">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {COLORS.map((c) => {
                const light = LIGHT_TOKENS.includes(c.token);
                return (
                  <div
                    key={c.token}
                    className="overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100"
                    style={{ boxShadow: 'var(--ds-shadow-sm)' }}
                  >
                    <div
                      className="h-20"
                      style={{ background: `var(${c.token})` }}
                    />
                    <div className="space-y-1 p-4">
                      <p
                        className={`font-en text-xs font-bold ${
                          light
                            ? 'text-[var(--ds-text-muted)]'
                            : 'text-[var(--ds-text)]'
                        }`}
                      >
                        {c.token}
                      </p>
                      <p className="font-en text-sm font-extrabold text-[var(--ds-text)]">
                        {c.hex}
                      </p>
                      <p className="text-xs leading-relaxed text-[var(--ds-text-muted)]">
                        {c.hint}
                      </p>
                    </div>
                  </div>
                );
              })}

              {/* gradient swatch */}
              <div
                className="overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100"
                style={{ boxShadow: 'var(--ds-shadow-sm)' }}
              >
                <div
                  className="h-20"
                  style={{ background: 'var(--ds-gradient)' }}
                />
                <div className="space-y-1 p-4">
                  <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                    --ds-gradient
                  </p>
                  <p className="text-sm font-extrabold text-[var(--ds-text)]">
                    linear-gradient(135deg)
                  </p>
                  <p className="text-xs leading-relaxed text-[var(--ds-text-muted)]">
                    تدرّج الهوية — للهيرو وCTA
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* ==================== 2. Typography ==================== */}
          <Section id="typography" icon={Type} title="الخطوط" en="Typography">
            {/* Display sample */}
            <div
              className="mb-8 rounded-2xl bg-[var(--ds-text)] p-10 text-center"
              style={{ boxShadow: 'var(--ds-shadow-md)' }}
            >
              <p className="font-en text-4xl font-extrabold tracking-wider text-white md:text-5xl">
                SMART ERP
              </p>
              <p className="font-en mt-3 text-xs font-semibold uppercase tracking-[0.35em] text-[var(--ds-primary-light)]">
                Montserrat — Display
              </p>
            </div>

            {/* Type scale */}
            <div className="space-y-4">
              {TYPE_SCALE.map((t) => (
                <div
                  key={t.token}
                  className="flex flex-col gap-2 rounded-2xl bg-white p-6 ring-1 ring-gray-100 md:flex-row md:items-baseline md:gap-8"
                  style={{ boxShadow: 'var(--ds-shadow-sm)' }}
                >
                  <div className="w-48 shrink-0">
                    <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                      {t.token}
                    </p>
                    <p className="font-en text-sm font-extrabold text-[var(--ds-text)]">
                      {t.size}px · {t.name}
                    </p>
                  </div>
                  <p
                    className="font-bold leading-snug text-[var(--ds-text)]"
                    style={{ fontSize: `var(${t.token})` }}
                  >
                    {t.sample}
                  </p>
                </div>
              ))}
            </div>

            {/* Font families */}
            <div className="mt-8 grid gap-5 sm:grid-cols-3">
              <div
                className="rounded-2xl bg-white p-6 ring-1 ring-gray-100"
                style={{ boxShadow: 'var(--ds-shadow-sm)' }}
              >
                <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                  Cairo
                </p>
                <p className="mt-3 text-3xl font-bold text-[var(--ds-text)]">
                  الذكاء
                </p>
                <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
                  الخط الأساسي للعربية
                </p>
              </div>
              <div
                className="rounded-2xl bg-white p-6 ring-1 ring-gray-100"
                style={{ boxShadow: 'var(--ds-shadow-sm)' }}
              >
                <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                  Tajawal
                </p>
                <p className="mt-3 text-3xl font-bold text-[var(--ds-text)]">
                  النمو
                </p>
                <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
                  بديل للعناوين والعربية
                </p>
              </div>
              <div
                className="rounded-2xl bg-white p-6 ring-1 ring-gray-100"
                style={{ boxShadow: 'var(--ds-shadow-sm)' }}
              >
                <p className="font-en text-xs font-bold text-[var(--ds-text-muted)]">
                  Montserrat
                </p>
                <p className="font-en mt-3 text-3xl font-extrabold text-[var(--ds-text)]">
                  SMART
                </p>
                <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
                  للأرقام والأسماء اللاتينية
                </p>
              </div>
            </div>
          </Section>

          {/* ==================== 3. Radius ==================== */}
          <Section id="radius" icon={Square} title="الزوايا" en="Border Radius">
            <div className="grid gap-5 sm:grid-cols-3">
              {RADII.map((r) => (
                <div
                  key={r.token}
                  className="flex flex-col items-center gap-4 rounded-2xl bg-white p-8 ring-1 ring-gray-100"
                  style={{ boxShadow: 'var(--ds-shadow-sm)' }}
                >
                  <div
                    className="h-20 w-20 bg-[var(--ds-primary)]"
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
              className="flex flex-wrap items-end gap-8 rounded-2xl bg-white p-8 ring-1 ring-gray-100"
              style={{ boxShadow: 'var(--ds-shadow-sm)' }}
            >
              {SPACING.map((s) => (
                <div key={s.token} className="flex flex-col items-center gap-3">
                  <div
                    className="bg-[var(--ds-primary)]"
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
            {/* Variants */}
            <div className="grid gap-5 lg:grid-cols-2">
              <div
                className="rounded-2xl bg-white p-8 ring-1 ring-gray-100"
                style={{ boxShadow: 'var(--ds-shadow-sm)' }}
              >
                <h3 className="mb-6 text-lg font-extrabold text-[var(--ds-text)]">
                  الأنماط
                </h3>
                <div className="flex flex-wrap items-center gap-4">
                  <button className="inline-flex items-center gap-2 rounded-lg bg-[var(--ds-primary)] px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[var(--ds-primary-dark)]">
                    <Zap className="h-4 w-4" />
                    أساسي
                  </button>
                  <button className="inline-flex items-center gap-2 rounded-lg bg-[var(--ds-accent)] px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[var(--ds-copper)]">
                    <Star className="h-4 w-4" />
                    برونزي
                  </button>
                  <button className="rounded-lg border-2 border-[var(--ds-primary)] px-5 py-2.5 text-sm font-extrabold text-[var(--ds-primary)] transition hover:bg-[var(--ds-glint)]">
                    مخطط
                  </button>
                  <button className="rounded-lg px-5 py-2.5 text-sm font-extrabold text-[var(--ds-primary)] transition hover:bg-[var(--ds-surface-alt)]">
                    شفاف (Ghost)
                  </button>
                  <button className="rounded-lg bg-[var(--ds-surface-alt)] px-5 py-2.5 text-sm font-extrabold text-[var(--ds-text)] transition hover:bg-gray-200">
                    ثانوي
                  </button>
                  <button className="text-sm font-extrabold text-[var(--ds-primary)] underline underline-offset-4 transition hover:text-[var(--ds-primary-dark)]">
                    رابط نصي
                  </button>
                </div>
              </div>

              {/* Sizes + disabled */}
              <div
                className="rounded-2xl bg-white p-8 ring-1 ring-gray-100"
                style={{ boxShadow: 'var(--ds-shadow-sm)' }}
              >
                <h3 className="mb-6 text-lg font-extrabold text-[var(--ds-text)]">
                  الأحجام والحالات
                </h3>
                <div className="flex flex-wrap items-center gap-4">
                  <button className="rounded-lg bg-[var(--ds-primary)] px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-[var(--ds-primary-dark)]">
                    صغير
                  </button>
                  <button className="rounded-lg bg-[var(--ds-primary)] px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[var(--ds-primary-dark)]">
                    متوسط
                  </button>
                  <button className="rounded-lg bg-[var(--ds-primary)] px-7 py-3.5 text-base font-extrabold text-white transition hover:bg-[var(--ds-primary-dark)]">
                    كبير
                  </button>
                  <button
                    disabled
                    className="cursor-not-allowed rounded-lg bg-[var(--ds-primary)] px-5 py-2.5 text-sm font-extrabold text-white opacity-50"
                  >
                    معطّل
                  </button>
                  <button className="inline-flex items-center gap-2 rounded-lg bg-[var(--ds-primary)] px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[var(--ds-primary-dark)]">
                    <Shield className="h-4 w-4" />
                    بأيقونة
                  </button>
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
                className="rounded-2xl bg-white p-8 ring-1 ring-gray-100"
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
                  className="rounded-2xl bg-white p-8 ring-1 ring-gray-100"
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
                        style={{ accentColor: 'var(--ds-primary)' }}
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
                          style={{ accentColor: 'var(--ds-primary)' }}
                        />
                        شهري
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[var(--ds-text)]">
                        <input
                          type="radio"
                          name="ds-plan"
                          className="h-5 w-5"
                          style={{ accentColor: 'var(--ds-primary)' }}
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
                          toggleOn ? 'bg-[var(--ds-primary)]' : 'bg-gray-300'
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
                  className="rounded-2xl bg-white p-8 ring-1 ring-gray-100"
                  style={{ boxShadow: 'var(--ds-shadow-sm)' }}
                >
                  <h3 className="mb-6 text-lg font-extrabold text-[var(--ds-text)]">
                    حقل بتركيز
                  </h3>
                  <input
                    type="text"
                    placeholder="ركّز على هذا الحقل لترى حلقة التركيز"
                    className={`${inputCls} border-[var(--ds-primary)] ring-2 ring-[var(--ds-primary)]`}
                  />
                  <p className="mt-3 text-xs leading-relaxed text-[var(--ds-text-muted)]">
                    حلقة التركيز: حدود بلون{' '}
                    <span className="font-en">--ds-primary</span> مع توهّج خفيف
                    عند التفاعل مع الحقول.
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* ==================== 7. Cards ==================== */}
          <Section id="cards" icon={CreditCard} title="البطاقات" en="Cards">
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {/* Pricing card */}
              <div
                className="rounded-2xl bg-white p-8 ring-1 ring-gray-100"
                style={{ boxShadow: 'var(--ds-shadow-md)' }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-extrabold text-[var(--ds-text)]">
                    الباقة المتقدمة
                  </h3>
                  <span className="rounded-full bg-[var(--ds-glint)] px-3 py-1 text-xs font-bold text-[var(--ds-primary-dark)]">
                    الأكثر طلباً
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
                  للمؤسسات المتوسطة
                </p>
                <div className="mt-6 flex items-end gap-2">
                  <span className="text-4xl font-extrabold text-[var(--ds-accent)]">
                    499
                  </span>
                  <span className="pb-1 text-sm text-[var(--ds-text-muted)]">
                    ريال / شهرياً
                  </span>
                </div>
                <ul className="mt-6 space-y-3">
                  {[
                    'محاسبة ومخزون متكامل',
                    'تقارير ذكية ولحظية',
                    'دعم فني على مدار الساعة',
                  ].map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-[var(--ds-text)]"
                    >
                      <Check className="h-4 w-4 text-[var(--ds-primary)]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button className="mt-8 w-full rounded-lg bg-[var(--ds-primary)] py-3 text-sm font-extrabold text-white transition hover:bg-[var(--ds-primary-dark)]">
                  ابدأ الآن
                </button>
              </div>

              {/* Feature card */}
              <div
                className="rounded-2xl bg-white p-8 ring-1 ring-gray-100"
                style={{ boxShadow: 'var(--ds-shadow-md)' }}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ds-glint)] text-[var(--ds-primary)]">
                  <Zap className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-extrabold text-[var(--ds-text)]">
                  أتمتة ذكية
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ds-text-muted)]">
                  أتمتة العمليات المتكررة وتقليل الجهد اليدوي عبر سير عمل مخصصة
                  لكل إدارة.
                </p>
                <button className="mt-6 text-sm font-extrabold text-[var(--ds-primary)] transition hover:text-[var(--ds-primary-dark)]">
                  اعرف المزيد ←
                </button>
              </div>

              {/* Stat card */}
              <div
                className="rounded-2xl bg-[var(--ds-text)] p-8 text-white"
                style={{ boxShadow: 'var(--ds-shadow-md)' }}
              >
                <p className="font-en text-4xl font-extrabold">98%</p>
                <p className="mt-1 text-sm text-white/70">رضا العملاء</p>
                <div className="mt-4 flex items-center gap-1 text-amber-400">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <div className="mt-6 flex items-center gap-2 text-sm text-white/70">
                  <TrendingUp className="h-4 w-4" />
                  +12% هذا الربع
                </div>
              </div>
            </div>
          </Section>

          {/* ==================== 8. Badges ==================== */}
          <Section id="badges" icon={Tag} title="الشارات" en="Badges">
            <div
              className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-8 ring-1 ring-gray-100"
              style={{ boxShadow: 'var(--ds-shadow-sm)' }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-primary)] px-3 py-1 text-xs font-bold text-white">
                <Sparkles className="h-3.5 w-3.5" />
                أساسي
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-accent)] px-3 py-1 text-xs font-bold text-white">
                <Star className="h-3.5 w-3.5" />
                برونزي
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                <Check className="h-3.5 w-3.5" />
                نجاح
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                <TriangleAlert className="h-3.5 w-3.5" />
                تنبيه
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-glint)] px-3 py-1 text-xs font-bold text-[var(--ds-sky)]">
                <Info className="h-3.5 w-3.5" />
                معلومات
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--ds-primary)] bg-white px-3 py-1 text-xs font-bold text-[var(--ds-primary)]">
                مخطط
              </span>
            </div>
          </Section>

          {/* ==================== 9. Alerts ==================== */}
          <Section id="alerts" icon={Bell} title="التنبيهات" en="Alerts">
            <div className="grid gap-4 lg:grid-cols-2">
              {ALERTS.map((a) => (
                <div
                  key={a.title}
                  className={`flex items-start gap-3 rounded-2xl border-2 p-5 ${a.wrap}`}
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

          {/* ==================== 10. CTA band ==================== */}
          <Section id="cta" icon={Megaphone} title="شريط الدعوة" en="CTA Band">
            <div
              className="ds-gradient relative overflow-hidden rounded-2xl px-8 py-14 text-center text-white"
              style={{ boxShadow: 'var(--ds-shadow-lg)' }}
            >
              <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white/10" />
              <div className="pointer-events-none absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-white/10" />
              <h2 className="relative text-3xl font-extrabold">
                جرّب SMART ERP مجاناً — 14 يوم
              </h2>
              <p className="relative mt-3 text-white/85">
                ابدأ رحلتك نحو إدارة ذكية لمؤسستك دون أي التزام.
              </p>
              <button className="relative mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-8 py-3.5 text-base font-extrabold text-[var(--ds-primary)] transition hover:bg-[var(--ds-glint)]">
                ابدأ التجربة المجانية
                <ArrowLeft className="h-5 w-5" />
              </button>
            </div>
          </Section>

          {/* ==================== 11. Usage notes ==================== */}
          <Section
            id="usage"
            icon={Shield}
            title="قواعد الاستخدام"
            en="Do & Don't"
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-2xl border-2 border-emerald-100 bg-emerald-50/50 p-8">
                <h3 className="mb-5 flex items-center gap-2 text-lg font-extrabold text-emerald-800">
                  <CircleCheckBig className="h-5 w-5" />
                  افعل
                </h3>
                <ul className="space-y-3">
                  {DOS.map((d) => (
                    <li
                      key={d}
                      className="flex items-start gap-2 text-sm text-emerald-900"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border-2 border-red-100 bg-red-50/50 p-8">
                <h3 className="mb-5 flex items-center gap-2 text-lg font-extrabold text-red-800">
                  <CircleX className="h-5 w-5" />
                  لا تفعل
                </h3>
                <ul className="space-y-3">
                  {DONTS.map((d) => (
                    <li
                      key={d}
                      className="flex items-start gap-2 text-sm text-red-900"
                    >
                      <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>
        </main>

        {/* ==================== Footer ==================== */}
        <footer className="border-t border-gray-200 bg-white py-8">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 text-center">
            <div className="flex items-center gap-2 text-sm text-[var(--ds-text-muted)]">
              <Users className="h-4 w-4" />
              <span>
                مستخرج من تحليل اللوجو — راجع{' '}
                <span className="font-en">Excalidraw board</span>
              </span>
            </div>
            <p className="font-en text-xs text-[var(--ds-text-muted)]">
              SMART ERP Design System · v1.0
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
