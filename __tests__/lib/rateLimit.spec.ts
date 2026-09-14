import {
  RateLimiter,
  limiters,
  clientKey,
  resolveClientIp,
  parseForwardedFor,
  isIpLiteral,
  normalizeIp,
} from '@/lib/rateLimit';

// `lib/rateLimit.ts` reads `env.rateLimit.trustedProxyHops` at call time through
// this getter, so a test can change the configured hop count between cases
// without re-importing the module. Name must start with `mock` — jest hoists
// `jest.mock` above the imports and refuses out-of-scope references otherwise.
let mockTrustedProxyHops = 1;

jest.mock('@/lib/env', () => ({
  __esModule: true,
  default: {
    get rateLimit() {
      return { trustedProxyHops: mockTrustedProxyHops };
    },
  },
}));

beforeEach(() => {
  mockTrustedProxyHops = 1;
});

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

describe('Lib - isIpLiteral', () => {
  it('accepts well-formed IPv4 literals', () => {
    expect(isIpLiteral('203.0.113.195')).toBe(true);
    expect(isIpLiteral('127.0.0.1')).toBe(true);
    expect(isIpLiteral('0.0.0.0')).toBe(true);
  });

  it('rejects IPv4 octets out of range', () => {
    expect(isIpLiteral('256.0.0.1')).toBe(false);
    expect(isIpLiteral('1.2.3.999')).toBe(false);
  });

  it('accepts compressed and full IPv6 literals', () => {
    expect(isIpLiteral('2001:db8::1')).toBe(true);
    expect(isIpLiteral('::1')).toBe(true);
    expect(isIpLiteral('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe(true);
  });

  it('rejects junk a caller could inject in place of an address', () => {
    expect(isIpLiteral('')).toBe(false);
    expect(isIpLiteral('unknown')).toBe(false);
    expect(isIpLiteral('-')).toBe(false);
    expect(isIpLiteral('; DROP TABLE teams')).toBe(false);
    expect(isIpLiteral('203.0.113.195:8080')).toBe(false);
    expect(isIpLiteral('not-an-ip')).toBe(false);
  });
});

describe('Lib - normalizeIp', () => {
  it('unwraps the IPv4-mapped IPv6 form Node reports for IPv4 peers', () => {
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeIp('::FFFF:203.0.113.7')).toBe('203.0.113.7');
  });

  it('lower-cases IPv6 so equivalent spellings share one bucket', () => {
    expect(normalizeIp('2001:DB8::1')).toBe('2001:db8::1');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeIp('  198.51.100.1  ')).toBe('198.51.100.1');
  });

  it('leaves IPv4 untouched', () => {
    expect(normalizeIp('203.0.113.195')).toBe('203.0.113.195');
  });
});

describe('Lib - parseForwardedFor', () => {
  it('returns entries in arrival order (left = oldest, right = newest)', () => {
    expect(
      parseForwardedFor('203.0.113.195, 70.41.3.18, 150.172.238.178')
    ).toEqual(['203.0.113.195', '70.41.3.18', '150.172.238.178']);
  });

  it('returns an empty list for missing, empty or whitespace-only headers', () => {
    expect(parseForwardedFor(undefined)).toEqual([]);
    expect(parseForwardedFor('')).toEqual([]);
    expect(parseForwardedFor('   ')).toEqual([]);
    expect(parseForwardedFor(' , , ')).toEqual([]);
  });

  it('drops malformed entries without disturbing the position of valid ones', () => {
    // Padding with junk must not be able to shift which entry sits at the
    // right end — that position is what the trust model reads.
    expect(parseForwardedFor('junk, 203.0.113.195, , bogus')).toEqual([
      '203.0.113.195',
    ]);
    expect(parseForwardedFor('1.2.3.4, attacker-controlled, 5.6.7.8')).toEqual([
      '1.2.3.4',
      '5.6.7.8',
    ]);
  });

  it('normalises each entry', () => {
    expect(parseForwardedFor('::ffff:203.0.113.7, 2001:DB8::1')).toEqual([
      '203.0.113.7',
      '2001:db8::1',
    ]);
  });
});

