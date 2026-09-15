import registerHandler from 'pages/api/public/erp/register';
import { ErpApiError, erp } from '@/lib/erp';
import { limiters } from '@/lib/rateLimit';
import { validateRecaptcha } from '@/lib/recaptcha';
import { ApiError } from '@/lib/errors';

// Only the ERP BOUNDARY is mocked. `classifyErpError` and `ErpApiError` stay
// REAL: the property under test is that the real classifier plus the real
// responder emit a stable code, so mocking the classifier would make this suite
// assert its own mock.
jest.mock('@/lib/erp', () => ({
  ...jest.requireActual('@/lib/erp'),
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

  // PG-52. The ERP reports a rejected registration on a **200** with
  // `success: false` plus a human sentence, so this path never reaches the catch
  // block and had to be normalised by value. The previous version of this test
  // asserted the sentence was forwarded verbatim — which is exactly the leak.
  it.each([
    ['Subdomain already taken.', 'erp-error-subdomain-taken'],
    ['Admin email or username is already in use.', 'erp-error-admin-exists'],
    ['Invalid package.', 'erp-error-invalid-package'],
    [
      'You must select a package or custom modules.',
      'erp-error-must-select-package',
    ],
    ['Tenant.Owner role is not configured.', 'erp-error-role-unconfigured'],
  ])(
    'maps the ERP sentence %j to the stable code %s',
    async (sentence, expectedCode) => {
      registerTenantMock.mockResolvedValue({
        success: false,
        message: sentence,
      });

      const { req, res } = createMockReqRes({ body: validBody });

      await registerHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: { message: expectedCode },
      });
      // The sentence itself must not survive anywhere in the response body.
      expect(JSON.stringify(res.body)).not.toContain(sentence);
    }
  );

  it('collapses an unrecognised ERP rejection sentence to erp-error-unexpected', async () => {
    const sentence = 'Provider exception: SELECT * FROM "Tenants"';

    registerTenantMock.mockResolvedValue({ success: false, message: sentence });

    const { req, res } = createMockReqRes({ body: validBody });

    await registerHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'erp-error-unexpected' },
    });
    expect(JSON.stringify(res.body)).not.toContain('SELECT');
  });

  it('collapses an ABSENT ERP rejection message to erp-error-unexpected', async () => {
    registerTenantMock.mockResolvedValue({ success: false });

    const { req, res } = createMockReqRes({ body: validBody });

    await registerHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'erp-error-unexpected' },
    });
  });

  it('does not publish an upstream body when erp.registerTenant throws', async () => {
    const hostile =
      '<html>500 Internal Server Error</html> SELECT "passwordHash" FROM "Users" at TenantRegistrationController';

    registerTenantMock.mockRejectedValue(new ErpApiError(hostile, 500));

    const { req, res } = createMockReqRes({ body: validBody });

    await registerHandler(req, res);

    const serialized = JSON.stringify(res.body);

    for (const marker of [
      '<html>',
      'Internal Server Error',
      'SELECT',
      'passwordHash',
      'TenantRegistrationController',
    ]) {
      expect(serialized).not.toContain(marker);
    }

    expect(res.body).toEqual({ error: { message: 'erp-upstream-failure' } });
    expect(res.statusCode).toBe(502);
  });
});
