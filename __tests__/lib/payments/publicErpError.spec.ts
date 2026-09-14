import { ErpApiError } from '@/lib/erp';
import { paymentErrorCodes } from '@/lib/payments/errorCopy';
import {
  publicPaymentError,
  respondErpError,
} from '@/lib/payments/publicErpError';

/**
 * A string that must never appear anywhere in a public response body.
 *
 * Shaped like the things that actually leaked before this change: the ERP lifts
 * its own failure text (and, on a bad day, an HTML error page or a stack frame)
 * into `ErpApiError.message`, and every public route echoed it verbatim.
 */
const UPSTREAM_SECRET =
  'Microsoft.Data.SqlClient.SqlException: Login failed for user sa at PlatformBillingController.cs:line 42';

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((data: unknown) => {
      res.body = data;
      return res;
    }),
  } as any;

  return res;
};

/** The response body as the browser would receive it. */
const serializedBody = (res: any): string => JSON.stringify(res.body);

describe('Lib - payments/publicErpError (PG-52)', () => {
  describe('the leak is closed', () => {
    it('never puts an upstream message in the response body', () => {
      const res = createMockRes();

      respondErpError(res, new ErpApiError(UPSTREAM_SECRET, 400));

      expect(serializedBody(res)).not.toContain('SqlException');
      expect(serializedBody(res)).not.toContain('Login failed');
      // A distinctive token, not the bare `sa`: `sa` is a substring of
      // `message`, so asserting on it would fail for a perfectly safe body.
      expect(serializedBody(res)).not.toContain('for user sa');
      expect(serializedBody(res)).not.toContain('PlatformBillingController');
      expect(res.body).toEqual({ error: { message: 'erp-bad-request' } });
    });

    it.each([
      ['400', new ErpApiError(UPSTREAM_SECRET, 400)],
      ['404', new ErpApiError(UPSTREAM_SECRET, 404)],
      ['401', new ErpApiError(UPSTREAM_SECRET, 401)],
      ['409', new ErpApiError(UPSTREAM_SECRET, 409)],
      ['422', new ErpApiError(UPSTREAM_SECRET, 422)],
      ['500', new ErpApiError(UPSTREAM_SECRET, 500)],
      [
        'malformed marker',
        new ErpApiError(UPSTREAM_SECRET, 502, 'ERP_MALFORMED_RESPONSE'),
      ],
      ['unknown Error', new Error(UPSTREAM_SECRET)],
      ['TypeError', new TypeError(UPSTREAM_SECRET)],
      ['a thrown string', UPSTREAM_SECRET],
      ['a thrown object', { message: UPSTREAM_SECRET }],
      ['null', null],
      ['undefined', undefined],
    ])('never leaks the upstream text for a %s failure', (_label, failure) => {
      const res = createMockRes();

      respondErpError(res, failure);

      expect(serializedBody(res)).not.toContain('SqlException');
      expect(serializedBody(res)).not.toContain('PlatformBillingController');
    });

    it('answers with the documented envelope and nothing else', () => {
      const res = createMockRes();

      respondErpError(res, new ErpApiError(UPSTREAM_SECRET, 400));

      expect(Object.keys(res.body as object)).toEqual(['error']);
      expect(Object.keys((res.body as any).error)).toEqual(['message']);
    });
  });

  describe('status mapping comes from classifyErpError', () => {
    it.each([
      [400, 400, 'erp-bad-request'],
      [404, 404, 'erp-not-found'],
      // Not 401/403: the funnel must never be told "your session expired".
      [409, 409, 'erp-conflict'],
      [422, 422, 'erp-rejected'],
      [418, 502, 'erp-upstream-failure'],
      [500, 502, 'erp-upstream-failure'],
    ])(
      'maps an upstream %s to %s / %s',
      (upstream, expectedStatus, expectedCode) => {
        const result = publicPaymentError(new ErpApiError('x', upstream));

        expect(result).toEqual({ status: expectedStatus, code: expectedCode });
      }
    );

    it.each([401, 403])(
      'PRESERVES an upstream %s so the poller keeps treating it as a permanent rejection',
      (upstream) => {
        // `classifyErpError` collapses this to 502, and documents why: an admin
        // UI reads a 401 as "session expired" and logs the operator out. There
        // is no session here, but there IS a client contract —
        // `pages/payment/success.tsx:55-59` treats any 4xx except 429 as
        // permanent and any 5xx as transient, and a transient failure falls
        // through to the optimistic settle. Mapping this to 502 would move an
        // ERP auth failure from the honest error panel onto the success panel.
        //
        // Pinned because the naive "just use classifyErpError" change REPLACES
        // this behaviour silently — there is no other test that would notice.
        expect(publicPaymentError(new ErpApiError('x', upstream))).toEqual({
          status: upstream,
          code: 'erp-auth-failed',
        });
      }
    );

    it('does not let a spoofed status on a non-ErpApiError steer the response', () => {
      // The preservation is confined to the one case the classifier moved.
      expect(
        publicPaymentError(Object.assign(new Error('x'), { status: 401 }))
      ).toEqual({ status: 502, code: 'erp-upstream-failure' });
    });

    it('maps the malformed marker to 502 regardless of its own status', () => {
      expect(
        publicPaymentError(new ErpApiError('x', 200, 'ERP_MALFORMED_RESPONSE'))
      ).toEqual({ status: 502, code: 'erp-malformed-response' });
    });

    it('maps an unreachable ERP to 503 so the poller treats it as transient', () => {
      const networkError = Object.assign(new TypeError('fetch failed'), {
        cause: new Error('connect ECONNREFUSED 127.0.0.1:5001'),
      });

      expect(publicPaymentError(networkError)).toEqual({
        status: 503,
        code: 'erp-unavailable',
      });
    });
  });

  describe('the upstream allow-list upgrades a code without ever leaking', () => {
    it('upgrades the unsupported-method 400 to a specific code', () => {
      expect(
        publicPaymentError(
          new ErpApiError('Unsupported payment method: crypto', 400)
        )
      ).toEqual({ status: 400, code: 'unsupported-payment-method' });
    });

    it('upgrades the amount 400 to a specific code', () => {
      expect(
        publicPaymentError(
          new ErpApiError('Amount must be greater than zero', 400)
        )
      ).toEqual({ status: 400, code: 'invalid-amount' });
    });

    it('does NOT upgrade a 5xx even when the message matches', () => {
      // The `status < 500` guard. A 5xx is either "the ERP was never reached" or
      // "the failure could not be attributed", and its message is transport text
      // we have already decided not to trust. Matching prose against it would
      // widen the allow-list into the class the leak fix exists to stop reading.
      expect(
        publicPaymentError(
          new ErpApiError('Amount must be greater than zero', 500)
        )
      ).toEqual({ status: 502, code: 'erp-upstream-failure' });

      expect(
        publicPaymentError(
          Object.assign(new Error('Unsupported payment method'), {
            name: 'AbortError',
          })
        )
      ).toEqual({ status: 503, code: 'erp-unavailable' });
    });

    it('leaves an unmatched 400 on the generic code', () => {
      expect(
        publicPaymentError(new ErpApiError('Subdomain already taken.', 400))
      ).toEqual({ status: 400, code: 'erp-bad-request' });
    });
  });

  describe('the emitted code is always part of the taxonomy', () => {
    it('returns a code the frontend has copy for', () => {
      const failures: unknown[] = [
        new ErpApiError('a', 400),
        new ErpApiError('b', 404),
        new ErpApiError('c', 500),
        new ErpApiError('d', 200, 'ERP_MALFORMED_RESPONSE'),
        new ErpApiError('Unsupported payment method: x', 400),
        new ErpApiError('Amount must be greater than zero', 400),
        new TypeError('fetch failed'),
        new Error('whatever'),
        null,
      ];

      for (const failure of failures) {
        expect(paymentErrorCodes()).toContain(publicPaymentError(failure).code);
      }
    });
  });

  describe('respondErpError writes the code, not the error', () => {
    it('sets the status from the classification', () => {
      const res = createMockRes();

      respondErpError(res, new ErpApiError(UPSTREAM_SECRET, 409));

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.statusCode).toBe(409);
    });

    it('survives a non-Error failure without throwing', () => {
      const res = createMockRes();

      expect(() => respondErpError(res, 'a bare string')).not.toThrow();
      expect(res.statusCode).toBe(502);
      expect(res.body).toEqual({ error: { message: 'erp-upstream-failure' } });
    });
  });
});
