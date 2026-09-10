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

const storeBadges = [
  {
    key: 'app-store',
    url: appStoreUrl,
    icon: <Apple className="h-6 w-6" />,
    eyebrow: 'Download on the',
    name: 'App Store',
  },
  {
    key: 'play-store',
    url: playStoreUrl,
    icon: <Play className="h-5 w-5" />,
    eyebrow: 'GET IT ON',
    name: 'Google Play',
  },
];

const storeBadgeClassName =
  'flex items-center gap-3 rounded-xl bg-[#111827] px-5 py-3 text-white transition';

export default function MobileSection() {
  const { t } = useTranslation('marketing');

  return (
    <section className="border-y border-gray-100 bg-[var(--ds-surface-alt)] py-20">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        {/* Phone mockup */}
        <div className="mx-auto w-full max-w-[360px]">
          <div className="rounded-[2.5rem] border-[10px] border-[#1f2937] bg-white shadow-[var(--ds-shadow-xl)]">
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
          <h2 className="mt-4 text-4xl font-extrabold leading-tight text-[#111827]">
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
                  title="Coming soon"
                  className={`${storeBadgeClassName} cursor-not-allowed opacity-60`}
                >
                  {badgeContent}
                  <span className="sr-only">Coming soon</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
