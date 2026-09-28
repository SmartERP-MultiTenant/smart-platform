import {
  buildErpHandoffUrl,
  getErpLoginTargetUrl,
  isAllowedRedirectUrl,
} from '@/lib/erp/handoff';

describe('ERP browser handoff URL (HANDOFF CONTRACT v1)', () => {
  const mockOpts = {
    isLocalhost: false,
    clientUrl: 'http://localhost:4200',
    loginPath: '/auth/login',
    baseDomain: 'smartapro.com',
  };

  const allowOpts = {
    erpClientUrl: 'http://localhost:4200',
    erpBaseDomain: 'smartapro.com',
  };

  it('generates clean production login target URL without query tokens', () => {
    const url = getErpLoginTargetUrl(
      {
        subdomain: 'my-corp',
        redirectTo: '',
      },
      mockOpts
    );

    expect(url).toEqual('https://my-corp.smartapro.com/auth/login');
    expect(url).not.toContain('token=');
    expect(url).not.toContain('expiresIn=');
  });

  it('generates localhost target URL when isLocalhost is true', () => {
    const url = getErpLoginTargetUrl(
      { subdomain: 'my-corp' },
      { ...mockOpts, isLocalhost: true }
    );

    expect(url).toEqual('http://localhost:4200/auth/login');
  });

  it('prefers redirectTo when provided', () => {
    const url = getErpLoginTargetUrl(
      {
        subdomain: 'my-corp',
        redirectTo: 'http://custom.domain.com',
      },
      mockOpts
    );

    expect(url).toEqual('https://custom.domain.com/auth/login');
  });

  it('accepts the payment-success sessionStorage payload shape', () => {
    // The payment page passes the raw `erpLogin` payload (no `success` field),
    // including a stale one from a pre-P4.23 build that still carries a token.
    const erpLoginPayload: {
      token?: string;
      expiresIn?: string;
      subdomain?: string;
      redirectTo?: string;
      userName?: string;
    } = {
      token: 'jwt',
      expiresIn: '2026-12-31T00:00:00Z',
      subdomain: 'acme',
      userName: 'owner',
    };

    const url = getErpLoginTargetUrl(erpLoginPayload, mockOpts);

    expect(url).toEqual('https://acme.smartapro.com/auth/login');
  });

  describe('redirectTo shapes that nothing validates', () => {
    // `redirectTo` comes straight off the ERP register response and is only
    // typed as a string — there is no zod validation on either surface — so it
    // may carry a query, a path, or no scheme at all. Each shape used to be
    // concatenated onto `loginPath`, which could not produce a login URL.
    const bareOrigin = 'https://custom.domain.com';
    const withQuery = 'https://custom.domain.com?tenant=acme';
    const withPath = 'https://custom.domain.com/some/path?tenant=acme';

    it('leaves a bare origin as the exact login URL', () => {
      expect(
        getErpLoginTargetUrl(
          { subdomain: 'acme', redirectTo: bareOrigin },
          mockOpts
        )
      ).toEqual('https://custom.domain.com/auth/login');
    });

    it('puts the login path in the pathname and keeps an existing query param its own param', () => {
      const url = getErpLoginTargetUrl(
        { subdomain: 'acme', redirectTo: withQuery },
        mockOpts
      );

      // Concatenation produced `…?tenant=acme/auth/login`: the path was part
      // of the `tenant` VALUE, so the URL was not a login page.
      expect(url).toEqual('https://custom.domain.com/auth/login?tenant=acme');
      expect(new URL(url).pathname).toBe('/auth/login');
      expect(new URL(url).searchParams.get('tenant')).toBe('acme');

      // … and the handoff params are added alongside it, not into it.
      expect(
        buildErpHandoffUrl(
          { subdomain: 'acme', redirectTo: withQuery },
          { ...mockOpts, handoff: 'code', userName: 'owner' }
        )
      ).toEqual(
        'https://custom.domain.com/auth/login?tenant=acme&handoff=code&userName=owner'
      );
    });

    it('replaces a path that redirectTo already carries instead of appending to it', () => {
      // `…/some/path/auth/login` is a 404 on a static nginx origin, so the
      // configured login route wins and the stale path is dropped.
      expect(
        getErpLoginTargetUrl(
          { subdomain: 'acme', redirectTo: withPath },
          mockOpts
        )
      ).toEqual('https://custom.domain.com/auth/login?tenant=acme');
    });

    it('treats a non-absolute redirectTo as no redirectTo at all', () => {
      // `/some/path` cannot be parsed at all; it is also rejected by
      // `isAllowedRedirectUrl`, so the tenant's own subdomain is the only
      // target left that is neither a throw nor a non-URL string.
      expect(
        getErpLoginTargetUrl(
          { subdomain: 'acme', redirectTo: '/some/path' },
          mockOpts
        )
      ).toEqual('https://acme.smartapro.com/auth/login');
    });
  });

  describe('buildErpHandoffUrl', () => {
    it('puts the handoff code and the userName hint in the query string', () => {
      const url = buildErpHandoffUrl(
        { subdomain: 'my-corp', redirectTo: '' },
        {
          ...mockOpts,
          handoff: 'Zm9vYmFyLTAxMjM0NTY3ODlhYmNkZWZnaGlqa2xtbm9w',
          userName: 'brandowner',
        }
      );

      expect(url).toEqual(
        'https://my-corp.smartapro.com/auth/login?handoff=Zm9vYmFyLTAxMjM0NTY3ODlhYmNkZWZnaGlqa2xtbm9w&userName=brandowner'
      );
    });

    it('builds on the same base resolution as getErpLoginTargetUrl', () => {
      // The two functions must never disagree about the destination — the
      // handoff URL is the plain target plus query params, nothing else.
      const source = { subdomain: 'acme', redirectTo: '' };

      expect(
        buildErpHandoffUrl(source, {
          ...mockOpts,
          handoff: 'code',
          userName: 'owner',
        })
      ).toBe(
        `${getErpLoginTargetUrl(source, mockOpts)}?handoff=code&userName=owner`
      );

      expect(
        buildErpHandoffUrl(
          { subdomain: 'acme', redirectTo: 'http://custom.domain.com' },
          { ...mockOpts, userName: 'owner' }
        )
      ).toBe('https://custom.domain.com/auth/login?userName=owner');
    });

    it('appends to a target that already carries a query string', () => {
      // The base is not query-stripped anywhere (only `isAllowedRedirectUrl`
      // host-checks it), so an existing query is a real state. Joining with a
      // literal `?` produced `…?tenant=acme?handoff=…`, which made `handoff`
      // and `userName` part of the `tenant` VALUE — both params silently lost.
      const url = buildErpHandoffUrl(
        { subdomain: 'acme', redirectTo: '' },
        {
          ...mockOpts,
          loginPath: '/auth/login?tenant=acme',
          handoff: 'code',
          userName: 'owner',
        }
      );

      expect(url).toEqual(
        'https://acme.smartapro.com/auth/login?tenant=acme&handoff=code&userName=owner'
      );
      expect(new URL(url).searchParams.get('tenant')).toBe('acme');
    });

    it('keeps the existing params when `redirectTo` itself carries a query string', () => {
      const url = buildErpHandoffUrl(
        {
          subdomain: 'acme',
          redirectTo: 'https://custom.domain.com/auth/login?tenant=acme',
        },
        { ...mockOpts, handoff: 'code', userName: 'owner' }
      );

      const query = new URL(url).searchParams;

      // Both handoff params survive …
      expect(query.get('handoff')).toBe('code');
      expect(query.get('userName')).toBe('owner');
      // … and the pre-existing param is still its own parameter.
      expect(query.get('tenant')).toContain('acme');
    });

    it('keeps the localhost branch for dev/e2e', () => {
      const url = buildErpHandoffUrl(
        { subdomain: 'acme' },
        { ...mockOpts, isLocalhost: true, handoff: 'code', userName: 'owner' }
      );

      expect(url).toEqual(
        'http://localhost:4200/auth/login?handoff=code&userName=owner'
      );
    });

    it('returns the plain login URL when there is no code and no hint', () => {
      // The graceful-degradation half of the contract: an ERP that has not
      // shipped its handoff half yet returns no code, and the funnel must still
      // land the customer on a working login page.
      expect(
        buildErpHandoffUrl({ subdomain: 'my-corp' }, { ...mockOpts })
      ).toEqual('https://my-corp.smartapro.com/auth/login');
    });

    it('keeps userName when there is no handoff code', () => {
      // The two params are independent: a prefill hint without a code is still
      // worth carrying, and it must not be dropped for want of a code.
      expect(
        buildErpHandoffUrl(
          { subdomain: 'my-corp' },
          { ...mockOpts, userName: 'owner' }
        )
      ).toEqual('https://my-corp.smartapro.com/auth/login?userName=owner');
    });

    it('URL-encodes both parameters', () => {
      const url = buildErpHandoffUrl(
        { subdomain: 'my-corp' },
        {
          ...mockOpts,
          handoff: 'a+b/c=d&e',
          userName: 'owner name@example.com',
        }
      );

      // Built with URLSearchParams, so the raw delimiters never reach the
      // query string as syntax — a code can only ever be a value.
      expect(url).toContain('handoff=a%2Bb%2Fc%3Dd%26e');
      expect(url).toContain('userName=owner+name%40example.com');
      expect(url.split('?')[1].split('&')).toHaveLength(2);
    });

    it('never carries a token or an expiry, whatever the source holds', () => {
      // HANDOFF CONTRACT v1, item 3: no JWT in any URL, ever. The source is
      // typed to accept more than the handoff needs (the payment-success
      // payload), so this is pinned rather than assumed.
      const leakySource = {
        subdomain: 'my-corp',
        redirectTo: '',
        authToken: 'jwt-must-not-leak',
        expiresIn: '2026-12-31T00:00:00Z',
      } as unknown as Parameters<typeof buildErpHandoffUrl>[0];

      const url = buildErpHandoffUrl(leakySource, {
        ...mockOpts,
        handoff: 'code',
        userName: 'owner',
      });

      expect(url).not.toContain('token');
      expect(url).not.toContain('expiresIn');
      expect(url).not.toContain('jwt-must-not-leak');
      expect(url).not.toContain('2026-12-31');

      // And with no code at all, the URL stays a bare login URL.
      expect(buildErpHandoffUrl(leakySource, { ...mockOpts })).toEqual(
        'https://my-corp.smartapro.com/auth/login'
      );
    });
  });

  describe('isAllowedRedirectUrl (handoff host allowlist)', () => {
    it('allows localhost and 127.0.0.1 (dev)', () => {
      expect(
        isAllowedRedirectUrl('http://localhost:4200/auth/login', allowOpts)
      ).toBe(true);
      expect(
        isAllowedRedirectUrl('http://127.0.0.1:4200/auth/login', allowOpts)
      ).toBe(true);
    });

    it('allows the configured ERP client host and the base domain with subdomains', () => {
      expect(
        isAllowedRedirectUrl('https://smartapro.com/auth/login', allowOpts)
      ).toBe(true);
      expect(
        isAllowedRedirectUrl('https://acme.smartapro.com/auth/login', allowOpts)
      ).toBe(true);
    });

    it('allows the configured ERP client host even when it is not the base domain', () => {
      expect(
        isAllowedRedirectUrl('https://erp-client.example.com/auth/login', {
          erpClientUrl: 'https://erp-client.example.com',
          erpBaseDomain: 'smartapro.com',
        })
      ).toBe(true);
    });

    it('rejects non-absolute, off-domain and spoofed hosts', () => {
      expect(isAllowedRedirectUrl('/auth/login', allowOpts)).toBe(false);
      expect(isAllowedRedirectUrl('javascript:alert(1)', allowOpts)).toBe(
        false
      );
      expect(
        isAllowedRedirectUrl('https://evil.com/auth/login', allowOpts)
      ).toBe(false);
      // suffix spoof: must not match a domain that merely *contains* the base
      expect(
        isAllowedRedirectUrl('https://smartapro.com.evil.com/auth/login', {
          ...allowOpts,
        })
      ).toBe(false);
      expect(
        isAllowedRedirectUrl('https://notsmar_tapro.com/auth/login', allowOpts)
      ).toBe(false);
    });

    it('rejects malformed URLs without throwing', () => {
      expect(isAllowedRedirectUrl('https://', allowOpts)).toBe(false);
      expect(isAllowedRedirectUrl('', allowOpts)).toBe(false);
    });
  });
});
