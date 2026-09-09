import { validateRecaptcha } from '@/lib/recaptcha';
import env from '@/lib/env';

const originalFetch = global.fetch;

const mockSiteVerify = (success: boolean) => {
  (global as any).fetch = jest.fn().mockResolvedValue({
    json: async () => ({ success }),
  });
};

describe('Lib - validateRecaptcha', () => {
  beforeEach(() => {
    env.recaptcha.siteKey = '';
    env.recaptcha.secretKey = '';
  });

  afterEach(() => {
    (global as any).fetch = originalFetch;
  });

  it('resolves when recaptcha keys are not configured', async () => {
    await expect(validateRecaptcha('any-token')).resolves.toBeUndefined();
    expect(global.fetch).toBe(originalFetch);
  });

  it('resolves without a token when keys are not configured', async () => {
    await expect(validateRecaptcha()).resolves.toBeUndefined();
  });

  it('rejects with erp-error-invalid-captcha when keys are set but token is missing', async () => {
    env.recaptcha.siteKey = 'site-key';
    env.recaptcha.secretKey = 'secret-key';

    const promise = validateRecaptcha();

    await expect(promise).rejects.toMatchObject({
      status: 400,
      message: 'erp-error-invalid-captcha',
    });
    expect(global.fetch).toBe(originalFetch);
  });

  it('calls Google siteverify and resolves when the token is valid', async () => {
    env.recaptcha.siteKey = 'site-key';
    env.recaptcha.secretKey = 'secret-key';
    mockSiteVerify(true);

    await expect(validateRecaptcha('good-token')).resolves.toBeUndefined();

    const fetchMock = (global as any).fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('https://www.google.com/recaptcha/api/siteverify');
    expect(url).toContain('secret=secret-key');
    expect(url).toContain('response=good-token');
    expect(init.method).toBe('POST');
  });

  it('rejects with erp-error-invalid-captcha when siteverify fails', async () => {
    env.recaptcha.siteKey = 'site-key';
    env.recaptcha.secretKey = 'secret-key';
    mockSiteVerify(false);

    await expect(validateRecaptcha('bad-token')).rejects.toMatchObject({
      status: 400,
      message: 'erp-error-invalid-captcha',
    });
  });
});
