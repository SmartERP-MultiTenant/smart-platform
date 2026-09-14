import {
  FALLBACK_PAYMENT_BRANDS,
  resolveTrustStripBrands,
  type TrustStripBrand,
} from '@/lib/paymentBrands';

const method = (
  key: string,
  label: string,
  available: boolean,
  iconUrl?: string
) => ({
  key,
  label,
  available,
  ...(iconUrl ? { iconUrl } : {}),
});

const labels = (brands: TrustStripBrand[]) => brands.map((b) => b.label);

describe('Lib - paymentBrands (trust strip gateway marks, P2.15 + PG-22)', () => {
  describe('the fallback set', () => {
    it('never advertises Samsung Pay (P2.10 closed / PG-45)', () => {
      expect(FALLBACK_PAYMENT_BRANDS).not.toContain('Samsung Pay');
      expect(FALLBACK_PAYMENT_BRANDS.join(' ').toLowerCase()).not.toContain(
        'samsung'
      );
    });

    it('is non-empty and free of duplicates', () => {
      expect(FALLBACK_PAYMENT_BRANDS.length).toBeGreaterThan(0);
      expect(new Set(FALLBACK_PAYMENT_BRANDS).size).toBe(
        FALLBACK_PAYMENT_BRANDS.length
      );
    });

    it('renders every fallback mark with a unique, stable React key', () => {
      const { brands } = resolveTrustStripBrands(undefined);

      expect(labels(brands)).toEqual([...FALLBACK_PAYMENT_BRANDS]);
      expect(new Set(brands.map((b) => b.key)).size).toBe(brands.length);
    });
  });

  describe('an unreadable catalogue degrades to the fallback set', () => {
    it.each([
      ['undefined (still loading, or the request failed)', undefined],
      ['null', null],
      ['a string body', 'nope'],
      ['a number body', 42],
      ['an object with no `data`', {}],
      ['`data: null`', { data: null }],
      ['`data: {}`', { data: {} }],
      ['`data` as a string', { data: 'nope' }],
      ['an empty array', []],
      ['an empty `data` array', { data: [] }],
    ])('%s -> fallback', (_name, payload) => {
      const result = resolveTrustStripBrands(payload);

      expect(result.source).toBe('fallback');
      expect(labels(result.brands)).toEqual([...FALLBACK_PAYMENT_BRANDS]);
    });

    it.each([
      ['a string row', ['POS']],
      ['a number row', [7]],
      ['a null row', [null]],
      ['a row with no label', [{ key: 'visa' }]],
      ['a row with a blank label', [{ key: 'visa', label: '   ' }]],
      ['a row with a non-string label', [{ key: 'visa', label: 12 }]],
    ])('a catalogue whose every row is malformed (%s) -> fallback', (_n, p) => {
      expect(resolveTrustStripBrands(p).source).toBe('fallback');
    });

    it('treats an empty catalogue as unreadable, not as "no gateways"', () => {
      // The ERP contract always returns its method list, so an empty list means
      // a degenerate upstream rather than "we accept no payment at all" — the
      // strip must keep its shape instead of silently emptying out.
      expect(resolveTrustStripBrands({ data: [] }).source).toBe('fallback');
    });
  });

  describe('a readable catalogue is authoritative (PG-22)', () => {
    it('renders only the methods the ERP marks available', () => {
      const result = resolveTrustStripBrands({
        data: [
          method('card', 'Visa', true),
          method('tabby', 'tabby', false),
          method('mada', 'mada', true),
        ],
      });

      expect(result.source).toBe('erp');
      expect(labels(result.brands)).toEqual(['Visa', 'mada']);
    });

    it('never advertises an unavailable method', () => {
      const result = resolveTrustStripBrands({
        data: [
          method('card', 'Visa', false),
          method('tabby', 'tabby', false),
          method('tamara', 'tamara', false),
        ],
      });

      expect(result.source).toBe('none');
      expect(result.brands).toEqual([]);
    });

    it('reads `available` fail-closed: only the literal true proves availability', () => {
      const result = resolveTrustStripBrands({
        data: [
          { key: 'a', label: 'Absent' },
          { key: 'b', label: 'Null', available: null },
          { key: 'c', label: 'Stringy', available: 'true' },
          { key: 'd', label: 'Truthy number', available: 1 },
          { key: 'e', label: 'Real', available: true },
        ],
      });

      expect(result.source).toBe('erp');
      expect(labels(result.brands)).toEqual(['Real']);
    });

    it('accepts a bare array as well as the `{ data }` envelope', () => {
      const result = resolveTrustStripBrands([
        method('card', 'Visa', true),
        method('tabby', 'tabby', false),
      ]);

      expect(result.source).toBe('erp');
      expect(labels(result.brands)).toEqual(['Visa']);
    });

    it('keeps the ERP ordering so the strip matches the payment step', () => {
      const result = resolveTrustStripBrands({
        data: [
          method('mada', 'mada', true),
          method('card', 'Mastercard', true),
          method('visa', 'Visa', true),
        ],
      });

      expect(labels(result.brands)).toEqual(['mada', 'Mastercard', 'Visa']);
    });

    it('drops a malformed row but keeps the readable ones', () => {
      const result = resolveTrustStripBrands({
        data: [
          'garbage',
          method('card', 'Visa', true),
          { label: 42 },
          method('mada', 'mada', true),
        ],
      });

      expect(result.source).toBe('erp');
      expect(labels(result.brands)).toEqual(['Visa', 'mada']);
    });
  });

  describe('label normalisation', () => {
    it('trims labels', () => {
      const result = resolveTrustStripBrands({
        data: [method('card', '  Visa  ', true)],
      });

      expect(labels(result.brands)).toEqual(['Visa']);
    });

    it('caps the label length so one row cannot stretch a chip', () => {
      const atLimit = 'x'.repeat(64);
      const overLimit = 'x'.repeat(65);

      const result = resolveTrustStripBrands({
        data: [
          method('ok', atLimit, true),
          method('too-long', overLimit, true),
        ],
      });

      expect(labels(result.brands)).toEqual([atLimit]);
    });

    it('collapses case-insensitively duplicated labels', () => {
      const result = resolveTrustStripBrands({
        data: [
          method('a', 'Visa', true),
          method('b', 'visa', true),
          method('c', 'VISA', true),
        ],
      });

      expect(labels(result.brands)).toEqual(['Visa']);
    });
  });

  describe('React keys', () => {
    it('uses the ERP key when present', () => {
      const { brands } = resolveTrustStripBrands({
        data: [method('mada', 'mada', true)],
      });

      expect(brands[0].key).toBe('mada');
    });

    it('falls back to the label when the key is missing or blank', () => {
      const { brands } = resolveTrustStripBrands({
        data: [
          { label: 'Visa', available: true },
          { key: '   ', label: 'mada', available: true },
        ],
      });

      expect(brands.map((b) => b.key)).toEqual(['Visa', 'mada']);
    });
  });

  describe('iconUrl is validated', () => {
    it('keeps an https icon URL', () => {
      const { brands } = resolveTrustStripBrands({
        data: [
          method('card', 'Visa', true, 'https://cdn.example.com/visa.svg'),
        ],
      });

      expect(brands[0].iconUrl).toBe('https://cdn.example.com/visa.svg');
    });

    it.each([
      ['http', 'http://cdn.example.com/visa.svg'],
      ['a data: URL', 'data:image/svg+xml,<svg onload="alert(1)"/>'],
      ['a javascript: URL', 'javascript:alert(1)'],
      ['a relative path', '/icons/visa.svg'],
      ['an empty string', '   '],
      ['not a URL at all', 'visa.svg'],
    ])('drops %s but still renders the label', (_name, iconUrl) => {
      const { source, brands } = resolveTrustStripBrands({
        data: [method('card', 'Visa', true, iconUrl)],
      });

      expect(source).toBe('erp');
      expect(labels(brands)).toEqual(['Visa']);
      expect(brands[0].iconUrl).toBeUndefined();
    });

    it('ignores a non-string iconUrl', () => {
      const { brands } = resolveTrustStripBrands({
        data: [{ key: 'card', label: 'Visa', available: true, iconUrl: 99 }],
      });

      expect(brands[0].iconUrl).toBeUndefined();
    });
  });

  describe('purity', () => {
    it('does not mutate the caller payload', () => {
      const payload = {
        data: [
          method('card', '  Visa  ', true, 'https://cdn.example.com/v.svg'),
        ],
      };
      const snapshot = JSON.parse(JSON.stringify(payload));

      resolveTrustStripBrands(payload);

      expect(payload).toEqual(snapshot);
    });

    it('never returns undefined or a nullish brand list', () => {
      for (const payload of [undefined, null, {}, [], 'x', { data: [null] }]) {
        const result = resolveTrustStripBrands(payload);
        expect(Array.isArray(result.brands)).toBe(true);
        expect(['erp', 'fallback', 'none']).toContain(result.source);
      }
    });
  });
});
