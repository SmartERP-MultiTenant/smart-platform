import type { ErpPackage } from '@/lib/erp';

/**
 * Pricing page URL advertised inside each `Offer`.
 * Kept identical to the value previously inlined in pages/pricing.tsx.
 */
export const PRICING_PAGE_URL = 'https://platform.smartapro.com/pricing';

const PRICING_DESCRIPTION =
  'باقات واشتراكات نظام SMART PLATFORM المحاسبي والإداري السحابي للشركات والمؤسسات.';

/**
 * A price is only "real" when the ERP actually sent a finite number.
 * `typeof` + `Number.isFinite` deliberately replaces the previous `|| 0`
 * coercion, which published a fabricated price of `0` (i.e. "free") for any
 * package whose optional `priceMonthly` was missing, and which also silently
 * discarded a legitimate price of `0`.
 */
const isRealPrice = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Builds the `/pricing` JSON-LD document.
 *
 * Truthfulness contract (see `__tests__/lib/pricingJsonLd.spec.ts`):
 * - an `Offer` is emitted only for a package with a finite `priceMonthly`;
 * - a package without a derivable price is omitted, never priced as `0`;
 * - `offerCount` is emitted only alongside `offers`, and always equals the
 *   number of offers actually emitted;
 * - when no offer can be emitted, both `offers` and `offerCount` (and the
 *   underivable `lowPrice`/`highPrice`) are omitted rather than sent empty or
 *   invented.
 */
export function buildPricingJsonLd(
  packages: ErpPackage[]
): Record<string, unknown> {
  const priced = packages
    .map((pkg) => ({ pkg, price: pkg.priceMonthly }))
    .filter((entry): entry is { pkg: ErpPackage; price: number } =>
      isRealPrice(entry.price)
    );

  const offers = priced.map(({ pkg, price }) => ({
    '@type': 'Offer',
    name: pkg.name,
    description: pkg.description || undefined,
    price: String(price),
    priceCurrency: 'SAR',
    availability: 'https://schema.org/InStock',
    url: PRICING_PAGE_URL,
  }));

  const prices = priced.map(({ price }) => price);

  const offersJsonLd: Record<string, unknown> = {
    '@type': 'AggregateOffer',
    priceCurrency: 'SAR',
    ...(offers.length > 0
      ? {
          offerCount: String(offers.length),
          lowPrice: String(Math.min(...prices)),
          highPrice: String(Math.max(...prices)),
          offers,
        }
      : {}),
  };

  return {
    '@context': 'https://schema.org',
    // P4.10: `Product`, not `SoftwareApplication`.
    //
    // The ticket asks for `Product` on `/pricing` and the close-out review
    // flagged the mismatch as a deviation to reconcile. `Product` is the right
    // model for THIS document: the page is a catalogue of purchasable plans
    // with prices, and `Product` + `AggregateOffer` is the canonical schema for
    // "one thing, several priced offers", which is exactly what the ERP package
    // list is. `SoftwareApplication` describes an application listing (its
    // vocabulary is `operatingSystem` / `applicationCategory` / `downloadUrl`)
    // rather than a set of priced subscription plans.
    //
    // Note `Product` is NOT a supertype of `SoftwareApplication`, so the two
    // SoftwareApplication-only properties that used to sit here
    // (`applicationCategory`, `operatingSystem`) are REMOVED rather than kept —
    // carrying them under `Product` would emit properties outside the type's
    // vocabulary and defeat the point of the schema.org validator run the ticket
    // asks for.
    '@type': 'Product',
    name: 'SMART PLATFORM ERP Plans',
    description: PRICING_DESCRIPTION,
    offers: offersJsonLd,
  };
}
