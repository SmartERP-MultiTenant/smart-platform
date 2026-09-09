import { formatArabicGregorianDate } from '@/lib/email/utils';

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
