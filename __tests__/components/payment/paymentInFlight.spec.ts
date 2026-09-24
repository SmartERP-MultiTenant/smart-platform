/**
 * @jest-environment jsdom
 *
 * PG-24 — the in-flight payment marker. The callback page trusts this record
 * enough to link a customer back into the verification loop, so every way it
 * can be wrong (absent, unparseable, wrong shape, stale, clock-skewed, storage
 * blocked) has to degrade to "no marker" rather than to a bad link or a throw.
 */
import {
  PAYMENT_IN_FLIGHT_KEY,
  PAYMENT_IN_FLIGHT_MAX_AGE_MS,
  clearPaymentInFlight,
  readPaymentInFlight,
  savePaymentInFlight,
} from '@/components/payment/paymentInFlight';

const NOW = Date.parse('2026-09-14T12:00:00.000Z');

const record = (overrides: Record<string, unknown> = {}) => ({
  orderReference: 'pay-abc12345-1757851200000',
  packageId: 'pkg-growth',
  methodKey: 'card',
  startedAt: new Date(NOW - 60_000).toISOString(),
  ...overrides,
});

const store = (value: unknown) =>
  window.sessionStorage.setItem(PAYMENT_IN_FLIGHT_KEY, JSON.stringify(value));

const storeRaw = (value: string) =>
  window.sessionStorage.setItem(PAYMENT_IN_FLIGHT_KEY, value);

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('savePaymentInFlight', () => {
  it('writes the attempt under the namespaced key', () => {
    savePaymentInFlight(record());

    expect(window.sessionStorage.getItem(PAYMENT_IN_FLIGHT_KEY)).toContain(
      'pay-abc12345-1757851200000'
    );
  });

  it('survives a storage that refuses to write', () => {
    const setItem = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    expect(() => savePaymentInFlight(record())).not.toThrow();

    setItem.mockRestore();
  });
});

describe('readPaymentInFlight', () => {
  it('round-trips a fresh record', () => {
    savePaymentInFlight(record());

    // Read back RESOLVED, not verbatim: a record with no cycle in it is the
    // shape every client before PG-31 wrote, so it must come back as a monthly
    // attempt with no recorded amount rather than as a record missing fields.
    expect(readPaymentInFlight(NOW)).toEqual({
      ...record(),
      billingCycle: 'monthly',
      amount: null,
    });
  });

  it('returns null when nothing was ever recorded', () => {
    expect(readPaymentInFlight(NOW)).toBeNull();
  });

  it('returns null for unparseable JSON instead of throwing', () => {
    storeRaw('{not json');

    expect(readPaymentInFlight(NOW)).toBeNull();
  });

  it.each([
    ['a bare string', 'pay-abc'],
    ['null', null],
    ['a number', 42],
    ['an array', []],
  ])('returns null for %s', (_label, value) => {
    storeRaw(JSON.stringify(value) ?? 'null');

    expect(readPaymentInFlight(NOW)).toBeNull();
  });

  it.each(['orderReference', 'packageId', 'methodKey', 'startedAt'])(
    'returns null when %s is missing',
    (field) => {
      store(record({ [field]: undefined }));

      expect(readPaymentInFlight(NOW)).toBeNull();
    }
  );

  it.each(['orderReference', 'packageId', 'methodKey'])(
    'returns null when %s is blank or not a string',
    (field) => {
      store(record({ [field]: '   ' }));
      expect(readPaymentInFlight(NOW)).toBeNull();

      store(record({ [field]: 7 }));
      expect(readPaymentInFlight(NOW)).toBeNull();
    }
  );

  it('returns null when startedAt is not a parseable instant', () => {
    store(record({ startedAt: 'not-a-date' }));

    expect(readPaymentInFlight(NOW)).toBeNull();
  });

  it('expires a record older than the bound', () => {
    store(record({ startedAt: new Date(NOW).toISOString() }));

    // One millisecond past the age bound: the attempt is abandoned, not pending.
    expect(
      readPaymentInFlight(NOW + PAYMENT_IN_FLIGHT_MAX_AGE_MS + 1)
    ).toBeNull();
  });

  it('still returns a record exactly on the age bound', () => {
    store(record({ startedAt: new Date(NOW).toISOString() }));

    expect(
      readPaymentInFlight(NOW + PAYMENT_IN_FLIGHT_MAX_AGE_MS)
    ).not.toBeNull();
  });

  it('refuses a record dated in the future rather than trusting it forever', () => {
    // Well past the bound: a hand-edited or badly-clocked timestamp must not
    // be able to resurrect a marker indefinitely.
    store(
      record({ startedAt: new Date(NOW + 25 * 60 * 60 * 1000).toISOString() })
    );

    expect(readPaymentInFlight(NOW)).toBeNull();
  });

  it('tolerates a small clock skew instead of discarding the marker', () => {
    // A few seconds of skew between the writer and the reader is normal and
    // must not cost the customer their resume affordance.
    store(record({ startedAt: new Date(NOW + 5_000).toISOString() }));

    expect(readPaymentInFlight(NOW)).not.toBeNull();
  });

  it('reads null when storage cannot be reached at all', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      window,
      'sessionStorage'
    );
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('blocked by browser settings');
      },
    });

    expect(() => readPaymentInFlight(NOW)).not.toThrow();
    expect(readPaymentInFlight(NOW)).toBeNull();

    if (descriptor) Object.defineProperty(window, 'sessionStorage', descriptor);
  });
});

describe('clearPaymentInFlight', () => {
  it('removes the marker so the URL becomes the only source of truth', () => {
    savePaymentInFlight(record());
    clearPaymentInFlight();

    expect(window.sessionStorage.getItem(PAYMENT_IN_FLIGHT_KEY)).toBeNull();
  });

  it('is a no-op when there is nothing to clear', () => {
    expect(() => clearPaymentInFlight()).not.toThrow();
  });
});
