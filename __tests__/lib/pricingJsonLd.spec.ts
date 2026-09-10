import type { ErpPackage } from '@/lib/erp';
import { buildPricingJsonLd, PRICING_PAGE_URL } from '@/lib/pricingJsonLd';

type JsonLd = Record<string, unknown>;
type Offer = Record<string, unknown>;

const aggregateOfferOf = (packages: ErpPackage[]): JsonLd =>
  buildPricingJsonLd(packages).offers as JsonLd;

const emittedOffersOf = (packages: ErpPackage[]): Offer[] =>
  (aggregateOfferOf(packages).offers as Offer[] | undefined) ?? [];

describe('Lib - pricingJsonLd', () => {
  describe('empty / unavailable package list', () => {
    it('emits neither offers nor offerCount (never a fabricated count)', () => {
      const offer = aggregateOfferOf([]);

      expect(offer.offerCount).toBeUndefined();
      expect(offer.offers).toBeUndefined();
      expect(offer).not.toHaveProperty('offers', []);
    });

    it('never advertises more offers than it lists', () => {
      const offer = aggregateOfferOf([]);
      const count = offer.offerCount;
      const listed = emittedOffersOf([]).length;

      if (count !== undefined) {
        expect(Number(count)).toBe(listed);
      }

      // The contradiction the bug produced: offerCount "3" with offers [].
      expect(count === undefined || Number(count) === listed).toBe(true);
    });
  });

  describe('packages without a derivable price', () => {
    it('omits the offer entirely instead of publishing a fabricated price of 0', () => {
      const packages: ErpPackage[] = [{ id: 'a', name: 'Unpriced Plan' }];

      expect(emittedOffersOf(packages)).toHaveLength(0);
      expect(aggregateOfferOf(packages).offerCount).toBeUndefined();
      expect(aggregateOfferOf(packages).offers).toBeUndefined();
    });

    it('drops only the unpriced package and fabricates no 0 among mixed prices', () => {
      const packages: ErpPackage[] = [
        { id: 'a', name: 'Priced Plan', priceMonthly: 199 },
        { id: 'b', name: 'Unpriced Plan' },
      ];

      const offers = emittedOffersOf(packages);

      expect(offers).toHaveLength(1);
      expect(offers[0].name).toBe('Priced Plan');
      expect(offers.some((o) => o.price === '0')).toBe(false);
    });

    it('omits offers priced as non-finite numbers', () => {
      const packages: ErpPackage[] = [
        { id: 'a', name: 'NaN Plan', priceMonthly: Number.NaN },
        {
          id: 'b',
          name: 'Infinity Plan',
          priceMonthly: Number.POSITIVE_INFINITY,
        },
        { id: 'c', name: 'Real Plan', priceMonthly: 149 },
      ];

      const offers = emittedOffersOf(packages);

      expect(offers).toHaveLength(1);
      expect(offers[0].name).toBe('Real Plan');
      expect(aggregateOfferOf(packages).offerCount).toBe('1');
    });
  });

  describe('mixed list: truthful count and real min/max', () => {
    it('sets offerCount to the number of offers actually emitted', () => {
      const packages: ErpPackage[] = [
        { id: 'a', name: 'Basic', priceMonthly: 99 },
        { id: 'b', name: 'Pro', priceMonthly: 499 },
        { id: 'c', name: 'Legacy' },
      ];

      const offer = aggregateOfferOf(packages);

      expect(emittedOffersOf(packages)).toHaveLength(2);
      expect(offer.offerCount).toBe('2');
    });

    it('computes lowPrice/highPrice from the emitted prices only', () => {
      const packages: ErpPackage[] = [
        { id: 'a', name: 'Basic', priceMonthly: 99 },
        { id: 'b', name: 'Pro', priceMonthly: 499 },
        { id: 'c', name: 'Mid', priceMonthly: 249 },
      ];

      const offer = aggregateOfferOf(packages);

      expect(offer.lowPrice).toBe('99');
      expect(offer.highPrice).toBe('499');
    });

    it('ignores unpriced packages when computing lowPrice/highPrice', () => {
      const packages: ErpPackage[] = [
        { id: 'a', name: 'Basic', priceMonthly: 250 },
        { id: 'b', name: 'Unpriced' },
        { id: 'c', name: 'Pro', priceMonthly: 400 },
      ];

      const offer = aggregateOfferOf(packages);

      expect(offer.lowPrice).toBe('250');
      expect(offer.highPrice).toBe('400');
      expect(offer.offerCount).toBe('2');
    });
  });

  describe('a legitimate price of 0 is real data and is preserved', () => {
    it('keeps a genuine 0 price instead of coercing it away', () => {
      const packages: ErpPackage[] = [
        { id: 'free', name: 'Free Tier', priceMonthly: 0 },
      ];

      const offer = aggregateOfferOf(packages);
      const offers = emittedOffersOf(packages);

      expect(offers).toHaveLength(1);
      expect(offers[0].price).toBe('0');
      expect(offer.offerCount).toBe('1');
      expect(offer.lowPrice).toBe('0');
      expect(offer.highPrice).toBe('0');
    });

    it('treats 0 as a valid low bound in a mixed list', () => {
      const packages: ErpPackage[] = [
        { id: 'free', name: 'Free Tier', priceMonthly: 0 },
        { id: 'pro', name: 'Pro', priceMonthly: 500 },
      ];

      const offer = aggregateOfferOf(packages);

      expect(offer.lowPrice).toBe('0');
      expect(offer.highPrice).toBe('500');
      expect(offer.offerCount).toBe('2');
    });
  });

  describe('fully priced list', () => {
    it('sets offerCount to packages.length when every package is priced', () => {
      const packages: ErpPackage[] = [
        { id: 'a', name: 'Starter', priceMonthly: 99 },
        { id: 'b', name: 'Growth', priceMonthly: 299 },
        { id: 'c', name: 'Enterprise', priceMonthly: 999 },
      ];

      const offer = aggregateOfferOf(packages);

      expect(offer.offerCount).toBe(String(packages.length));
      expect(emittedOffersOf(packages)).toHaveLength(packages.length);
    });

    it('maps every emitted offer to the expected shape', () => {
      const packages: ErpPackage[] = [
        {
          id: 'a',
          name: 'Starter',
          description: 'Starter plan',
          priceMonthly: 99,
        },
      ];

      const offers = emittedOffersOf(packages);

      expect(offers[0]).toEqual({
        '@type': 'Offer',
        name: 'Starter',
        description: 'Starter plan',
        price: '99',
        priceCurrency: 'SAR',
        availability: 'https://schema.org/InStock',
        url: PRICING_PAGE_URL,
      });
    });

    it('preserves an absent description as undefined', () => {
      const offers = emittedOffersOf([
        { id: 'a', name: 'No Desc', priceMonthly: 99 },
      ]);

      expect(offers[0].description).toBeUndefined();
    });
  });

  describe('unchanged surrounding JSON-LD properties', () => {
    it('keeps the SoftwareApplication envelope intact', () => {
      const jsonLd = buildPricingJsonLd([]);

      expect(jsonLd['@context']).toBe('https://schema.org');
      expect(jsonLd['@type']).toBe('SoftwareApplication');
      expect(jsonLd.name).toBe('SMART PLATFORM ERP Plans');
      expect(jsonLd.applicationCategory).toBe('BusinessApplication');
      expect(jsonLd.operatingSystem).toBe('Web');
      expect(typeof jsonLd.description).toBe('string');
      expect(jsonLd.description).toContain('SMART PLATFORM');
    });

    it('keeps the AggregateOffer type and currency', () => {
      const offer = aggregateOfferOf([]);

      expect(offer['@type']).toBe('AggregateOffer');
      expect(offer.priceCurrency).toBe('SAR');
    });
  });
});
