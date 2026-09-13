import {
  ApiError,
  adminErrorCopy,
  adminErrorCopyKey,
  apiErrorMessage,
  apiErrorStatus,
  isAdminErrorCode,
} from '@/lib/errors';
import arLocale from '../../locales/ar/common.json';
import enLocale from '../../locales/en/common.json';

/**
 * Stand-in for what `class ApiError extends Error` actually produces once
 * `tsc`/SWC downlevels it to `target: es5`.
 *
 * Under ES5 the emitted constructor is `_super.call(this, message) || this`, and
 * `Error` invoked as a plain function returns a *new* `Error` — so the object's
 * prototype is `Error.prototype` and `instanceof ApiError` is `false`, while
 * `name`/`status`/`message` survive. This shape is the only way to exercise that
 * regime from a test: jest runs through `next/jest` (SWC, modern target), where
 * `instanceof` happens to work, which is exactly why the bug could hide.
 *
 * Verified against a real `tsc --target es5` build of the same class:
 * `instanceof ApiError === false`, `name === 'ApiError'`, `typeof status ===
 * 'number'`.
 */
const es5ShapedApiError = (init: {
  status: number;
  message: string;
  expose: boolean;
}): Error => {
  const error = Object.create(Error.prototype) as Error & {
    status: number;
    expose: boolean;
  };

  error.name = 'ApiError';
  error.message = init.message;
  error.status = init.status;
  error.expose = init.expose;

  return error;
};

describe('ApiError', () => {
  it('carries its status and branded name', () => {
    const error = new ApiError(404, 'team-not-found');

    expect(error.status).toBe(404);
    expect(error.message).toBe('team-not-found');
    expect(error.name).toBe('ApiError');
  });

  it('defaults `expose` to false', () => {
    expect(new ApiError(500, 'internal detail').expose).toBe(false);
    expect(new ApiError(500, 'internal detail', {}).expose).toBe(false);
    expect(new ApiError(500, 'internal detail', { expose: false }).expose).toBe(
      false
    );
    expect(
      new ApiError(503, 'erp-not-configured', { expose: true }).expose
    ).toBe(true);
  });
});

describe('apiErrorStatus', () => {
  it('reads a numeric status off the error', () => {
    expect(apiErrorStatus(new ApiError(403, 'forbidden'))).toBe(403);
    expect(apiErrorStatus({ status: 502 })).toBe(502);
  });

  it('falls back to 500 for anything else', () => {
    expect(apiErrorStatus(new Error('boom'))).toBe(500);
    expect(apiErrorStatus(null)).toBe(500);
    expect(apiErrorStatus(undefined)).toBe(500);
    expect(apiErrorStatus('boom')).toBe(500);
    expect(apiErrorStatus({ status: '403' })).toBe(500);
  });
});

describe('apiErrorMessage', () => {
  it('echoes a 4xx ApiError message', () => {
    expect(apiErrorMessage(new ApiError(404, 'team-not-found'))).toBe(
      'team-not-found'
    );
    expect(apiErrorMessage(new ApiError(422, 'invalid-iso-date'))).toBe(
      'invalid-iso-date'
    );
  });

  it('honours the opt-in `expose` flag on a 5xx', () => {
    const exposed = new ApiError(503, 'erp-not-configured', { expose: true });

    expect(apiErrorStatus(exposed)).toBe(503);
    expect(apiErrorMessage(exposed)).toBe('erp-not-configured');
  });

  // The generic 5xx guarantee must survive the new door, or the opt-in flag has
  // silently become a blanket loosening of the rule it was carved out of.
  it.each([
    [500, 'Error updating password. Please try again.'],
    [502, 'upstream said: SQLSTATE[08006] connection refused'],
    [503, 'erp-not-configured'],
    [504, 'gateway timeout'],
  ])('still collapses an unexposed %i to internal-error', (status, message) => {
    expect(apiErrorMessage(new ApiError(status, message))).toBe(
      'internal-error'
    );
  });

  it('collapses non-ApiError failures to internal-error', () => {
    const prismaShaped = Object.assign(
      new Error('column "actorEmail" does not exist in the current database'),
      { code: 'P2010', meta: { table: 'AdminAuditLog' } }
    );

    expect(apiErrorMessage(prismaShaped)).toBe('internal-error');
    expect(apiErrorMessage(new Error('boom'))).toBe('internal-error');
    expect(apiErrorMessage('boom')).toBe('internal-error');
    expect(apiErrorMessage(null)).toBe('internal-error');
    expect(apiErrorMessage(undefined)).toBe('internal-error');
    expect(apiErrorMessage({ status: 500, message: 'leak' })).toBe(
      'internal-error'
    );
  });

  it('ignores `expose` when there is no message to expose', () => {
    const empty = new ApiError(503, '', { expose: true });

    expect(apiErrorMessage(empty)).toBe('internal-error');
  });

  // `expose` is a *claim* that the message is a stable action code rather than
  // an internal detail, and the claim is verified instead of trusted. Without
  // that check the flag would be a switch that turns the 5xx rule off for an
  // arbitrary message — including one lifted verbatim from an upstream body.
  it.each([
    [
      'a stack fragment',
      'Error: connect ECONNREFUSED 10.0.0.5:5432\n    at TCPConnectWrap.afterConnect',
    ],
    ['an upstream sentence', 'upstream said: connection refused'],
    ['a DSN', 'postgresql://audit_user:s3cr3t@db.internal:5432/saas'],
    ['a raw upstream body', '{"error":"invalid API key sk_live_abcdef123456"}'],
    ['a code with trailing prose', 'erp-not-configured please retry'],
  ])('refuses to expose a flagged 5xx carrying %s', (_label, message) => {
    const flagged = new ApiError(503, message, { expose: true });

    // Guards the premise: the flag really is set, so the assertions below are
    // about the code-shape check and not about a missing flag.
    expect(flagged.expose).toBe(true);
    expect(apiErrorMessage(flagged)).toBe('internal-error');
  });

  it('exposes a flagged 5xx only when the message really is code-shaped', () => {
    expect(
      apiErrorMessage(new ApiError(503, 'erp-not-configured', { expose: true }))
    ).toBe('erp-not-configured');

    // Same rule under the ES5 regime, where `instanceof` is false.
    expect(
      apiErrorMessage(
        es5ShapedApiError({
          status: 503,
          message: 'erp-not-configured',
          expose: true,
        })
      )
    ).toBe('erp-not-configured');
    expect(
      apiErrorMessage(
        es5ShapedApiError({
          status: 503,
          message: 'upstream exploded',
          expose: true,
        })
      )
    ).toBe('internal-error');
  });

  // The regression that motivated the `name`/`status` duck-type: under an ES5
  // build `instanceof ApiError` is false, so an `instanceof`-only check would
  // silently never expose the code the route deliberately flagged.
  it('honours an ES5-downlevelled ApiError (instanceof false, brand intact)', () => {
    const exposed = es5ShapedApiError({
      status: 503,
      message: 'erp-not-configured',
      expose: true,
    });
    const unexposed = es5ShapedApiError({
      status: 503,
      message: 'internal detail',
      expose: false,
    });

    // Guards the premise: if this ever becomes `true`, the simulation above
    // stopped representing the ES5 regime and the test below proves nothing.
    expect(exposed instanceof ApiError).toBe(false);

    expect(apiErrorMessage(exposed)).toBe('erp-not-configured');
    expect(apiErrorMessage(unexposed)).toBe('internal-error');
  });
});

