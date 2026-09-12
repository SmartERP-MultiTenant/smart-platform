import { buildRenewalUrl, formatArabicGregorianDate } from '@/lib/email/utils';

describe('buildRenewalUrl', () => {
  const appUrl = 'https://app.example.com';

  it('defaults to the unprefixed (Arabic) URL when no locale is given', () => {
    expect(buildRenewalUrl(appUrl, 'acme')).toBe(
      'https://app.example.com/teams/acme/erp'
    );
  });

  it('keeps the Arabic locale unprefixed (repo locale convention)', () => {
    expect(buildRenewalUrl(appUrl, 'acme', 'ar')).toBe(
      'https://app.example.com/teams/acme/erp'
    );
  });

  it('prefixes the English locale with /en', () => {
    expect(buildRenewalUrl(appUrl, 'acme', 'en')).toBe(
      'https://app.example.com/en/teams/acme/erp'
    );
  });

  it('encodes the team slug', () => {
    expect(buildRenewalUrl(appUrl, 'acme corp & co', 'en')).toBe(
      'https://app.example.com/en/teams/acme%20corp%20%26%20co/erp'
    );
  });

  it('normalizes a trailing slash on the app URL', () => {
    expect(buildRenewalUrl('https://app.example.com/', 'acme')).toBe(
      'https://app.example.com/teams/acme/erp'
    );
  });
});

describe('formatArabicGregorianDate', () => {
  it('renders a Gregorian Arabic date (ar-SA would fall back to Hijri)', () => {
    const formatted = formatArabicGregorianDate('2026-09-14T00:00:00.000Z');

    // Gregorian year 2026 — a Hijri (Umm al-Qura) rendering would be ١٤٤٨.
    expect(formatted).toMatch(/٢٠٢٦/);
    expect(formatted).not.toMatch(/١٤٤٨/);
    // Arabic (Egypt) month name for September on the Gregorian calendar.
    expect(formatted).toMatch(/سبتمبر/);
    // Arabic-Indic digits (٢٠٢٦ etc.) are used by the ar-EG locale.
    expect(formatted).toMatch(/[٠-٩]/);
  });

  it('accepts Date instances', () => {
    const formatted = formatArabicGregorianDate(
      new Date('2026-01-01T00:00:00.000Z')
    );

    expect(formatted).toMatch(/٢٠٢٦/);
    expect(formatted).toMatch(/يناير/);
  });

  it('renders a date only (no time component)', () => {
    const formatted = formatArabicGregorianDate('2026-09-14T23:59:59.000Z');
    expect(formatted).not.toMatch(/:/);
    expect(formatted).toMatch(/سبتمبر/);
  });
});
