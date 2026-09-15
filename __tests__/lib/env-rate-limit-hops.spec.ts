/**
 * `RATE_LIMIT_TRUSTED_HOPS` default resolution (P4.22).
 *
 * The hop count is correct only when it equals the REAL proxy count, and the
 * two directions are not equally safe: too LOW only makes the bucket key
 * coarser, too HIGH drops the index into the caller-supplied
 * `X-Forwarded-For` prefix so the key becomes caller-chosen and the limit is
 * bypassable. An unset variable therefore cannot inherit production's `2`
 * everywhere — a staging box or bare container behind fewer proxies would
 * silently lose the control.
 *
 * `lib/env.ts` reads `process.env` at module scope, so every case loads a fresh
 * module instance via `jest.resetModules()`.
 */
type RateLimitEnv = { rateLimit: { trustedProxyHops: number } };

// `NODE_ENV` is typed readonly (Next augments it), so mutate through a
// writable view. Nothing here is shared across suites: the module registry is
// reset and the previous values are restored before returning.
const mutableEnv = process.env as Record<string, string | undefined>;

const setVar = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    delete mutableEnv[key];
  } else {
    mutableEnv[key] = value;
  }
};

const loadWith = async (
  nodeEnv: string | undefined,
  hops: string | undefined
): Promise<{ hops: number; warn: jest.SpyInstance }> => {
  const previousEnv = mutableEnv.NODE_ENV;
  const previousHops = mutableEnv.RATE_LIMIT_TRUSTED_HOPS;
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  setVar('NODE_ENV', nodeEnv);
  setVar('RATE_LIMIT_TRUSTED_HOPS', hops);

  // `resetModules` plus a dynamic import re-evaluates the module against the
  // environment set above. The previous values are restored only after the
  // import has resolved, or the module would read the restored ones.
  jest.resetModules();
  const env = (await import('@/lib/env')).default as RateLimitEnv;

  setVar('NODE_ENV', previousEnv);
  setVar('RATE_LIMIT_TRUSTED_HOPS', previousHops);

  return { hops: env.rateLimit.trustedProxyHops, warn };
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('RATE_LIMIT_TRUSTED_HOPS default', () => {
  it('defaults to production topology (2) when unset in production', async () => {
    expect((await loadWith('production', undefined)).hops).toBe(2);
  });

  it('defaults to the SAFE direction (0) when unset outside production', async () => {
    // 0 ignores X-Forwarded-For entirely. Where proxies exist that is coarser
    // (one shared bucket), which is the survivable direction; inheriting 2
    // would instead be the bypassable one.
    for (const nodeEnv of ['development', 'staging', 'test', 'qa', undefined]) {
      expect((await loadWith(nodeEnv, undefined)).hops).toBe(0);
    }
  });

  it('honours an explicit value in every environment', async () => {
    expect((await loadWith('production', '2')).hops).toBe(2);
    expect((await loadWith('production', '1')).hops).toBe(1);
    expect((await loadWith('development', '2')).hops).toBe(2);
    expect((await loadWith('staging', '3')).hops).toBe(3);
    // 0 stays an explicit opt-out, not a fallback.
    expect((await loadWith('production', '0')).hops).toBe(0);
  });

  it('rejects a malformed value toward 0 in EVERY environment, never toward 2', async () => {
    // The operator clearly intended a value that is not the default, so the
    // default cannot be assumed either. `2` would be the silent, bypassable
    // direction: if they meant 1 and there is one proxy, 2 makes the bucket key
    // caller-chosen. `0` can never exceed the real proxy count.
    for (const bad of ['abc', 'false', '1.5', '-1', '11', 'NaN', '2x']) {
      expect((await loadWith('production', bad)).hops).toBe(0);
      expect((await loadWith('development', bad)).hops).toBe(0);
    }
  });

  it('treats a blank value as unset, not as a rejected value', async () => {
    // A blank line in a dotenv file means "not configured" (`readBoundedInt`'s
    // documented convention), so it takes the unset path, not the reject path.
    expect((await loadWith('production', '')).hops).toBe(2);
    expect((await loadWith('production', '   ')).hops).toBe(2);
    expect((await loadWith('development', '')).hops).toBe(0);
  });

  it('warns exactly once per process when the value is unset', async () => {
    // NODE_ENV must not be 'test' for the warning to be emitted (it is muted in
    // jest so a module-scope message cannot bury every suite's results).
    const { warn } = await loadWith('production', undefined);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('RATE_LIMIT_TRUSTED_HOPS');
  });

  it('does not warn when the value is configured explicitly', async () => {
    const { warn } = await loadWith('production', '2');
    expect(warn).not.toHaveBeenCalled();
  });
});