describe('admin error-code copy mapping', () => {
  it('recognises pure kebab-case codes but not sentences', () => {
    expect(isAdminErrorCode('erp-not-configured')).toBe(true);
    expect(isAdminErrorCode('internal-error')).toBe(true);
    expect(isAdminErrorCode('team-not-found')).toBe(true);

    expect(isAdminErrorCode('Invalid plan ID')).toBe(false);
    expect(isAdminErrorCode('Unauthorized')).toBe(false);
    expect(isAdminErrorCode('Method POST Not Allowed')).toBe(false);
    expect(isAdminErrorCode('')).toBe(false);
  });

  it('maps every mapped code to a distinct locale key', () => {
    for (const code of [
      'erp-not-configured',
      'erp-unavailable',
      'erp-auth-failed',
      'erp-upstream-failure',
      'erp-malformed-response',
      'erp-bad-request',
      'erp-not-found',
      'erp-conflict',
      'erp-rejected',
      'team-not-found',
      'erp-not-linked',
      'invalid-team-id',
      // The three deliberate platform-side refusals.
      'subscription-not-active',
      'end-date-not-in-future',
      'end-date-not-after-current-end',
      'internal-error',
    ]) {
      expect(adminErrorCopyKey(code)).toBe(`admin-error-${code}`);
    }

    expect(adminErrorCopyKey('not-a-known-code')).toBeNull();
  });

  // The map is only half the contract. A code mapped to a locale key that does
  // not exist renders as the raw key (`admin-error-…`) in the UI, which is the
  // exact "raw token on screen" regression the map exists to prevent. These are
  // asserted against the REAL locale files rather than a stub.
  it.each([
    'subscription-not-active',
    'end-date-not-in-future',
    'end-date-not-after-current-end',
  ])('ships real AR and EN copy for %s', (code) => {
    const key = adminErrorCopyKey(code);

    expect(key).toBe(`admin-error-${code}`);

    for (const bundle of [enLocale, arLocale] as const) {
      const copy = (bundle as Record<string, unknown>)[key as string];

      expect(typeof copy).toBe('string');
      expect(copy as string).not.toBe(key);
      expect((copy as string).trim().length).toBeGreaterThan(0);
    }

    // Arabic and English copy must actually differ (a copy-paste that left the
    // English string in the Arabic bundle would still satisfy the checks above).
    expect((arLocale as Record<string, unknown>)[key as string]).not.toBe(
      (enLocale as Record<string, unknown>)[key as string]
    );
  });

  describe('adminErrorCopy', () => {
    const t = (key: string) => `t:${key}`;

    it('localizes a known code', () => {
      expect(adminErrorCopy('erp-not-configured', t, 'Resolved copy')).toBe(
        't:admin-error-erp-not-configured'
      );
    });

    // Never render a raw token, even for a code this build has not learned yet.
    // `fallback` is already-resolved copy, not a key.
    it('falls back for an unknown code-shaped token', () => {
      expect(adminErrorCopy('some-future-code', t, 'Resolved copy')).toBe(
        'Resolved copy'
      );
    });

    // Routes that still answer with prose must keep rendering it verbatim.
    it.each([
      'Invalid plan ID',
      'Unauthorized',
      'Forbidden',
      'Method POST Not Allowed',
      'Team not found',
    ])('passes human copy through untouched: %s', (value) => {
      expect(adminErrorCopy(value, t, 'Resolved copy')).toBe(value);
    });

    it('falls back when there is no value', () => {
      expect(adminErrorCopy(undefined, t, 'Resolved copy')).toBe(
        'Resolved copy'
      );
      expect(adminErrorCopy(null, t, 'Resolved copy')).toBe('Resolved copy');
      expect(adminErrorCopy('', t, 'Resolved copy')).toBe('Resolved copy');
    });
  });
});
