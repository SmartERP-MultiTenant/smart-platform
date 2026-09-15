import { useTranslation } from 'next-i18next';
import useSWR from 'swr';

import env from '@/lib/env';
import fetcher from '@/lib/fetcher';
import { resolveTrustStripBrands } from '@/lib/paymentBrands';

export default function TrustStrip() {
  const { t } = useTranslation('marketing');

  // The gateway marks come from the live ERP catalogue (P2.15 + PG-22) rather
  // than a hardcoded array, so the strip follows the ERP when it adds or
  // removes a method instead of silently disagreeing with the payment step.
  //
  // No `fallbackData`: while the request is in flight `data` is undefined, and
  // `resolveTrustStripBrands` answers the owner-approved fallback set for an
  // unreadable catalogue — so the server-rendered HTML already carries marks
  // and the strip upgrades in place once the catalogue arrives, with no empty
  // flash and no hydration mismatch. Focus revalidation is off because this is
  // a marketing surface, not a live view.
  const { data } = useSWR<unknown>('/api/public/erp/methods', fetcher, {
    revalidateOnFocus: false,
  });

  // `source === 'none'` means the catalogue WAS readable and reported no
  // available method — advertising anything there would be the exact defect
  // PG-22 exists to fix, so the whole gateways block (label included) is
  // omitted and the strip degrades to VAT + contact.
  const { source, brands } = resolveTrustStripBrands(data);

  return (
    <div className="mt-8 flex flex-col items-center justify-between gap-4 lg:flex-row">
      {/* Payment gateways (brand names render LTR) */}
      {source !== 'none' && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
          <span className="text-[13px] text-gray-500">
            {t('landing-truststrip-gateways')}
          </span>
          <div
            className="flex flex-wrap items-center justify-center gap-2"
            dir="ltr"
          >
            {brands.map((brand) => (
              <span
                key={brand.key}
                className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[12px] font-medium text-gray-700"
              >
                {brand.iconUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element -- Icon URL is supplied at runtime by the ERP, so `next/image` would need that host allow-listed in `images.remotePatterns` (next.config.js). The icon is decorative (alt="") and the CSP `img-src` directive bounds which hosts can load. */
                  <img
                    src={brand.iconUrl}
                    alt=""
                    width={18}
                    height={18}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="h-[18px] w-[18px] shrink-0 object-contain"
                  />
                )}
                {brand.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tax + contact */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[12px] font-medium text-gray-700">
          {t('landing-truststrip-tax')}
        </span>
        {/* The pill is a WhatsApp affordance — only render it when an approved
            support link is configured, otherwise it would be a dead link. */}
        {env.supportUrl && (
          <a
            href={env.supportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-[12px] font-medium text-green-700 transition hover:bg-green-100"
          >
            {t('landing-truststrip-whatsapp')}
          </a>
        )}
      </div>
    </div>
  );
}
