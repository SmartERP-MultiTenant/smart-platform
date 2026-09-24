/**
 * `YEARLY_BILLING_ENABLED` resolution (PG-31).
 *
 * The switch gates money, so it is fail-closed: only the exact string `true`
 * means ON. Everything else — unset, blank, `false`, `1`, `yes`, `TRUE`, a typo
 * — has to resolve to OFF, because a value an operator cannot read either way
 * must not sell annual subscriptions the ERP cannot yet bill for.
 *
 * `lib/env.ts` reads `process.env` at module scope, so a value cannot be flipped
 * on an already-imported module: each case loads a fresh instance through
 * `jest.resetModules()`, the same technique `env-rate-limit-hops.spec.ts` uses.
 */
type YearlyBillingEnv = { yearlyBillingEnabled: boolean };

// Keep this spec a module. `loadWith` and `mutableEnv` are file-local names that
// `env-rate-limit-hops.spec.ts` also declares at the top level; without an export
// both files are global scripts and TypeScript merges the declarations, checking
// each file's calls against the other file's signature.
export {};

const mutableEnv = process.env as Record<string, string | undefined>;

const loadWith = async (raw: string | undefined): Promise<boolean> => {
  const previous = mutableEnv.YEARLY_BILLING_ENABLED;

  if (raw === undefined) {
    delete mutableEnv.YEARLY_BILLING_ENABLED;
  } else {
    mutableEnv.YEARLY_BILLING_ENABLED = raw;
  }

  // `resetModules` plus a dynamic import re-evaluates the module against the
  // environment set above. The previous value is restored only after the import
  // has resolved, or the module would read the restored one instead.
  jest.resetModules();
  const env = (await import('@/lib/env')).default as YearlyBillingEnv;

  if (previous === undefined) {
    delete mutableEnv.YEARLY_BILLING_ENABLED;
  } else {
    mutableEnv.YEARLY_BILLING_ENABLED = previous;
  }

  return env.yearlyBillingEnabled;
};

afterEach(() => {
  jest.resetModules();
});

describe('YEARLY_BILLING_ENABLED (PG-31)', () => {
  it('is OFF when the variable is unset', async () => {
    // The whole point of the flag: production deploys this code with three
    // ACTIVE yearly-priced packages and no ERP support for a billing cycle, so
    // an unset value must hold the line rather than open it.
    expect(await loadWith(undefined)).toBe(false);
  });

  it('is ON only for the exact string `true`', async () => {
    expect(await loadWith('true')).toBe(true);
  });

  it.each([
    ['an empty value', ''],
    ['whitespace', '  '],
    ['false', 'false'],
    ['numeric truthy', '1'],
    ['yes', 'yes'],
    ['on', 'on'],
    ['uppercase', 'TRUE'],
    ['padded', ' true '],
    ['a typo', 'ture'],
  ])('is OFF for %s', async (_label, raw) => {
    expect(await loadWith(raw)).toBe(false);
  });

  it('resolves to a boolean, never the raw string', async () => {
    // `process.env.X ?? false` keeps the STRING 'false' — which is truthy — and
    // that fail-open shape is documented in `lib/env.ts` as the reason the
    // bounded-int helpers exist. This asserts the same class of bug cannot
    // reappear here.
    expect(typeof (await loadWith('false'))).toBe('boolean');
    expect(typeof (await loadWith('true'))).toBe('boolean');
  });
});
