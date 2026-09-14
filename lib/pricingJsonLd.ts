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
 *
 * `packages` is typed `unknown` on purpose (P4.10b). This function is called
 * during the `/pricing` render, so any input that makes it throw takes the
 * whole page down — and the input comes from an ERP response, not from the
 * type system. It previously declared `ErpPackage[]` and called `packages.map`
 * unguarded: a 2xx body that parsed to `{}`, `null` or a string is a runtime
 * value that still satisfies no compiler check, and it produced a
 * production-visible 500 (`lib/pricingJsonLd.ts:37`). Declaring `unknown` is
 * what makes the guard below mandatory rather than decorative; callers are
 * unaffected because a typed value is always assignable to `unknown`.
 */
export function buildPricingJsonLd(packages: unknown): Record<string, unknown> {
  // A wrong-shaped body is an EMPTY catalogue for JSON-LD purposes, never a
  // crash. Emitting no `offers` is already the documented behaviour for "no
  // derivable price", so degrading here adds no new state — it only stops the
  // page from 500ing.
  const list: ErpPackage[] = Array.isArray(packages)
    ? (packages as ErpPackage[])
    : [];

  const priced = list
    .map((pkg) => ({ pkg, price: pkg?.priceMonthly }))
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
    '@type': 'SoftwareApplication',
    name: 'SMART PLATFORM ERP Plans',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: offersJsonLd,
    description: PRICING_DESCRIPTION,
  };
}
