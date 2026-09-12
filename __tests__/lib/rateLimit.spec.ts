import { RateLimiter, limiters, clientKey } from '@/lib/rateLimit';

describe('Lib - RateLimiter', () => {
  it('allows up to max requests in the window and then rejects excess requests', () => {
    const limiter = new RateLimiter(1000, 3);
    const key = 'user-1';

    expect(limiter.allow(key)).toBe(true);
    expect(limiter.allow(key)).toBe(true);
    expect(limiter.allow(key)).toBe(true);
    expect(limiter.allow(key)).toBe(false);
    expect(limiter.allow(key)).toBe(false);
  });

  it('tracks different keys independently', () => {
    const limiter = new RateLimiter(1000, 2);

    expect(limiter.allow('ip-1')).toBe(true);
    expect(limiter.allow('ip-1')).toBe(true);
    expect(limiter.allow('ip-1')).toBe(false);

    expect(limiter.allow('ip-2')).toBe(true);
    expect(limiter.allow('ip-2')).toBe(true);
    expect(limiter.allow('ip-2')).toBe(false);
  });

  it('resets allowed count once window slides past expiry', () => {
    const limiter = new RateLimiter(500, 2);
    const key = 'user-time';

    const realNow = Date.now;
    let fakeNow = 1000000;
    jest.spyOn(Date, 'now').mockImplementation(() => fakeNow);

    try {
      expect(limiter.allow(key)).toBe(true);
      expect(limiter.allow(key)).toBe(true);
      expect(limiter.allow(key)).toBe(false);

      // Advance time by 600ms (past 500ms window)
      fakeNow += 600;

      expect(limiter.allow(key)).toBe(true);
      expect(limiter.allow(key)).toBe(true);
      expect(limiter.allow(key)).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  it('provides pre-configured limiters for checks, register, and payments', () => {
    expect(limiters.checks).toBeInstanceOf(RateLimiter);
    expect(limiters.register).toBeInstanceOf(RateLimiter);
    expect(limiters.payments).toBeInstanceOf(RateLimiter);
  });

  it('provides the P4.8 catalog and verify buckets for the remaining public routes', () => {
    expect(limiters.catalog).toBeInstanceOf(RateLimiter);
    expect(limiters.verify).toBeInstanceOf(RateLimiter);

    // Buckets are deliberately separate objects: an enumeration burst on
    // `checks` must not throttle catalog reads or payment polling.
    expect(limiters.catalog).not.toBe(limiters.checks);
    expect(limiters.verify).not.toBe(limiters.payments);
  });
});

describe('Lib - clientKey', () => {
  it('extracts the first IP from x-forwarded-for header when multiple IPs are present', () => {
    const req = {
      headers: {
        'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
      },
      socket: {},
    } as any;

    expect(clientKey(req)).toBe('203.0.113.195');
  });

  it('extracts the IP from x-forwarded-for when single IP is present', () => {
    const req = {
      headers: {
        'x-forwarded-for': '198.51.100.1',
      },
      socket: {},
    } as any;

    expect(clientKey(req)).toBe('198.51.100.1');
  });

  it('falls back to socket.remoteAddress when x-forwarded-for is missing', () => {
    const req = {
      headers: {},
      socket: {
        remoteAddress: '127.0.0.1',
      },
    } as any;

    expect(clientKey(req)).toBe('127.0.0.1');
  });

  it('returns unknown when both x-forwarded-for and socket.remoteAddress are missing', () => {
    const req = {
      headers: {},
      socket: {},
    } as any;

    expect(clientKey(req)).toBe('unknown');
  });
});
