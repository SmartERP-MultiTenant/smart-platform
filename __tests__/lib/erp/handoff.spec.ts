import { getErpLoginTargetUrl, submitErpPostHandoff } from '@/lib/erp/handoff';

describe('ERP Token POST Handoff Module (P4.14)', () => {
  const mockOpts = {
    isLocalhost: false,
    clientUrl: 'http://localhost:4200',
    loginPath: '/auth/login',
    baseDomain: 'smartapro.com',
  };

  it('generates clean production login target URL without query tokens', () => {
    const url = getErpLoginTargetUrl(
      {
        success: true,
        subdomain: 'my-corp',
        authToken: 'secret-token-not-in-url',
        expiresIn: '2026-12-31T00:00:00Z',
      },
      mockOpts
    );

    expect(url).toEqual('https://my-corp.smartapro.com/auth/login');
    expect(url).not.toContain('token=');
    expect(url).not.toContain('expiresIn=');
  });

  it('generates localhost target URL when isLocalhost is true', () => {
    const url = getErpLoginTargetUrl(
      {
        success: true,
        subdomain: 'my-corp',
        authToken: 'secret-token-not-in-url',
      },
      { ...mockOpts, isLocalhost: true }
    );

    expect(url).toEqual('http://localhost:4200/auth/login');
  });

  it('prefers redirectTo when provided', () => {
    const url = getErpLoginTargetUrl(
      {
        success: true,
        subdomain: 'my-corp',
        redirectTo: 'http://custom.domain.com',
      },
      mockOpts
    );

    expect(url).toEqual('https://custom.domain.com/auth/login');
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
});
