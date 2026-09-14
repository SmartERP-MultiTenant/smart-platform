import { useTranslation } from 'next-i18next';
import { Apple, Play } from 'lucide-react';

// Store URLs are optional: the mobile apps are not published yet. When a URL is
// unset the badge renders as a non-interactive "coming soon" affordance — it
// must never fall back to an unrelated destination (the support chat) and must
// never render an anchor without an href.
// Read directly here because these keys are not yet part of `lib/env.ts`. They
// may move alongside `supportUrl` there once the mobile apps ship.
const appStoreUrl = process.env.NEXT_PUBLIC_APP_STORE_URL;
const playStoreUrl = process.env.NEXT_PUBLIC_PLAY_STORE_URL;

const storeBadgeClassName =
  'flex items-center gap-3 rounded-xl bg-[var(--ds-gray-900)] px-5 py-3 text-white transition';

export default function MobileSection() {
  const { t } = useTranslation('marketing');

  // Built inside the component (P4.20): the eyebrow copy is translated, so the
  // array needs `t` in scope. Every key is passed inline, as a string literal
  // argument to the translation function, on purpose — `check-locale.js`
  // discovers used keys by regex over literal call sites, so a key held in a
  // variable (or composed at runtime) is reported as unused and fails the gate.
  //
  // The two `name`s are BRAND names: they stay in Latin script in both locales,
  // which is what Apple's and Google's badge guidelines require and what the
  // rest of this file already does (the Arabic `landing-mobile-desc` keeps
  // "SMART PLATFORM" in Latin). They live in the locale files so every string
  // in this component is managed in one place, not to be translated.
  const storeBadges = [
    {
      key: 'app-store',
      url: appStoreUrl,
      icon: <Apple className="h-6 w-6" />,
      eyebrow: t('landing-mobile-store-appstore-eyebrow'),
      name: t('landing-mobile-store-appstore-name'),
    },
    {
      key: 'play-store',
      url: playStoreUrl,
      icon: <Play className="h-5 w-5" />,
      eyebrow: t('landing-mobile-store-playstore-eyebrow'),
      name: t('landing-mobile-store-playstore-name'),
    },
  ];

  return (
    <section className="border-y border-gray-100 bg-[var(--ds-surface-alt)] py-20">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        {/* Phone mockup */}
        <div className="mx-auto w-full max-w-[360px]">
          <div className="rounded-[2.5rem] border-[10px] border-[var(--ds-gray-800)] bg-white shadow-[var(--ds-shadow-xl)]">
            <div className="rounded-3xl bg-gradient-to-b from-white to-[var(--ds-primary-50)] p-6">
              <div className="h-4 w-4 rounded-full border border-gray-300" />
              <div className="mt-4 h-2 w-20 rounded bg-gray-200" />
              <div className="mt-2 h-5 w-32 rounded bg-[var(--ds-primary-600)]" />
              <div className="mt-6 h-4 w-3/4 rounded bg-gray-200" />
              <div className="mt-2 h-4 w-1/2 rounded bg-gray-100" />
              <div className="mt-8 space-y-2">
                <div className="h-2 w-full rounded bg-gray-200" />
                <div className="h-2 w-5/6 rounded bg-gray-200" />
                <div className="h-2 w-4/6 rounded bg-gray-200" />
              </div>
              <div className="mt-8 h-10 rounded-xl bg-[var(--ds-primary-600)]" />
            </div>
          </div>
        </div>

        {/* Text */}
        <div>
          <span className="text-sm font-bold text-[var(--ds-primary-600)]">
            {t('landing-mobile-badge')}
          </span>
          <h2 className="mt-4 text-4xl font-extrabold leading-tight text-[var(--ds-text)]">
            {t('landing-mobile-title')}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-[var(--ds-leading-body)] text-gray-500">
            {t('landing-mobile-desc')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {storeBadges.map(({ key, url, icon, eyebrow, name }) => {
              const badgeContent = (
                <>
                  {icon}
                  <span>
                    <span className="block text-[10px] text-gray-300">
                      {eyebrow}
                    </span>
                    <span className="text-sm font-bold">{name}</span>
                  </span>
                </>
              );

              return url ? (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${storeBadgeClassName} hover:bg-gray-800`}
                >
                  {badgeContent}
                </a>
              ) : (
                // Not published yet: keep it non-interactive so the badge
                // cannot mislead users into expecting a download.
                <span
                  key={key}
                  aria-disabled="true"
                  title={t('landing-mobile-store-coming-soon')}
                  className={`${storeBadgeClassName} cursor-not-allowed opacity-60`}
                >
                  {badgeContent}
                  <span className="sr-only">
                    {t('landing-mobile-store-coming-soon')}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
