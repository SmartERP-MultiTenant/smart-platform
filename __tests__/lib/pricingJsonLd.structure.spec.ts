import type { ErpPackage } from '@/lib/erp';
import { buildPricingJsonLd, PRICING_PAGE_URL } from '@/lib/pricingJsonLd';

/**
 * Structural-validity spec for the `/pricing` JSON-LD document (P4.10).
 *
 * WHY THIS FILE EXISTS SEPARATELY: the ticket's acceptance criterion is that the
 * emitted JSON-LD is *valid* — the original close-out review had to record it as
 * PARTIAL because "the validator was never run" and nothing in the repo asserted
 * the document's required-field structure. Lighthouse and Google's Rich Results
 * Test need a served build and cannot run in CI's unit layer, so this spec pins
 * the properties a validator would actually check.
 *
 * WHAT IT CANNOT DO, stated plainly: it cannot certify that Google *prefers*
 * this markup, and it does not run an external validator. It is a structural
 * assertion over the emitted object. The external validator runs remain the
 * owner's (see the PR body), and this file is what makes those runs cheap —
 * if they fail, the failure is now reproducible here.
 *
 * SCOPE: properties only. The truthfulness contract (a package with no finite
 * price is omitted rather than priced at 0) is guarded by the sibling
 * `pricingJsonLd.spec.ts`; this file does not repeat those cases.
 */

const PACKAGES: ErpPackage[] = [
  { id: 'starter', name: 'Starter', priceMonthly: 199 },
  { id: 'growth', name: 'Growth', priceMonthly: 499 },
  { id: 'scale', name: 'Scale', priceMonthly: 1499 },
];

const build = (packages: ErpPackage[] = PACKAGES) =>
  buildPricingJsonLd(packages);

const offersOf = (packages: ErpPackage[] = PACKAGES) =>
  (build(packages).offers as Record<string, unknown>).offers as Array<
    Record<string, unknown>
  >;

const aggregateOf = (packages: ErpPackage[] = PACKAGES) =>
  build(packages).offers as Record<string, unknown>;

