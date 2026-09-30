import handler from 'pages/api/health';
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

jest.mock('@/lib/env', () => ({
  __esModule: true,
  default: {
    erp: {
      apiUrl: 'https://erp.example.test/api',
    },
  },
}));

const queryRawMock = prisma.$queryRaw as unknown as jest.Mock;

const createMockReqRes = () => {
  const req = { method: 'GET' } as any;
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as any,
    setHeader: jest.fn(),
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((data: any) => {
      res.body = data;
      return res;
    }),
  } as any;

  return { req, res };
};

describe('Health API (/api/health)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    queryRawMock.mockResolvedValue([{ '?column?': 1 }]);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('probes a genuinely public ERP endpoint (P2.17 regression guard)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 }) as any;

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://erp.example.test/api/platform/TenantRegistration/catalog/packages',
      expect.objectContaining({ method: 'GET' })
    );
    // `/payments/methods` requires auth (P2.17) — probing it made every
    // production health check report a bogus http-401.
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/payments/methods'),
      expect.anything()
    );
  });

  it('reports erp.ok=true with latency when the ERP is reachable', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 }) as any;

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({
      version: expect.any(String),
      db: { ok: true },
      erp: expect.objectContaining({ ok: true, latencyMs: expect.any(Number) }),
    });
  });

  it('reports the ERP status code when the probe is rejected', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 401 }) as any;

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.erp).toMatchObject({ ok: false, error: 'http-401' });
  });

  it('reports erp.ok=false with timeout / unreachable errors and never throws', async () => {
    const timeoutErr: any = new Error('aborted');
    timeoutErr.name = 'TimeoutError';
    global.fetch = jest.fn().mockRejectedValue(timeoutErr) as any;

    let { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.erp).toMatchObject({ ok: false, error: 'timeout' });

    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as any;
    ({ req, res } = createMockReqRes());
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.erp).toMatchObject({ ok: false, error: 'unreachable' });
  });

  it('serves HEAD through the GET path with 200 and the full body (P4.33)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 }) as any;

    const { req, res } = createMockReqRes();
    req.method = 'HEAD';
    await handler(req, res);

    // Monitors probe with HEAD, so it must report the same health as GET.
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({
      version: expect.any(String),
      db: { ok: true },
      erp: expect.objectContaining({ ok: true, latencyMs: expect.any(Number) }),
    });
    expect(res.setHeader).not.toHaveBeenCalled();
    // HEAD runs the real checks rather than short-circuiting like 405 does.
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('answers every other method with 405, Allow: GET, HEAD and the repo error shape (P4.33)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 }) as any;

    // beforeEach clears all mocks, so this test starts from a clean call log.
    expect(queryRawMock).not.toHaveBeenCalled();

    for (const method of ['OPTIONS', 'POST', 'PUT', 'DELETE']) {
      const { req, res } = createMockReqRes();
      req.method = method;
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET, HEAD');
      expect(res.body).toEqual({
        error: { message: `Method ${method} Not Allowed` },
      });
      // never the 503 the old `throw new Error('Method not allowed')` produced
      expect(res.status).not.toHaveBeenCalledWith(503);
    }

    // A wrong method must short-circuit: no DB round-trip and no ERP probe.
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps GET unaffected by the method guard', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 }) as any;

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({
      version: expect.any(String),
      db: { ok: true },
      erp: expect.objectContaining({ ok: true }),
    });
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('reports db.ok=false without failing the whole response', async () => {
    queryRawMock.mockRejectedValue(new Error('db down'));
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 }) as any;

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.db).toEqual({ ok: false, error: 'db down' });
    expect(res.body.erp).toMatchObject({ ok: true });
  });
});
