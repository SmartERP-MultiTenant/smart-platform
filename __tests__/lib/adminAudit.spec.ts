import { recordAdminAudit } from '@/lib/adminAudit';
import { prisma } from '@/lib/prisma';
import {
  AUDIT_OMITTED,
  AUDIT_REDACTED,
  completeAdminAudit,
  createAdminAuditStart,
  failAdminAudit,
  getAdminAuditLogs,
  isSensitiveAuditKey,
  normalizeSubscriptionStatus,
  redactAuditPayload,
  sanitizeSubscriptionSnapshot,
} from 'models/adminAuditLog';

// The audit store is exercised against a mocked Prisma delegate rather than a
// mocked audit module on purpose: the regressions this file pins (a hardcoded
// `logId: null` that made the terminal UPDATE unreachable, and a read path that
// faked an empty page) all lived *inside* `models/adminAuditLog.ts`. Mocking the
// module would have hidden every one of them.
jest.mock('@/lib/prisma', () => {
  const prisma = {
    adminAuditLog: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  return { prisma };
});

const createMock = prisma.adminAuditLog.create as unknown as jest.Mock;
const updateMock = prisma.adminAuditLog.update as unknown as jest.Mock;
const findUniqueMock = prisma.adminAuditLog.findUnique as unknown as jest.Mock;
const findManyMock = prisma.adminAuditLog.findMany as unknown as jest.Mock;
const countMock = prisma.adminAuditLog.count as unknown as jest.Mock;

const actor = {
  id: 'admin-1',
  email: 'admin@platform.test',
  name: 'Platform Admin',
};

/** The exact object a caller gets back when the audit store rejects a write. */
const LOG_ID = 'audit-log-1';

/** Data bag handed to `prisma.adminAuditLog.create` on the Nth call. */
const createData = (call = 0) => createMock.mock.calls[call][0].data;

/** Data bag handed to `prisma.adminAuditLog.update` on the Nth call. */
const updateData = (call = 0) => updateMock.mock.calls[call][0].data;

describe('admin audit store — sanitization & redaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Redaction legitimately warns whenever it drops a key; that is asserted
    // behaviour elsewhere, but it would drown the report here.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.warn as unknown as jest.Mock).mockRestore();
  });

  describe('sanitizeSubscriptionSnapshot (whitelist)', () => {
    it('keeps only the whitelisted subscription fields and drops every credential', () => {
      const snapshot = sanitizeSubscriptionSnapshot({
        subscription: {
          tenantId: 'tenant-1',
          subdomain: 'acme',
          status: 'active',
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-12-31T00:00:00Z',
          planName: 'Growth',
          priceMonthly: 499,
          isTrial: false,
          daysRemaining: 120,
          // Everything below must never reach an audit row.
          erpAccessToken: 'ERP-TOKEN-LEAK',
          password: 'PASSWORD-LEAK',
          'X-Platform-ApiKey': 'M2M-KEY-LEAK',
          Authorization: 'Bearer AUTH-LEAK',
          headers: { cookie: 'COOKIE-LEAK' },
          rawBody: { upstream: 'RAW-BODY-LEAK' },
        },
      });

      expect(snapshot).toEqual({
        tenantId: 'tenant-1',
        subdomain: 'acme',
        status: 'active',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-12-31T00:00:00Z',
        planName: 'Growth',
        priceMonthly: 499,
        isTrial: false,
        daysRemaining: 120,
      });

      // Belt and braces: no sensitive VALUE may survive anywhere in the result.
      const serialized = JSON.stringify(snapshot);
      for (const leak of [
        'ERP-TOKEN-LEAK',
        'PASSWORD-LEAK',
        'M2M-KEY-LEAK',
        'AUTH-LEAK',
        'COOKIE-LEAK',
        'RAW-BODY-LEAK',
      ]) {
        expect(serialized).not.toContain(leak);
      }
    });

    it('reads the nested `subscription` envelope but also accepts a flat object', () => {
      expect(sanitizeSubscriptionSnapshot({ status: 'trial' })).toMatchObject({
        status: 'trial',
      });
      expect(
        sanitizeSubscriptionSnapshot({ subscription: { status: 'trial' } })
      ).toMatchObject({ status: 'trial' });
    });

    it('falls back to `package.name` for the plan name', () => {
      expect(
        sanitizeSubscriptionSnapshot({ package: { name: 'Starter' } })
      ).toMatchObject({ planName: 'Starter' });
    });

    it('omits fields that are absent or of the wrong type', () => {
      const snapshot = sanitizeSubscriptionSnapshot({
        status: {},
        priceMonthly: '499',
      });

      // `status` is deliberately NOT `123` here. A number is the ERP's real
      // representation and is normalised rather than rejected (see the
      // `normalizeSubscriptionStatus` group below), so `123` would assert the
      // opposite of the shipping behaviour. An object is not a status
      // representation in any form, so it is the honest wrong-type case.
      expect(snapshot?.status).toBeUndefined();
      expect(snapshot?.priceMonthly).toBeUndefined();
      expect(snapshot?.planName).toBeUndefined();
    });

    it('returns null for non-object input', () => {
      expect(sanitizeSubscriptionSnapshot(null)).toBeNull();
      expect(sanitizeSubscriptionSnapshot(undefined)).toBeNull();
      expect(sanitizeSubscriptionSnapshot('active')).toBeNull();
    });
  });

  describe('normalizeSubscriptionStatus — the ERP sends the enum ordinal', () => {
    // Why this group exists: `GET /platform/billing/subscriptions/by-tenant/
    // {tenantId}` returns the raw domain entity (it bypasses AutoMapper) and the
    // WebAPI registers no `JsonStringEnumConverter`, so `status` arrives as a
    // NUMBER rather than a name. The whitelist used to require a string, which
    // silently dropped `status` from every before/after snapshot AND made
    // `cancel.ts`'s `subscription-not-active` pre-check unreachable against a
    // real ERP. Ordinals verified against the ERP C#
    // (`Domains/Entities/Platform/Subscription.cs`): Trial=0, Active=1,
    // Expired=2, Suspended=3, Cancelled=4.
    it.each([
      [0, 'Trial'],
      [1, 'Active'],
      [2, 'Expired'],
      [3, 'Suspended'],
      [4, 'Cancelled'],
    ])('maps ordinal %i to its enum member name %s', (ordinal, expected) => {
      expect(normalizeSubscriptionStatus(ordinal)).toBe(expected);
    });

    it('does not treat ordinal 0 (Trial) as absent', () => {
      // The truthiness trap: `if (status)` or `status || …` would discard
      // `Trial` — the status every new tenant starts in, and therefore the most
      // consequential one to lose. Asserted directly as well as through the
      // sanitizer so a refactor that reintroduces a truthiness check fails
      // here rather than silently in production.
      expect(normalizeSubscriptionStatus(0)).toBe('Trial');
      expect(normalizeSubscriptionStatus(0)).not.toBeUndefined();

      expect(
        sanitizeSubscriptionSnapshot({ subscription: { status: 0 } })?.status
      ).toBe('Trial');
    });

    it('keeps an unrecognised ordinal nameable instead of silently absent', () => {
      // "The ERP reported a status we cannot name" and "the ERP reported no
      // status" are different facts; collapsing them is the defect this
      // normalisation exists to fix. This case also fails loudly if the ERP
      // enum GROWS: a sixth member would make `normalizeSubscriptionStatus(5)`
      // return that member's name and break the `Unknown(5)` expectation.
      expect(normalizeSubscriptionStatus(5)).toBe('Unknown(5)');
      expect(normalizeSubscriptionStatus(99)).toBe('Unknown(99)');
      expect(normalizeSubscriptionStatus(-1)).toBe('Unknown(-1)');
      expect(normalizeSubscriptionStatus(1.5)).toBe('Unknown(1.5)');
      expect(normalizeSubscriptionStatus(Number.MAX_SAFE_INTEGER)).toBe(
        `Unknown(${Number.MAX_SAFE_INTEGER})`
      );
    });

    it('passes every string status through completely untouched', () => {
      // The e2e stub and any future string-enum ERP send strings. This path
      // must not trim, case-fold or otherwise rewrite the value: `cancel.ts`
      // lowercases it itself, and an exact comparison against `'Active'` has to
      // keep working.
      for (const value of [
        'active',
        'Active',
        'TRIAL',
        'Expired',
        'Suspended',
        'Cancelled',
        '  Active  ',
        '',
      ]) {
        expect(normalizeSubscriptionStatus(value)).toBe(value);
      }
    });

    it('drops values that are not a status representation at all', () => {
      for (const value of [
        {},
        [],
        true,
        false,
        null,
        undefined,
        NaN,
        Infinity,
        -Infinity,
      ]) {
        expect(normalizeSubscriptionStatus(value)).toBeUndefined();
      }
    });

    it('leaves the other whitelisted fields intact when status is an ordinal', () => {
      const snapshot = sanitizeSubscriptionSnapshot({
        subscription: {
          tenantId: 'erp-tenant-1',
          status: 1,
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2027-01-01T00:00:00Z',
          planName: 'Growth',
          priceMonthly: 499,
          isTrial: false,
          daysRemaining: 30,
          erpAccessToken: 'MUST-NOT-SURVIVE',
        },
      });

      expect(snapshot).toMatchObject({
        tenantId: 'erp-tenant-1',
        status: 'Active',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2027-01-01T00:00:00Z',
        planName: 'Growth',
        priceMonthly: 499,
        isTrial: false,
        daysRemaining: 30,
      });
      expect(JSON.stringify(snapshot)).not.toContain('MUST-NOT-SURVIVE');
    });
  });

  describe('isSensitiveAuditKey (name normalisation)', () => {
    it.each([
      'erpAccessToken',
      'access_token',
      'X-Platform-ApiKey',
      'apiKey',
      'Authorization',
      'password',
      'clientSecret',
      'refreshToken',
      'idToken',
      'privateKey',
      'signature',
      'token',
      'headers',
      'credentials',
    ])('flags %s as sensitive', (key) => {
      expect(isSensitiveAuditKey(key)).toBe(true);
    });

    // Regression group for the cookie-header spellings. `Set-Cookie` normalises
    // to `setcookie`, which the exact-key set (`cookie`/`cookies`) did NOT
    // match — a `Set-Cookie` value was persisted verbatim while the JSDoc on
    // `isSensitiveAuditKey` claimed the case was covered. The `cookie` fragment
    // now catches every spelling. A cookie value is a live session credential,
    // so this list is deliberately exhaustive rather than a single case.
    it.each([
      'Set-Cookie',
      'set-cookie',
      'SetCookie',
      'setcookie',
      'cookie',
      'cookies',
      'Cookie',
      'COOKIES',
      'responseSetCookie',
    ])('redacts the cookie-header spelling %s', (key) => {
      expect(isSensitiveAuditKey(key)).toBe(true);
    });

    it.each([
      'actorEmail',
      'actorName',
      'targetId',
      'targetType',
      'packageId',
      'systemModuleIds',
      'newEndDate',
      'beforeFetchError',
      'status',
      'daysRemaining',
    ])('leaves %s alone', (key) => {
      expect(isSensitiveAuditKey(key)).toBe(false);
    });
  });

  describe('redactAuditPayload (write-boundary choke point)', () => {
    it('drops a Set-Cookie header at the write boundary, not just by key name', () => {
      const redacted = redactAuditPayload({
        headers: { 'Set-Cookie': 'session=LEAK' },
        'Set-Cookie': 'LEAK-2',
        setCookie: 'LEAK-3',
        keep: 'visible',
      });

      expect(redacted).toEqual({ keep: 'visible' });

      const serialized = JSON.stringify(redacted);
      expect(serialized).not.toContain('LEAK');
    });

    it('drops credential keys at every depth while keeping safe neighbours', () => {
      const redacted = redactAuditPayload({
        token: 'TOP-LEVEL-LEAK',
        nested: {
          erpAccessToken: 'NESTED-LEAK',
          safe: 'kept',
          deeper: { Authorization: 'DEEP-LEAK', fine: 'also-kept' },
        },
        list: [{ password: 'ARRAY-LEAK' }, { fine: 'list-kept' }],
      });

      expect(redacted).toEqual({
        nested: {
          safe: 'kept',
          deeper: { fine: 'also-kept' },
        },
        list: [{}, { fine: 'list-kept' }],
      });

      const serialized = JSON.stringify(redacted);
      for (const leak of [
        'TOP-LEVEL-LEAK',
        'NESTED-LEAK',
        'DEEP-LEAK',
        'ARRAY-LEAK',
      ]) {
        expect(serialized).not.toContain(leak);
      }
    });

    it('replaces (does not persist) opaque binary payloads', () => {
      const redacted = redactAuditPayload({
        receipt: Buffer.from('binary-receipt'),
        kept: 'ok',
      });

      expect(redacted?.receipt).toBe(AUDIT_REDACTED);
      expect(redacted?.kept).toBe('ok');
    });

    it('normalises Date values to ISO strings so the JSONB column stays valid', () => {
      const when = new Date('2026-05-01T10:00:00.000Z');
      expect(redactAuditPayload({ when })?.when).toBe(
        '2026-05-01T10:00:00.000Z'
      );
    });

    it('clamps long strings rather than storing unbounded upstream bodies', () => {
      const long = 'x'.repeat(2000);
      const clamped = redactAuditPayload({ body: long })?.body as string;

      expect(clamped.length).toBeLessThan(2000);
      expect(clamped.endsWith('…')).toBe(true);
    });

    it('stops descending past the depth limit', () => {
      const redacted = redactAuditPayload({
        l1: { l2: { l3: { l4: { l5: { l6: { l7: 'too-deep' } } } } } },
      }) as any;

      expect(redacted.l1.l2.l3.l4.l5.l6).toBe(AUDIT_REDACTED);
      expect(JSON.stringify(redacted)).not.toContain('too-deep');
    });

    it('announces array truncation instead of dropping evidence silently', () => {
      const redacted = redactAuditPayload({
        items: Array.from({ length: 55 }, (_, i) => i),
      }) as any;

      expect(redacted.items).toHaveLength(51);
      expect(redacted.items[50]).toContain('5 more item(s) omitted');
    });

    it('announces key truncation on very wide objects', () => {
      const wide: Record<string, number> = {};
      for (let i = 0; i < 55; i += 1) wide[`field${i}`] = i;

      const redacted = redactAuditPayload(wide) as any;

      expect(redacted.__truncated).toBe('5 key(s) omitted');
    });

    it('handles null, primitives and root arrays without throwing', () => {
      expect(redactAuditPayload(null)).toBeNull();
      expect(redactAuditPayload(undefined)).toBeNull();
      expect(redactAuditPayload('hello')).toEqual({ value: 'hello' });
      expect(redactAuditPayload([1, 2])).toEqual({ items: [1, 2] });
    });

    it('is idempotent — re-redacting a stored payload changes nothing', () => {
      const once = redactAuditPayload({
        erpAccessToken: 'LEAK',
        kept: { nested: 'value' },
      });

      expect(redactAuditPayload(once)).toEqual(once);
    });

    // ------------------------------------------------------------------
    // Value scrubbing. Key matching alone cannot cover a credential riding
    // inside a VALUE under an innocuous key — which is live, not theoretical:
    // the users routes persist `reason: error.message`.
    // ------------------------------------------------------------------

    it('redacts a Bearer credential embedded in a value under an innocuous key', () => {
      const token = 'eyJhbGciOiJIUzI1NiJ9.PAYLOAD.SIGNATURE';
      const redacted = redactAuditPayload({
        note: `upstream rejected the token Bearer ${token}`,
      })?.note as string;

      expect(redacted).not.toContain(token);
      // The scheme name survives so a reader knows what KIND of credential was
      // present, and the surrounding sentence survives as context.
      expect(redacted).toContain('Bearer [redacted]');
      expect(redacted).toContain('upstream rejected');
    });

    it('redacts only the password of a DSN, keeping host and database as evidence', () => {
      const password = 's3cr3tPassw0rd';
      const redacted = redactAuditPayload({
        note: `connect failed for postgresql://audit_user:${password}@db.internal:5432/saas`,
      })?.note as string;

      expect(redacted).not.toContain(password);
      // An audit row saying "an error happened" is far less useful to an
      // investigator than one that names the host and database it happened
      // against.
      expect(redacted).toContain(
        'postgresql://audit_user:[redacted]@db.internal:5432/saas'
      );
    });

    it('scrubs BEFORE clamping, so a secret straddling the clamp bound cannot survive in part', () => {
      const token = 'Zq3xT9vLm2Pk7Rw4Bd6Nh1Yc8Fs5Jg0';
      // 479 characters of filler pushes the credential up against the
      // 512-character clamp, where a clamp-first implementation would keep a
      // usable prefix of it. Scrub-first removes it and still clamps.
      //
      // The filler is separated from the scheme by a SPACE, and the token from
      // the trailing filler by another: the credential rules match a maximal
      // non-whitespace run and anchor on `\b`. Filler glued directly onto
      // `Bearer` would sit between two word characters, so `\b` would not
      // match at all — a genuine (if minor, and separately reported) coverage
      // gap in `scrubAuthSchemes` that this test deliberately does not encode
      // as expected behaviour.
      const value = `${'a'.repeat(479)} Bearer ${token} ${'b'.repeat(200)}`;

      const redacted = redactAuditPayload({ note: value })?.note as string;

      expect(redacted).toContain('Bearer [redacted]');
      expect(redacted).not.toContain(token);
      // What a clamp-first implementation would have left behind.
      expect(redacted).not.toContain('Bearer Zq3xT9');
      // Still clamped — the clamp was ordered, not skipped.
      expect(redacted.endsWith('…')).toBe(true);
    });

    // ------------------------------------------------------------------
    // Counter-tests. This is the half that stops a future "harden the
    // scrubber" change from silently destroying the evidence the store exists
    // to keep. If one of these fails, redaction has become stricter than the
    // denylist and real audit content is being lost.
    // ------------------------------------------------------------------

    it.each([
      '2026-05-01T10:00:00.000Z',
      '2026-10-01T00:00:00.000+03:00',
      '7f28d97c-1b2e-4f3a-9c8d-0e1f2a3b4c5d',
      'end-date-not-after-current-end',
      'erp-not-found',
      'ERP_502',
      'subscription.extend',
      'Admin manual cancellation',
      'The ERP returned 503 and the subscription was not extended.',
    ])('preserves audit evidence byte-identical: %s', (value) => {
      expect(redactAuditPayload({ value })?.value).toBe(value);
    });

    // ------------------------------------------------------------------
    // Redaction hardening added alongside the value scrub.
    // ------------------------------------------------------------------

    it('catches a fullwidth homoglyph credential key', () => {
      expect(isSensitiveAuditKey('Ａuthorization')).toBe(true);

      const redacted = redactAuditPayload({
        Ａuthorization: 'Bearer LEAKLEAKLEAKLEAK',
        kept: 'visible',
      });

      expect(redacted).toEqual({ kept: 'visible' });
      expect(JSON.stringify(redacted)).not.toContain('LEAKLEAKLEAKLEAK');
    });

    it('never persists a credential handed over as raw bytes', () => {
      const redacted = redactAuditPayload({
        receipt: new Uint8Array([1, 2, 3, 4]),
        view: new DataView(new ArrayBuffer(8)),
        raw: new ArrayBuffer(8),
        kept: 'ok',
      });

      // Without the `ArrayBuffer.isView` / `ArrayBuffer` branch these serialize
      // as `{"0":byte,"1":byte,…}` — a credential in directly decodable form,
      // under a key the denylist would never see.
      expect(redacted?.receipt).toBe(AUDIT_REDACTED);
      expect(redacted?.view).toBe(AUDIT_REDACTED);
      expect(redacted?.raw).toBe(AUDIT_REDACTED);
      expect(redacted?.kept).toBe('ok');
    });

    it('announces dropped Map/Set evidence instead of persisting a silent {}', () => {
      const redacted = redactAuditPayload({
        map: new Map([['secret', 'LEAK-IN-MAP']]),
        set: new Set(['LEAK-IN-SET']),
        kept: 'ok',
      });

      // A marker distinct from `[redacted]`: this is not "a secret was here",
      // it is "evidence was here that this store cannot represent". Losing it
      // silently is the one outcome an audit store must not produce.
      expect(redacted?.map).toBe(`${AUDIT_OMITTED} Map`);
      expect(redacted?.set).toBe(`${AUDIT_OMITTED} Set`);
      expect(redacted?.kept).toBe('ok');

      const serialized = JSON.stringify(redacted);
      expect(serialized).not.toContain('LEAK-IN-MAP');
      expect(serialized).not.toContain('LEAK-IN-SET');
      expect(redacted).not.toEqual({ kept: 'ok' });
    });
  });

  describe('redaction is enforced by the store, not by call sites', () => {
    it('redacts metadata even when a caller passes a raw, unsanitized object', async () => {
      createMock.mockResolvedValue({ id: LOG_ID });

      await createAdminAuditStart({
        actor,
        action: 'subscription.create',
        targetType: 'tenant',
        targetId: 'tenant-1',
        metadata: {
          packageId: 'pkg-1',
          erpAccessToken: 'CALLER-LEAK',
          nested: { password: 'CALLER-NESTED-LEAK', ok: 'yes' },
        },
      });

      const persisted = createData().metadata;

      expect(persisted).toMatchObject({
        packageId: 'pkg-1',
        nested: { ok: 'yes' },
      });
      expect(persisted.erpAccessToken).toBeUndefined();
      expect(persisted.nested.password).toBeUndefined();
      expect(JSON.stringify(persisted)).not.toContain('CALLER-LEAK');
      expect(JSON.stringify(persisted)).not.toContain('CALLER-NESTED-LEAK');
    });

    it('redacts the `before` snapshot written by the STARTED insert', async () => {
      createMock.mockResolvedValue({ id: LOG_ID });

      await createAdminAuditStart({
        actor,
        action: 'subscription.create',
        targetType: 'tenant',
        targetId: 'tenant-1',
        before: {
          status: 'active',
          erpAccessToken: 'BEFORE-LEAK',
        },
      });

      expect(createData().before).toMatchObject({ status: 'active' });
      expect(createData().before.erpAccessToken).toBeUndefined();
      expect(JSON.stringify(createData().before)).not.toContain('BEFORE-LEAK');
    });
  });
});