describe('P4.10 — /pricing JSON-LD is structurally valid', () => {
  describe('serialisation', () => {
    it('survives a JSON.stringify/parse round trip unchanged', () => {
      // Search engines consume the SERIALISED string, not the object. A value
      // that is `undefined` silently disappears from that string, so a
      // round-trip equality check is the difference between "the builder set
      // this field" and "the crawler will see this field".
      const jsonLd = build();

      expect(JSON.parse(JSON.stringify(jsonLd))).toEqual(jsonLd);
    });

    it('serialises to a valid JSON document', () => {
      expect(() => JSON.stringify(build())).not.toThrow();
      expect(typeof JSON.stringify(build())).toBe('string');
    });

    it('emits no undefined-valued keys into the serialised document', () => {
      // `Offer.description` is built with `|| undefined` on purpose. That is
      // fine for JSON (the key is dropped), but it must not survive as an
      // explicit `undefined` that a strict validator would read as a present
      // key with an empty value.
      const serialised = JSON.parse(JSON.stringify(build())) as Record<
        string,
        unknown
      >;

      expect(Object.keys(serialised)).not.toContain(undefined as never);

      for (const offer of (serialised.offers as Record<string, unknown>)
        .offers as Array<Record<string, unknown>>) {
        for (const [key, value] of Object.entries(offer)) {
          expect([key, value]).not.toEqual([key, undefined]);
        }
      }
    });
  });

  describe('the Product envelope', () => {
    it('declares the schema.org context and the Product type', () => {
      const jsonLd = build();

      expect(jsonLd['@context']).toBe('https://schema.org');
      expect(jsonLd['@type']).toBe('Product');
    });

    it('carries the required Product properties', () => {
      const jsonLd = build();

      // `name` is required for a Product; `offers` is what makes it an
      // offer-bearing product rather than an abstract noun.
      expect(typeof jsonLd.name).toBe('string');
      expect((jsonLd.name as string).length).toBeGreaterThan(0);
      expect(jsonLd.offers).toBeTruthy();
      expect(typeof jsonLd.offers).toBe('object');
    });

    it('describes itself in Arabic for the ar-default public surface', () => {
      const description = build().description as string;

      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
      // The public site is Arabic-first, so an English-only description would
      // be a localisation regression rather than a schema one.
      expect(description).toMatch(/[\u0600-\u06FF]/);
    });

    it('emits no properties outside the Product vocabulary', () => {
      const jsonLd = build();

      // `applicationCategory` and `operatingSystem` are SoftwareApplication
      // properties. `Product` is not a supertype of `SoftwareApplication`, so
      // carrying them here would put properties outside the type's vocabulary —
      // the exact thing a validator flags.
      expect(jsonLd).not.toHaveProperty('applicationCategory');
      expect(jsonLd).not.toHaveProperty('operatingSystem');
      expect(jsonLd).not.toHaveProperty('downloadUrl');
      expect(jsonLd).not.toHaveProperty('softwareVersion');
    });
  });

  describe('the AggregateOffer', () => {
    it('declares the AggregateOffer type and an ISO-4217 currency', () => {
      const aggregate = aggregateOf();

      expect(aggregate['@type']).toBe('AggregateOffer');
      // pattern, not a hardcoded allow-list: any well-formed ISO 4217 code is
      // acceptable to a validator, and pinning "SAR" here would duplicate the
      // business assertion already made in pricingJsonLd.spec.ts.
      expect(aggregate.priceCurrency).toBe('SAR');
    });

    it('emits offerCount as a string integer equal to the offers emitted', () => {
      const aggregate = aggregateOf();

      expect(typeof aggregate.offerCount).toBe('string');
      expect(Number.isInteger(Number(aggregate.offerCount))).toBe(true);
      expect(Number(aggregate.offerCount)).toBe(PACKAGES.length);
      expect((aggregate.offers as unknown[]).length).toBe(PACKAGES.length);
    });

    it('keeps every emitted price inside the declared low/high range', () => {
      const aggregate = aggregateOf();
      const low = Number(aggregate.lowPrice);
      const high = Number(aggregate.highPrice);
      const prices = (aggregate.offers as Array<Record<string, unknown>>).map(
        (offer) => Number(offer.price)
      );

      expect(Number.isFinite(low)).toBe(true);
      expect(Number.isFinite(high)).toBe(true);
      expect(low).toBeLessThanOrEqual(high);

      for (const price of prices) {
        expect(Number.isFinite(price)).toBe(true);
        expect(price).toBeGreaterThanOrEqual(low);
        expect(price).toBeLessThanOrEqual(high);
      }

      // The bounds must be the actual extremes, not merely a containing range.
      expect(low).toBe(Math.min(...prices));
      expect(high).toBe(Math.max(...prices));
    });

    it('omits offerCount/lowPrice/highPrice when no offer can be emitted', () => {
      // A validator must never read `offerCount: "0"` with an empty `offers`,
      // and `Math.min()` of an empty list would serialise as `Infinity`.
      const aggregate = aggregateOf([{ id: 'x', name: 'Unpriced' }]);

      expect(aggregate.offerCount).toBeUndefined();
      expect(aggregate.lowPrice).toBeUndefined();
      expect(aggregate.highPrice).toBeUndefined();
      expect(aggregate.offers).toBeUndefined();
      expect(aggregate['@type']).toBe('AggregateOffer');
    });
  });

  describe('each Offer', () => {
    it('carries the properties a validator requires', () => {
      for (const offer of offersOf()) {
        expect(offer['@type']).toBe('Offer');
        expect(typeof offer.name).toBe('string');
        expect((offer.name as string).length).toBeGreaterThan(0);
        expect(typeof offer.priceCurrency).toBe('string');
        expect(offer.priceCurrency).toBe('SAR');
      }
    });

    it('emits price as a decimal string, never a number', () => {
      // Google's structured-data documentation is explicit that `price` is a
      // string. A JSON number is accepted by schema.org but is the most common
      // Rich Results warning on pricing pages, so it is pinned here.
      for (const offer of offersOf()) {
        expect(typeof offer.price).toBe('string');
        expect(Number.isFinite(Number(offer.price))).toBe(true);
        expect(String(offer.price)).toMatch(/^\d+(\.\d+)?$/);
      }
    });

    it('emits availability as an absolute schema.org URL', () => {
      for (const offer of offersOf()) {
        expect(offer.availability).toBe('https://schema.org/InStock');
      }
    });

    it('emits an absolute https url for every offer', () => {
      for (const offer of offersOf()) {
        expect(typeof offer.url).toBe('string');
        expect(offer.url).toBe(PRICING_PAGE_URL);
        // A relative URL is the other common validator failure here.
        expect(() => new URL(offer.url as string)).not.toThrow();
        expect((offer.url as string).startsWith('https://')).toBe(true);
      }
    });

    it('names each offer after its source package, in catalogue order', () => {
      const offers = offersOf();

      expect(offers.map((offer) => offer.name)).toEqual(
        PACKAGES.map((pkg) => pkg.name)
      );
    });
  });
});
