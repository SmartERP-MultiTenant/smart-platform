import { useTranslation } from 'next-i18next';

interface PaymentReceiptProps {
  /**
   * The order reference minted by the funnel. This is the ONE field the
   * callback URL actually carries, so it is always present.
   */
  orderReference: string;
  /**
   * Package name, resolved from the order's recorded `packageId` against the
   * public catalogue. `null`/absent when it could not be resolved — the row is
   * then omitted entirely rather than shown empty.
   */
  packageName?: string | null;
  /**
   * The package's monthly price. Also omitted when unresolved: a receipt that
   * shows a placeholder for the amount is worse than one that shows no amount
   * at all, because a placeholder reads as a value.
   */
  amountMonthly?: number | null;
  /**
   * Whether to render the merchant tax identity. Off for a failed payment,
   * where a tax block would read as an invoice for money that never moved.
   */
  showTaxInformation?: boolean;
}

/**
 * The order summary shown under the payment-result panel (PG-23).
 *
 * Deliberately dumb and total: it renders whatever it is given and cannot
 * invent a field. Every value it displays comes from a verified source —
 * the order reference from the callback URL, and the package/price from the
 * public ERP catalogue via the funnel's recorded `packageId`. Anything that
 * could not be resolved is *omitted*, never stubbed, so the receipt can never
 * imply a value nobody confirmed.
 *
 * Structure is a real `<dl>`: a receipt is a list of label/value pairs, and
 * assistive technology announces it as such instead of reading a grid of
 * anonymous divs.
 */
const PaymentReceipt = ({
  orderReference,
  packageName = null,
  amountMonthly = null,
  showTaxInformation = true,
}: PaymentReceiptProps) => {
  const { t } = useTranslation('common');

  const hasPackage = Boolean(packageName && packageName.trim() !== '');
  const hasAmount = typeof amountMonthly === 'number' && amountMonthly > 0;

  return (
    <section
      aria-labelledby="payment-receipt-title"
      className="mx-auto mt-6 max-w-md rounded-xl border bg-white p-6 text-start shadow-sm"
    >
      <h3
        id="payment-receipt-title"
        className="text-sm font-bold text-gray-900"
      >
        {t('erp-payment-receipt-title')}
      </h3>

      <dl className="mt-3 divide-y divide-gray-100 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
          <dt className="text-gray-500">{t('erp-payment-receipt-order')}</dt>
          {/* Latin reference inside an RTL page: pinned LTR so it never
              reorders, and allowed to wrap so a long reference cannot overflow
              the card on a 375px screen. */}
          <dd
            dir="ltr"
            className="break-all font-medium text-gray-900"
            data-testid="receipt-order-reference"
          >
            {orderReference}
          </dd>
        </div>

        {hasPackage && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
            <dt className="text-gray-500">
              {t('erp-payment-receipt-package')}
            </dt>
            <dd className="font-medium text-gray-900">{packageName}</dd>
          </div>
        )}

        {hasAmount && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
            <dt className="text-gray-500">{t('erp-payment-receipt-amount')}</dt>
            <dd dir="ltr" className="font-medium text-gray-900">
              {`${amountMonthly} ${t('erp-pricing-sar-monthly')}`}
            </dd>
          </div>
        )}
      </dl>

      {showTaxInformation && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          {/* Merchant identity, phrased exactly as /terms does so the two
              surfaces cannot drift apart. */}
          <p className="text-xs font-medium text-gray-600">
            {t('erp-payment-receipt-tax')}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {t('erp-payment-receipt-vat-note')}
          </p>
        </div>
      )}
    </section>
  );
};

export default PaymentReceipt;