describe('admin audit store — STARTED → terminal lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createMock.mockResolvedValue({ id: LOG_ID });
    updateMock.mockResolvedValue({ id: LOG_ID });
  });

  it('createAdminAuditStart inserts a STARTED row and returns its id', async () => {
    const logId = await createAdminAuditStart({
      actor,
      action: 'subscription.extend',
      targetType: 'tenant',
      targetId: 'erp-tenant-1',
    });

    expect(logId).toBe(LOG_ID);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();

    expect(createData()).toMatchObject({
      actorId: actor.id,
      actorEmail: actor.email,
      actorName: actor.name,
      action: 'subscription.extend',
      targetType: 'tenant',
      targetId: 'erp-tenant-1',
      status: 'STARTED',
    });
  });

  it('completeAdminAudit UPDATEs the SAME row instead of inserting a second one', async () => {
    await completeAdminAudit({
      logId: LOG_ID,
      actor,
      action: 'subscription.extend',
      targetType: 'tenant',
      targetId: 'erp-tenant-1',
      after: { status: 'active', endDate: '2027-01-01T00:00:00Z' },
    });

    // This is the regression: a hardcoded `logId: null` used to send every
    // completion down the insert branch, leaving one phantom STARTED row plus
    // one detached SUCCEEDED row for a single operator action.
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock.mock.calls[0][0].where).toEqual({ id: LOG_ID });
    expect(updateData()).toMatchObject({ status: 'SUCCEEDED' });
    expect(updateData().after).toMatchObject({ status: 'active' });
  });

  it('failAdminAudit UPDATEs the SAME row and records a bounded errorCode', async () => {
    await failAdminAudit({
      logId: LOG_ID,
      actor,
      action: 'subscription.cancel',
      targetType: 'tenant',
      targetId: 'erp-tenant-1',
      errorCode: 'ERP_502',
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
    expect(updateData()).toMatchObject({
      status: 'FAILED',
      errorCode: 'ERP_502',
    });
  });

  it('does not silently pretend to update when the caller has no logId', async () => {
    // A standalone terminal event is legitimate, but it must be an explicit
    // INSERT — never an update that quietly matches nothing.
    await completeAdminAudit({
      logId: null,
      actor,
      action: 'user.enable',
      targetType: 'user',
      targetId: 'user-1',
    });

    expect(updateMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createData()).toMatchObject({ status: 'SUCCEEDED' });
  });

  it('merges terminal metadata over the STARTED metadata instead of clobbering it', async () => {
    findUniqueMock.mockResolvedValue({
      metadata: { targetUserEmail: 'target@example.test', keptFromStart: true },
    });

    await completeAdminAudit({
      logId: LOG_ID,
      actor,
      action: 'subscription.extend',
      targetType: 'tenant',
      targetId: 'erp-tenant-1',
      metadata: { completionMarker: 'done' },
    });

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: LOG_ID },
      select: { metadata: true },
    });
    expect(updateData().metadata).toMatchObject({
      targetUserEmail: 'target@example.test',
      keptFromStart: true,
      completionMarker: 'done',
    });
  });

  it('fails the STARTED row as FAILED while preserving the before-state captured at STARTED', async () => {
    // Drives the two-phase helpers directly. This pins STARTED→FAILED
    // resolution and the "before is written once, at STARTED" rule. The
    // failed-ERP path end to end lives in the admin-route spec.
    const logId = await createAdminAuditStart({
      actor,
      action: 'subscription.create',
      targetType: 'tenant',
      targetId: 'erp-tenant-1',
      before: { status: 'expired' },
    });

    await failAdminAudit({
      logId,
      actor,
      action: 'subscription.create',
      targetType: 'tenant',
      targetId: 'erp-tenant-1',
      errorCode: 'erp-upstream-failure',
    });

    // Exactly one row was created and exactly one row was resolved.
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0].where).toEqual({ id: LOG_ID });
    expect(updateData()).toMatchObject({
      status: 'FAILED',
      errorCode: 'erp-upstream-failure',
    });

    // `before` is written once at STARTED and must not be rewritten/erased.
    expect(createData().before).toMatchObject({ status: 'expired' });
    expect(updateData().before).toBeUndefined();
  });

  it('keeps audit writes non-fatal when the store rejects them', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    createMock.mockRejectedValue(new Error('audit store down'));

    await expect(
      createAdminAuditStart({
        actor,
        action: 'subscription.create',
        targetType: 'tenant',
        targetId: 'erp-tenant-1',
      })
    ).resolves.toBeNull();

    // Loud, not silent: the operator's mutation is protected but the failure
    // must be visible in the logs.
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

describe('recordAdminAudit seam', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createMock.mockResolvedValue({ id: LOG_ID });
    updateMock.mockResolvedValue({ id: LOG_ID });
  });

  it('returns the STARTED row id', async () => {
    await expect(
      recordAdminAudit({
        actor,
        action: 'subscription.create',
        targetType: 'tenant',
        targetId: 'erp-tenant-1',
        status: 'STARTED',
      })
    ).resolves.toBe(LOG_ID);
  });

  it('threads a returned logId into the terminal call so one operation is one row', async () => {
    const logId = await recordAdminAudit({
      actor,
      action: 'subscription.create',
      targetType: 'tenant',
      targetId: 'erp-tenant-1',
      status: 'STARTED',
    });

    await recordAdminAudit({
      actor,
      action: 'subscription.create',
      targetType: 'tenant',
      targetId: 'erp-tenant-1',
      status: 'SUCCEEDED',
      logId,
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0].where).toEqual({ id: LOG_ID });
  });

  it('resolves a FAILED terminal event on the STARTED row', async () => {
    await recordAdminAudit({
      actor,
      action: 'subscription.cancel',
      targetType: 'tenant',
      targetId: 'erp-tenant-1',
      status: 'FAILED',
      logId: LOG_ID,
      errorCode: 'erp-unavailable',
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
    expect(updateData()).toMatchObject({
      status: 'FAILED',
      errorCode: 'erp-unavailable',
    });
  });

  it('persists targetUserEmail instead of silently dropping it', async () => {
    await recordAdminAudit({
      actor,
      action: 'user.disable',
      status: 'SUCCEEDED',
      targetUserId: 'user-9',
      targetUserEmail: 'user9@example.test',
    });

    expect(createData().metadata).toMatchObject({
      targetUserEmail: 'user9@example.test',
      targetUserId: 'user-9',
    });
  });

  it('defaults a missing errorCode to a bounded token', async () => {
    await recordAdminAudit({
      actor,
      action: 'user.lock',
      status: 'FAILED',
      targetUserId: 'user-9',
    });

    expect(createData().errorCode).toBe('UNKNOWN_ERROR');
  });

  it('never throws into the caller when the store fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    createMock.mockRejectedValue(new Error('audit store down'));

    await expect(
      recordAdminAudit({
        actor,
        action: 'subscription.extend',
        targetType: 'tenant',
        targetId: 'erp-tenant-1',
        status: 'STARTED',
      })
    ).resolves.toBeNull();

    errorSpy.mockRestore();
  });
});