describe('Lib - resolveClientIp (trusted-hop derivation)', () => {
  it('reads the RIGHTMOST entry with one trusted hop', () => {
    // Regression guard. The previous implementation returned the LEFTMOST hop
    // (`split(',')[0]`) — this assertion is the exact inverse of that, and the
    // first three entries are all caller-supplied.
    expect(
      resolveClientIp({
        forwardedFor: '203.0.113.195, 70.41.3.18, 150.172.238.178',
        peerAddress: '127.0.0.1',
        trustedHops: 1,
      })
    ).toBe('150.172.238.178');
  });

  it('reads the second-from-right entry with two trusted hops (Cloudflare + nginx)', () => {
    // Production topology: Cloudflare appends the real client, the host nginx
    // appends the Cloudflare edge it saw. The client is therefore one in from
    // the right, and anything the caller pre-seeded sits further left.
    expect(
      resolveClientIp({
        forwardedFor: 'fake.injected.value, 198.51.100.7, 172.71.0.1',
        peerAddress: '172.17.0.1',
        trustedHops: 2,
      })
    ).toBe('198.51.100.7');
  });

  it('SECURITY: a rotated caller-supplied prefix cannot mint new buckets', () => {
    // The bypass this ticket closes. One real client rotates the prefix it
    // sends; every request must still resolve to the same bucket key.
    const trustedSuffix = '203.0.113.7, 172.71.0.1';
    const keys = ['10.0.0.1', '10.0.0.2', '2.2.2.2', '9.9.9.9'].map((spoofed) =>
      resolveClientIp({
        forwardedFor: `${spoofed}, ${trustedSuffix}`,
        peerAddress: '172.17.0.1',
        trustedHops: 2,
      })
    );

    expect(keys).toEqual([
      '203.0.113.7',
      '203.0.113.7',
      '203.0.113.7',
      '203.0.113.7',
    ]);
    expect(new Set(keys).size).toBe(1);
  });

  it('PROOF (P4.22): the previous leftmost read was bypassable, the new read is not', () => {
    // Reproduces the old `clientKey` body against the same header the attacker
    // controls, then asserts the two disagree. If someone reintroduces a
    // leftmost read, this test fails.
    const previousImplementation = (xff: string) => xff.split(',')[0].trim();

    const spoofedPrefix = '10.1.1.1, 10.1.1.2, 10.1.1.3';
    const header = `${spoofedPrefix}, 203.0.113.7, 172.71.0.1`;

    expect(previousImplementation(header)).toBe('10.1.1.1');
    expect(
      resolveClientIp({
        forwardedFor: header,
        peerAddress: '172.17.0.1',
        trustedHops: 2,
      })
    ).toBe('203.0.113.7');
  });

  it('falls back to the peer address when the header is absent', () => {
    expect(resolveClientIp({ peerAddress: '127.0.0.1', trustedHops: 1 })).toBe(
      '127.0.0.1'
    );
  });

  it('falls back to the peer address when the header is empty or whitespace only', () => {
    expect(
      resolveClientIp({
        forwardedFor: '',
        peerAddress: '10.0.0.5',
        trustedHops: 1,
      })
    ).toBe('10.0.0.5');
    expect(
      resolveClientIp({
        forwardedFor: '   ',
        peerAddress: '10.0.0.5',
        trustedHops: 1,
      })
    ).toBe('10.0.0.5');
  });

  it('falls back to the peer address when every entry is malformed', () => {
    expect(
      resolveClientIp({
        forwardedFor: 'unknown, -, bogus',
        peerAddress: '10.0.0.5',
        trustedHops: 1,
      })
    ).toBe('10.0.0.5');
  });

  it('never guesses from the left when the chain is shorter than the hop count', () => {
    // A caller can only ever APPEND to the header, so a short chain cannot be
    // attacker-forced — but if it happens, reading the left end would hand the
    // key straight back to the caller. Falling back to the peer keeps the
    // limiter working; the bucket is merely coarser.
    expect(
      resolveClientIp({
        forwardedFor: 'attacker-controlled',
        peerAddress: '172.17.0.1',
        trustedHops: 2,
      })
    ).toBe('172.17.0.1');

    expect(
      resolveClientIp({
        forwardedFor: '198.51.100.7',
        peerAddress: '172.17.0.1',
        trustedHops: 2,
      })
    ).toBe('172.17.0.1');
  });

  it('ignores the header entirely when trustedHops is 0', () => {
    expect(
      resolveClientIp({
        forwardedFor: '198.51.100.7, 172.71.0.1',
        peerAddress: '127.0.0.1',
        trustedHops: 0,
      })
    ).toBe('127.0.0.1');
  });

  it('treats invalid hop counts as "do not trust the header"', () => {
    for (const trustedHops of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        resolveClientIp({
          forwardedFor: '198.51.100.7',
          peerAddress: '127.0.0.1',
          trustedHops,
        })
      ).toBe('127.0.0.1');
    }
  });

  it('normalises the peer address too', () => {
    expect(
      resolveClientIp({ peerAddress: '::ffff:127.0.0.1', trustedHops: 0 })
    ).toBe('127.0.0.1');
    expect(
      resolveClientIp({ peerAddress: '2001:DB8::1', trustedHops: 0 })
    ).toBe('2001:db8::1');
  });

  it('never returns an empty key, so a failure cannot collapse every client into one bucket', () => {
    expect(resolveClientIp({ trustedHops: 1 })).toBe('unknown');
    expect(
      resolveClientIp({ forwardedFor: '', peerAddress: '', trustedHops: 1 })
    ).toBe('unknown');
    expect(
      resolveClientIp({
        forwardedFor: '   ',
        peerAddress: '  ',
        trustedHops: 0,
      })
    ).toBe('unknown');
  });
});

