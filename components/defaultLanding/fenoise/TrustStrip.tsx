import { useTranslation } from 'next-i18next';

const PAYMENT_BRANDS = [
  'Mastercard',
  'Visa',
  'mada',
  'Samsung Pay',
  'Apple Pay',
  'stc pay',
  'tabby',
  'tamara',
];

export default function TrustStrip() {
  const { t } = useTranslation('common');

  return (
    <div className="mt-8 flex flex-col items-center justify-between gap-4 lg:flex-row">
      {/* Payment gateways (brand names render LTR) */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
        <span className="text-[13px] text-gray-500">
          {t('landing-truststrip-gateways')}
        </span>
        <div
          className="flex flex-wrap items-center justify-center gap-2"
          dir="ltr"
        >
          {PAYMENT_BRANDS.map((brand) => (
            <span
              key={brand}
              className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[12px] font-medium text-gray-700"
            >
              {brand}
            </span>
          ))}
        </div>
      </div>

      {/* Tax + contact */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[12px] font-medium text-gray-700">
          {t('landing-truststrip-tax')}
        </span>
        <a
          href="https://wa.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-[12px] font-medium text-green-700 transition hover:bg-green-100"
        >
          {t('landing-truststrip-whatsapp')}
        </a>
      </div>
    </div>
  );
}
