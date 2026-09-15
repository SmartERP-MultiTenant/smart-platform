import checkEmailHandler from 'pages/api/public/erp/check-email';
import checkSubdomainHandler from 'pages/api/public/erp/check-subdomain';
import { ErpApiError, erp } from '@/lib/erp';
import { limiters } from '@/lib/rateLimit';

/**
 * `GET /api/public/erp/{check-subdomain,check-email}` — the PG-52 error contract.
 *
 * These two are the registration funnel's **enumeration** surfaces: an anonymous
 * caller can ask, for an unlimited number of candidate values, whether a
 * subdomain or an admin email is already taken. They were the last two public
 * ERP routes still answering with
 *
 * ```ts
 * const message = error.message || 'Something went wrong';
 * res.status(error.status || 500).json({ error: { message } });
 * ```
 *
 * and `ErpApiError.message` is lifted **verbatim from the ERP response body**, so
 * whatever the upstream failure said — prose, an HTML error page, a SQL fragment
 * from an unhandled provider exception — was published to an unauthenticated
 * caller. The tests below are written to fail against that shape.
 *
 * The three routes were fixed as a set (`register.ts` carries the third, in its
 * own spec) so the surface cannot drift apart again.
 */

// Only the ERP BOUNDARY is mocked. `classifyErpError`, `ErpApiError` and the
// responder stay REAL on purpose: the property under test is that the real
// classifier plus the real responder together emit a stable code, so mocking
// the classifier would make this suite assert its own mock.
jest.mock('@/lib/erp', () => ({
  ...jest.requireActual('@/lib/erp'),
  erp: {
    checkSubdomain: jest.fn(),
    checkEmail: jest.fn(),
  },
}));

jest.mock('@/lib/rateLimit', () => ({
  clientKey: jest.fn(() => 'test-client'),
  limiters: {
    checks: {
      allow: jest.fn(),
    },
  },
}));

const checkSubdomainMock = erp.checkSubdomain as unknown as jest.Mock;
const checkEmailMock = erp.checkEmail as unknown as jest.Mock;
const allowMock = limiters.checks.allow as unknown as jest.Mock;

/**
 * A payload that is unambiguously *upstream internals*, not a code. If any of
 * these substrings survive into a response body, the leak is back.
 */
const HOSTILE_UPSTREAM_BODY =
  '<html><body><h1>500 Internal Server Error</h1></body></html> ' +
  'SELECT "erpApiToken" FROM "Teams" WHERE "subdomain" = $1 ' +
  'at Erp.TenantRegistrationController.CheckSubdomain(String subdomain) ' +
  'System.Data.SqlClient.SqlException (0x80131904)';

/** Substrings that must never appear in a public response. */
const LEAK_MARKERS = [
  '<html>',
  'Internal Server Error',
  'SELECT',
  'erpApiToken',
  'TenantRegistrationController',
  'SqlException',
];

const createMockReqRes = (options: { query?: Record<string, unknown> }) => {
  const req = {
    method: 'GET',
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

const ROUTES = [
  {
    name: 'check-subdomain',
    handler: checkSubdomainHandler,
    mock: checkSubdomainMock,
    query: { subdomain: 'acme-co' },
  },
  {
    name: 'check-email',
    handler: checkEmailHandler,
    mock: checkEmailMock,
    query: { email: 'owner@acme.com' },
  },
] as const;

describe('Public ERP check routes — PG-52 error contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    allowMock.mockReturnValue(true);
  });

  describe('an upstream failure never publishes upstream text', () => {
    it.each(ROUTES)(
      '$name — an ErpApiError carrying an upstream body answers a stable code',
      async ({ handler, mock, query }) => {
        mock.mockRejectedValue(new ErpApiError(HOSTILE_UPSTREAM_BODY, 400));

        const { req, res } = createMockReqRes({ query });

        await handler(req, res);

        const serialized = JSON.stringify(res.body);

        for (const marker of LEAK_MARKERS) {
          expect(serialized).not.toContain(marker);
        }

        expect(res.body).toEqual({ error: { message: 'erp-bad-request' } });
        expect(res.statusCode).toBe(400);
      }
    );

    it.each(ROUTES)(
      '$name — an unattributable failure collapses to 502 without leaking',
      async ({ handler, mock, query }) => {
        // A bare `Error` with a hostile message: not an `ErpApiError`, so the
        // classifier cannot attribute it and must answer the generic 502. This
        // is the case where a naive `error.message` fallback leaks most easily,
        // because there is no status to key off.
        mock.mockRejectedValue(new Error(HOSTILE_UPSTREAM_BODY));

        const { req, res } = createMockReqRes({ query });

        await handler(req, res);

        const serialized = JSON.stringify(res.body);

        for (const marker of LEAK_MARKERS) {
          expect(serialized).not.toContain(marker);
        }

        expect(res.body).toEqual({
          error: { message: 'erp-upstream-failure' },
        });
        expect(res.statusCode).toBe(502);
      }
    );

    it.each(ROUTES)(
      '$name — an upstream 5xx carrying prose is not echoed',
      async ({ handler, mock, query }) => {
        mock.mockRejectedValue(new ErpApiError(HOSTILE_UPSTREAM_BODY, 500));

        const { req, res } = createMockReqRes({ query });

        await handler(req, res);

        expect(JSON.stringify(res.body)).not.toContain('SELECT');
        expect(res.body).toEqual({
          error: { message: 'erp-upstream-failure' },
        });
        expect(res.statusCode).toBe(502);
      }
    );
  });

  describe('the public response contract is unchanged for the funnel', () => {
    it.each(ROUTES)(
      '$name — returns the availability payload on success',
      async ({ handler, mock, query }) => {
        mock.mockResolvedValue({ available: true });

        const { req, res } = createMockReqRes({ query });

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ data: { available: true } });
      }
    );

    it.each(ROUTES)(
      '$name — keeps the local 429 code and does not reach the ERP when limited',
      async ({ handler, mock, query }) => {
        allowMock.mockReturnValue(false);

        const { req, res } = createMockReqRes({ query });

        await handler(req, res);

        expect(res.statusCode).toBe(429);
        expect(res.body).toEqual({ error: { message: 'too-many-requests' } });
        expect(mock).not.toHaveBeenCalled();
      }
    );

    it('check-subdomain keeps its local 400 validation code', async () => {
      const { req, res } = createMockReqRes({
        query: { subdomain: 'Not A Valid Subdomain!' },
      });

      await checkSubdomainHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: { message: 'invalid-subdomain' } });
      expect(checkSubdomainMock).not.toHaveBeenCalled();
    });

    it('check-email keeps its local 400 validation code', async () => {
      const { req, res } = createMockReqRes({
        query: { email: 'not-an-email' },
      });

      await checkEmailHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: { message: 'invalid-email' } });
      expect(checkEmailMock).not.toHaveBeenCalled();
    });
  });
});
