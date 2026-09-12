import {
  buildLoginRedirect,
  isAbsoluteHttpUrl,
  resolvePostLoginRedirect,
} from '@/lib/authRedirect';

const PUBLIC_ORIGIN = 'https://platform.smartapro.com';
const FALLBACK = '/dashboard';

describe('isAbsoluteHttpUrl', () => {
  it('accepts absolute http(s) URLs', () => {
    expect(isAbsoluteHttpUrl('https://platform.smartapro.com')).toBe(true);
    expect(isAbsoluteHttpUrl('http://localhost:4002')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isAbsoluteHttpUrl('/admin/users')).toBe(false);
    expect(isAbsoluteHttpUrl('//platform.smartapro.com')).toBe(false);
    expect(isAbsoluteHttpUrl('ftp://platform.smartapro.com')).toBe(false);
    expect(isAbsoluteHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isAbsoluteHttpUrl('')).toBe(false);
    expect(isAbsoluteHttpUrl(undefined)).toBe(false);
    expect(isAbsoluteHttpUrl(null)).toBe(false);
    // `lib/env.ts` interpolates a missing var into the literal string
    // "undefined" — the whole reason this guard exists.
    expect(isAbsoluteHttpUrl('undefined')).toBe(false);
    expect(isAbsoluteHttpUrl({ origin: PUBLIC_ORIGIN })).toBe(false);
  });
});

describe('buildLoginRedirect', () => {
  it('builds /auth/login on the given base and keeps the callback relative', () => {
    const url = buildLoginRedirect(
      'https://platform.smartapro.com',
      '/admin/users'
    );

    // The public origin is used for the redirect itself...
    expect(url.origin).toBe(PUBLIC_ORIGIN);
    expect(url.pathname).toBe('/auth/login');
    // ...while the callback stays a relative path (resolved by the browser
    // against whatever origin the user is actually on).
    expect(url.searchParams.get('callbackUrl')).toBe('/admin/users');
  });

  it('preserves the query string of the requested page', () => {
    const url = buildLoginRedirect(
      'https://platform.smartapro.com',
      '/teams/acme/erp?tab=billing'
    );

    expect(url.searchParams.get('callbackUrl')).toBe(
      '/teams/acme/erp?tab=billing'
    );
  });

  it('never leaks the internal server address into the redirect', () => {
    const url = buildLoginRedirect(
      'https://platform.smartapro.com',
      '/admin/users'
    );

    expect(url.toString()).not.toContain('localhost');
    expect(url.toString()).not.toContain(':4002');
  });

  it('throws for a non-absolute base instead of silently degrading', () => {
    expect(() => buildLoginRedirect('undefined', '/admin/users')).toThrow();
  });
});

describe('resolvePostLoginRedirect', () => {
  it('accepts relative paths, with or without a known origin', () => {
    expect(resolvePostLoginRedirect('/admin/users', FALLBACK)).toBe(
      '/admin/users'
    );
    expect(
      resolvePostLoginRedirect('/admin/users', FALLBACK, PUBLIC_ORIGIN)
    ).toBe('/admin/users');
  });

  it('preserves the query string', () => {
    expect(
      resolvePostLoginRedirect('/teams/acme/erp?tab=billing', FALLBACK)
    ).toBe('/teams/acme/erp?tab=billing');
  });

  it('reduces a same-origin absolute URL to its path and query', () => {
    expect(
      resolvePostLoginRedirect(
        `${PUBLIC_ORIGIN}/admin/users?page=2`,
        FALLBACK,
        PUBLIC_ORIGIN
      )
    ).toBe('/admin/users?page=2');
  });

  it('rejects protocol-relative URLs (open-redirect guard)', () => {
    expect(resolvePostLoginRedirect('//evil.example.com', FALLBACK)).toBe(
      FALLBACK
    );
    expect(
      resolvePostLoginRedirect('//evil.example.com', FALLBACK, PUBLIC_ORIGIN)
    ).toBe(FALLBACK);
  });

  it('rejects cross-origin absolute URLs', () => {
    expect(
      resolvePostLoginRedirect(
        'https://evil.example.com/admin',
        FALLBACK,
        PUBLIC_ORIGIN
      )
    ).toBe(FALLBACK);
  });

  it('rejects absolute URLs when no origin is known', () => {
    expect(resolvePostLoginRedirect(`${PUBLIC_ORIGIN}/admin`, FALLBACK)).toBe(
      FALLBACK
    );
  });

  it('rejects backslashes (browsers normalize them to "/")', () => {
    expect(resolvePostLoginRedirect('/\\evil.example.com', FALLBACK)).toBe(
      FALLBACK
    );
  });

  it('rejects control characters', () => {
    expect(resolvePostLoginRedirect('/admin\u0000/users', FALLBACK)).toBe(
      FALLBACK
    );
  });

  it('rejects non-http schemes', () => {
    expect(
      resolvePostLoginRedirect('javascript:alert(1)', FALLBACK, PUBLIC_ORIGIN)
    ).toBe(FALLBACK);
  });

  it('uses the first value of a repeated query parameter', () => {
    expect(
      resolvePostLoginRedirect(['/admin/users', '/dashboard'], FALLBACK)
    ).toBe('/admin/users');
  });

  it('falls back for empty, whitespace, array and non-string inputs', () => {
    expect(resolvePostLoginRedirect('', FALLBACK)).toBe(FALLBACK);
    expect(resolvePostLoginRedirect('   ', FALLBACK)).toBe(FALLBACK);
    expect(resolvePostLoginRedirect([], FALLBACK)).toBe(FALLBACK);
    expect(resolvePostLoginRedirect(undefined, FALLBACK)).toBe(FALLBACK);
    expect(resolvePostLoginRedirect(null, FALLBACK)).toBe(FALLBACK);
  });
});