describe('getAdminAuditLogs (read path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('propagates a store failure instead of returning a fake empty page', async () => {
    // The original defect returned `{ items: [], total: 0 }` on error, so a
    // broken audit store rendered as a healthy, empty table with HTTP 200.
    findManyMock.mockRejectedValue(
      new Error('column "actorEmail" does not exist')
    );

    await expect(getAdminAuditLogs({ page: 1, limit: 20 })).rejects.toThrow(
      /actorEmail/
    );

    // The caller must be able to answer 5xx — never a 200 with no history.
    await expect(
      getAdminAuditLogs({ page: 1, limit: 20 })
    ).rejects.toBeInstanceOf(Error);
  });

  it('returns the paginated envelope the audit-logs route serialises', async () => {
    const items = [{ id: 'a-1' }, { id: 'a-2' }];
    findManyMock.mockResolvedValue(items);
    countMock.mockResolvedValue(5);

    await expect(getAdminAuditLogs({ page: 2, limit: 2 })).resolves.toEqual({
      items,
      total: 5,
      page: 2,
      limit: 2,
      hasMore: true,
    });

    expect(findManyMock).toHaveBeenCalledWith({
      where: {},
      // Two keys, not one: `createdAt` alone is not a total order — see the
      // dedicated tiebreak case below.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 2,
      take: 2,
    });
  });

  it('breaks createdAt ties on the primary key so pagination cannot repeat or skip rows', async () => {
    // `createdAt` is TIMESTAMP(3), so rows written in a burst share a
    // millisecond — `pages/api/admin/users/[id]/index.ts` writes one row per
    // intended action in a tight loop. Ordering on `createdAt` alone leaves
    // ties in an order Postgres may choose differently per query, so a row can
    // appear on two pages or on none. `id` is unique, which makes the sort
    // total. Losing this tiebreak is a silent evidence-integrity regression, so
    // it is pinned as its own case rather than as a field of the envelope test.
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);

    await getAdminAuditLogs({ page: 1, limit: 20 });

    const { orderBy } = findManyMock.mock.calls[0][0];

    expect(Array.isArray(orderBy)).toBe(true);
    expect(orderBy).toHaveLength(2);
    expect(orderBy[0]).toEqual({ createdAt: 'desc' });
    // The tiebreak must be the unique column, not another non-unique one —
    // `targetId` (for example) would leave same-tenant bursts unstable.
    expect(orderBy[1]).toEqual({ id: 'desc' });
  });

  it('reports hasMore false on the last page', async () => {
    findManyMock.mockResolvedValue([{ id: 'a-3' }]);
    countMock.mockResolvedValue(3);

    await expect(
      getAdminAuditLogs({ page: 2, limit: 2 })
    ).resolves.toMatchObject({ hasMore: false });
  });

  it('applies the target and action filters to both the page and the count', async () => {
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);

    await getAdminAuditLogs({
      page: 1,
      limit: 20,
      targetType: 'tenant',
      targetId: 'erp-tenant-1',
      action: 'subscription.cancel',
    });

    const expectedWhere = {
      targetType: 'tenant',
      targetId: 'erp-tenant-1',
      action: 'subscription.cancel',
    };

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
    expect(countMock).toHaveBeenCalledWith({ where: expectedWhere });
  });
});