describe('Lib - clientKey', () => {
  it('derives the key from the trusted end of x-forwarded-for using the configured hop count', () => {
    const req = {
      headers: {
        'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
      },
      socket: {},
    } as any;

    // beforeEach pins the configured default to 1 trusted hop.
    expect(mockTrustedProxyHops).toBe(1);
    expect(clientKey(req)).toBe('150.172.238.178');
  });

  it('honours a two-hop configuration (Cloudflare + nginx)', () => {
    mockTrustedProxyHops = 2;

    const req = {
      headers: {
        'x-forwarded-for': 'fake.value, 198.51.100.7, 172.71.0.1',
      },
      socket: { remoteAddress: '172.17.0.1' },
    } as any;

    expect(clientKey(req)).toBe('198.51.100.7');
  });

  it('falls back to the socket address when the hop count is 0', () => {
    mockTrustedProxyHops = 0;

    const req = {
      headers: { 'x-forwarded-for': '203.0.113.195' },
      socket: { remoteAddress: '127.0.0.1' },
    } as any;

    expect(clientKey(req)).toBe('127.0.0.1');
  });

  it('keeps one bucket for a client rotating its spoofed prefix (end-to-end)', () => {
    mockTrustedProxyHops = 2;

    const request = (spoofed: string) =>
      ({
        headers: {
          'x-forwarded-for': `${spoofed}, 203.0.113.7, 172.71.0.1`,
        },
        socket: { remoteAddress: '172.17.0.1' },
      }) as any;

    expect(clientKey(request('10.0.0.1'))).toBe('203.0.113.7');
    expect(clientKey(request('8.8.8.8'))).toBe('203.0.113.7');
    expect(clientKey(request('1.1.1.1'))).toBe('203.0.113.7');
  });

  it('keeps the e2e rate-limit flow working: no XFF header → one stable bucket', () => {
    // `tests/e2e/funnel/rate-limit.spec.ts` fires 35 unauthenticated GETs at
    // /api/public/erp/check-subdomain and expects a 429 before the end. That
    // spec does NOT depend on the old leftmost read: Playwright's
    // APIRequestContext sends no `X-Forwarded-For`, so the old code and the new
    // code both fall back to the same direct-peer key. This asserts that link
    // executably — real `clientKey` + the real `checks` bucket shape (30/min) —
    // so a future change to the fallback cannot silently disarm the e2e guard.
    const limiter = new RateLimiter(60_000, 30);
    const request = {
      headers: {},
      socket: { remoteAddress: '::ffff:127.0.0.1' },
    } as any;

    const results = Array.from({ length: 35 }, () =>
      limiter.allow(clientKey(request))
    );

    expect(results.slice(0, 30)).toEqual(new Array(30).fill(true));
    expect(results[30]).toBe(false);
    expect(results[34]).toBe(false);
  });

  it('accepts an array-valued x-forwarded-for header', () => {
    const req = {
      headers: { 'x-forwarded-for': ['198.51.100.1', '172.71.0.1'] },
      socket: {},
    } as any;

    expect(clientKey(req)).toBe('172.71.0.1');
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

  it('does not throw when the request has no socket at all', () => {
    const req = { headers: {} } as any;

    expect(clientKey(req)).toBe('unknown');
  });
});
