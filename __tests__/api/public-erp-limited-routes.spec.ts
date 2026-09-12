import methodsHandler from 'pages/api/public/erp/methods';
import packagesHandler from 'pages/api/public/erp/packages';
import verifyHandler from 'pages/api/public/erp/verify';
import { erp } from '@/lib/erp';
import { limiters } from '@/lib/rateLimit';

jest.mock('@/lib/erp', () => ({
  erp: {
    getMethods: jest.fn(),
    getPackages: jest.fn(),
    verifyPayment: jest.fn(),
  },
}));

jest.mock('@/lib/rateLimit', () => ({
  clientKey: jest.fn(() => 'test-client'),
  limiters: {
    catalog: {
      allow: jest.fn(),
    },
    verify: {
      allow: jest.fn(),
    },
  },
}));

const getMethodsMock = erp.getMethods as unknown as jest.Mock;
const getPackagesMock = erp.getPackages as unknown as jest.Mock;
const verifyPaymentMock = erp.verifyPayment as unknown as jest.Mock;
const catalogAllowMock = limiters.catalog.allow as unknown as jest.Mock;
const verifyAllowMock = limiters.verify.allow as unknown as jest.Mock;

const TOO_MANY = { error: { message: 'too-many-requests' } };

const createMockReqRes = (options: {
  method?: string;
  query?: Record<string, unknown>;
}) => {
  const req = {
    method: options.method || 'GET',
    query: options.query || {},
    headers: {},
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

describe('Public ERP BFF routes — rate limiting (P4.8)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    catalogAllowMock.mockReturnValue(true);
    verifyAllowMock.mockReturnValue(true);

    getMethodsMock.mockResolvedValue([{ key: 'card', label: 'Card' }]);
    getPackagesMock.mockResolvedValue([{ id: 'pkg-1', name: 'Growth' }]);
    verifyPaymentMock.mockResolvedValue({ success: true });
  });

  describe('GET /api/public/erp/methods', () => {
    it('returns 429 with the shared error contract and never calls the ERP when limited', async () => {
      catalogAllowMock.mockReturnValue(false);

      const { req, res } = createMockReqRes({ method: 'GET' });

      await methodsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(TOO_MANY);
      expect(getMethodsMock).not.toHaveBeenCalled();
    });

    it('passes through to the ERP when allowed', async () => {
      const { req, res } = createMockReqRes({ method: 'GET' });

      await methodsHandler(req, res);

      expect(catalogAllowMock).toHaveBeenCalledWith('test-client');
      expect(getMethodsMock).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ data: [{ key: 'card', label: 'Card' }] });
    });
  });

  describe('GET /api/public/erp/packages', () => {
    it('returns 429 with the shared error contract and never calls the ERP when limited', async () => {
      catalogAllowMock.mockReturnValue(false);

      const { req, res } = createMockReqRes({ method: 'GET' });

      await packagesHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(TOO_MANY);
      expect(getPackagesMock).not.toHaveBeenCalled();
    });

    it('passes through to the ERP when allowed', async () => {
      const { req, res } = createMockReqRes({ method: 'GET' });

      await packagesHandler(req, res);

      expect(catalogAllowMock).toHaveBeenCalledWith('test-client');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ data: [{ id: 'pkg-1', name: 'Growth' }] });
    });
  });

  describe('GET /api/public/erp/verify', () => {
    it('returns 429 and never reaches validation or the ERP when limited', async () => {
      verifyAllowMock.mockReturnValue(false);

      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { reference: 'ord-1' },
      });

      await verifyHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(TOO_MANY);
      expect(verifyPaymentMock).not.toHaveBeenCalled();
    });

    it('consumes a limiter token before input validation (invalid reference still limited)', async () => {
      const { req, res } = createMockReqRes({ method: 'GET', query: {} });

      await verifyHandler(req, res);

      expect(verifyAllowMock).toHaveBeenCalledWith('test-client');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: { message: 'missing-reference' },
      });
      expect(verifyPaymentMock).not.toHaveBeenCalled();
    });

    it('verifies the payment when allowed', async () => {
      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { reference: 'ord-1' },
      });

      await verifyHandler(req, res);

      expect(verifyPaymentMock).toHaveBeenCalledWith('ord-1');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ data: { success: true } });
    });
  });

  describe('method contract is unchanged (no scope widening)', () => {
    it('keeps 405 for non-GET requests without consuming a limiter token', async () => {
      const { req, res } = createMockReqRes({ method: 'POST' });

      await methodsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
      expect(catalogAllowMock).not.toHaveBeenCalled();
      expect(getMethodsMock).not.toHaveBeenCalled();
    });
  });
});
