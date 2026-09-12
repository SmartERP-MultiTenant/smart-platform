import {
  getErpLoginTargetUrl,
  isAllowedRedirectUrl,
  submitErpPostHandoff,
} from '@/lib/erp/handoff';

describe('ERP Token POST Handoff Module (P4.14)', () => {
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
    // The payment page passes the raw `erpLogin` payload (no `success` field).
    const erpLoginPayload: {
      token?: string;
      expiresIn?: string;
      subdomain?: string;
      redirectTo?: string;
    } = {
      token: 'jwt',
      expiresIn: '2026-12-31T00:00:00Z',
      subdomain: 'acme',
    };

    const url = getErpLoginTargetUrl(erpLoginPayload, mockOpts);

    expect(url).toEqual('https://acme.smartapro.com/auth/login');
  });

  it('submits hidden POST form to target URL', () => {
    const appendChildSpy = jest.spyOn(document.body, 'appendChild');
    const submitMock = jest.fn();
    window.HTMLFormElement.prototype.submit = submitMock;

    submitErpPostHandoff({
      targetUrl: 'https://my-corp.smartapro.com/auth/login',
      token: 'jwt-post-token-123',
      expiresIn: '2026-12-31T00:00:00Z',
    });

    expect(appendChildSpy).toHaveBeenCalled();
    expect(submitMock).toHaveBeenCalled();
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
