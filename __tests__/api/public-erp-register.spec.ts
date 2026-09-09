import registerHandler from 'pages/api/public/erp/register';
import { erp } from '@/lib/erp';
import { limiters } from '@/lib/rateLimit';
import { validateRecaptcha } from '@/lib/recaptcha';
import { ApiError } from '@/lib/errors';

jest.mock('@/lib/erp', () => ({
  erp: {
    registerTenant: jest.fn(),
  },
}));

jest.mock('@/lib/rateLimit', () => ({
  clientKey: jest.fn(() => 'test-client'),
  limiters: {
    register: {
      allow: jest.fn(),
    },
  },
}));

jest.mock('@/lib/recaptcha', () => ({
  validateRecaptcha: jest.fn(),
}));

const registerTenantMock = erp.registerTenant as unknown as jest.Mock;
const allowMock = limiters.register.allow as unknown as jest.Mock;
const validateRecaptchaMock = validateRecaptcha as unknown as jest.Mock;

const validBody = {
  companyName: 'Acme Co',
  subdomain: 'acme-co',
  adminEmail: 'owner@acme.com',
  adminUserName: 'owner',
  adminPassword: 'SecurePass123!',
  packageId: '1f1b3311-2477-49f1-8c5c-3abb1c3ecd4c',
  trialDays: 14,
};

const createMockReqRes = (options: {
  method?: string;
  body?: Record<string, unknown>;
}) => {
  const req = {
    method: options.method || 'POST',
    body: options.body || {},
  } as any;

  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader: jest.fn((key: string, value: string) => {
      res.headers[key] = value;
    }),
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((data: unknown) => {
      res.body = data;
      return res;
    }),
  } as any;

  return { req, res };
};

describe('Public ERP Registration API (/api/public/erp/register)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    allowMock.mockReturnValue(true);
    validateRecaptchaMock.mockResolvedValue(undefined);
    registerTenantMock.mockResolvedValue({
      success: true,
      subdomain: 'acme-co',
    });
  });

  it('rate-limits BEFORE schema validation or reCAPTCHA verification', async () => {
    allowMock.mockReturnValue(false);

    // An invalid payload would 400 on schema parse — the 429 proves the
    // limiter runs first (cheapest guard, before external round-trips).
    const { req, res } = createMockReqRes({ body: {} });

    await registerHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'too-many-requests' },
    });
    expect(validateRecaptchaMock).not.toHaveBeenCalled();
    expect(registerTenantMock).not.toHaveBeenCalled();
  });

  it('returns 400 erp-error-invalid-captcha when reCAPTCHA verification fails', async () => {
    validateRecaptchaMock.mockRejectedValue(
      new ApiError(400, 'erp-error-invalid-captcha')
    );

    const { req, res } = createMockReqRes({
      body: { ...validBody, recaptchaToken: 'stale-token' },
    });

    await registerHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'erp-error-invalid-captcha' },
    });
    expect(registerTenantMock).not.toHaveBeenCalled();
  });

  it('strips recaptchaToken before forwarding to erp.registerTenant', async () => {
    const { req, res } = createMockReqRes({
      body: { ...validBody, recaptchaToken: 'valid-token' },
    });

    await registerHandler(req, res);

    expect(validateRecaptchaMock).toHaveBeenCalledWith('valid-token');
    expect(registerTenantMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ recaptchaToken: expect.anything() })
    );
    expect(registerTenantMock).toHaveBeenCalledWith(
      expect.objectContaining({ subdomain: 'acme-co' })
    );
    // Success path: the handler responds via res.json with the default 200.
    expect(res.statusCode).toBe(200);
    expect(res.json).toHaveBeenCalledWith({
      data: { success: true, subdomain: 'acme-co' },
    });
  });

  it('returns 400 with issues for an invalid payload', async () => {
    const { req, res } = createMockReqRes({ body: {} });

    await registerHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: expect.any(String),
        }),
        issues: expect.any(Object),
      })
    );
    expect(validateRecaptchaMock).not.toHaveBeenCalled();
    expect(registerTenantMock).not.toHaveBeenCalled();
  });

  it('returns 405 for non-POST methods', async () => {
    const { req, res } = createMockReqRes({ method: 'GET' });

    await registerHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST');
    expect(registerTenantMock).not.toHaveBeenCalled();
  });

  it('maps an unsuccessful ERP registration result to 400', async () => {
    registerTenantMock.mockResolvedValue({
      success: false,
      message: 'Subdomain already taken.',
    });

    const { req, res } = createMockReqRes({ body: validBody });

    await registerHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'Subdomain already taken.' },
    });
  });
});
