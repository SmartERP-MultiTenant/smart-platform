// Hermetic ERP stub for the e2e suite (P4.9).
//
// Serves the ERP M2M/billing surface the kit's team-ERP endpoints consume so
// authenticated extend/cancel flows can be exercised deterministically
// without a real (or dev) ERP instance. Managed by Playwright as a second
// webServer entry — starts before tests, is torn down after the run, in CI
// and locally alike.
//
// P5.4: the surface was widened from "extend/cancel only" to the full
// platform-billing contract the `/api/admin/subscriptions/*` routes drive, so
// the ticket's headline acceptance criterion ("every mutation produces an
// audit row — including failed attempts") is provable end-to-end instead of
// only against module-level mocks.
//
// CONTRACT SOURCE OF TRUTH — every route, verb, response envelope and status
// code below mirrors the real controller:
//   SmartAndPro.ERP.Inventory/SmartAndPro.ERP.WebAPI/Controllers/Platform/PlatformBillingController.cs
//     [Route("api/platform/billing")]  [PlatformApiKey]  (class level)
//     GET  subscriptions/by-tenant/{tenantId}              -> Ok(new { subscription })   // null when none
//     POST subscriptions/by-tenant/{tenantId}              -> 404 "Tenant or Package not found." | Ok(...)   // create
//     POST subscriptions/by-tenant/{tenantId}/extend       -> 404 "No active subscription for tenant." | Ok(...)
//     POST subscriptions/by-tenant/{tenantId}/cancel       -> 404 "No active subscription for tenant." | Ok(...)
//     POST subscriptions/by-tenant/{tenantId}/trial-override -> 404 "Tenant not found." | Ok(...)
//
// `status` is a PascalCase STRING (`"Active"`, `"Trial"`, `"Cancelled"`) because
// that is what the platform consumes: `SubscriptionResponseDto.Status` is a
// `string` populated by AutoMapper `.MapFrom(s => s.Status.ToString())`
//   SmartAndPro.ERP.Application/Common/Dtos/Platform/Subscription/SubscriptionResponseDto.cs:12
//   SmartAndPro.ERP.Application/Common/AutoMapper/MappingProfiles.cs:988-989
// and the platform's own types agree (`lib/adminRevenue.ts:8`,
// `components/admin/AdminSubscriptionActions.tsx:240`).
//
// The store is STATEFUL (in-memory, per-process, seeded empty) because the
// platform writes before/after audit snapshots around every mutation: a
// stateless stub that echoed the request back would make `before` and `after`
// identical and the resulting assertions would prove nothing.
//
// DELIBERATE DEVIATIONS — all three disclosed so no assertion below can be
// mistaken for a guarantee about the real ERP:
//
//  1. `extend` auto-provisions. The real controller 404s when the tenant has no
//     live subscription, but the pre-existing
//     `tests/e2e/funnel/teams-erp.spec.ts` (not part of this change) extends a
//     tenant that was never created and asserts a 200. Auto-provisioning keeps
//     that spec green without editing it, and makes the route retry-safe: a
//     retried extend re-provisions instead of 404ing on state the retry did not
//     create. `cancel` and `trial-override` keep the real 404 semantics, which
//     is what lets the admin suite drive a genuine upstream failure.
//  2. `POST` create upserts unconditionally. The real controller resolves the
//     tenant AND the package against its database and answers 404
//     `"Tenant or Package not found."` when either is unknown
//     (PlatformBillingController.cs:62-66 -> SuperAdminService.cs:326). This
//     stub has no tenant/package registry, so it cannot distinguish a known
//     from an unknown tenant; it stores whatever tenant id it is handed. The
//     platform's own create route never depends on that distinction, so the
//     admin suite is unaffected — but nothing here proves the real 404.
//  3. `POST` responses return the stored subscription record, whereas the real
//     controller returns `PlatformActionResponseDto { Message, NewEndDate }`
//     (SmartAndPro.ERP.Application/Common/Dtos/Platform/PlatformActionResponseDto.cs),
//     i.e. an ACTION ACK with no subscription fields. The platform passes the
//     upstream body through verbatim as `data`, so
//     `tests/e2e/admin/admin-subscriptions.spec.ts` can assert `data.tenantId`
//     here but could not against a real ERP. Kept as-is deliberately: reshaping
//     it changes the documented `data` payload of a public admin route, which
//     is a contract decision rather than a test-fixture fix. Flagged in the
//     spec's SCOPE HONESTY block.
//
// Also note: the real `GET .../by-tenant/{tenantId}` serializes the DOMAIN
// ENTITY (`FindActiveSubscriptionAsync` returns `Subscription?`, not a DTO —
// PlatformBillingController.cs:31-40) and the WebAPI registers no
// `JsonStringEnumConverter`, so on the wire `status` is really the ENUM'S
// NUMERIC VALUE (Trial=0, Active=1, Expired=2, Suspended=3, Cancelled=4). The
// stub deliberately emits the STRING form instead: the platform's sanitizer
// keeps only string statuses (`models/adminAuditLog.ts`
// `sanitizeSubscriptionSnapshot`), so a numeric status would make every
// before/after assertion below silently vacuous. This is an upstream contract
// defect, reported rather than encoded.
//
// Unknown routes answer 404 JSON so tests never depend on stub behavior they
// did not ask for (the app treats a 404 like an unreachable ERP).
//
// ---------------------------------------------------------------------------
// PG-55: the PUBLIC payments surface (methods / verify / create)
//
// Until this was added the stub served ONLY the platform-billing surface, so
// every funnel payment test had to put `page.route('**/api/public/erp/verify*')`
// in front of our OWN BFF. That mock short-circuits exactly the chain those
// tests claim to cover: ERP body -> lib/zod/erp.ts contract -> lib/erp.ts ->
// route -> poller. A schema regression, a filter regression or an error-code
// regression was invisible, because the mocked response never passed through
// any of it.
//
// The three routes below close that hole. They are served from
// `tests/fixtures/erp-gateways.json` — the SAME file the jest contract suite
// asserts against — so the stub and the contract tests cannot drift apart.
//
//   GET  /api/payments/methods?country=SA   -> the mixed-availability catalogue
//   GET  /api/payments/verify/{reference}   -> outcome selected by ref PREFIX
//   POST /api/payments                      -> per-gateway paymentUrl
//
// CONTRACT SOURCE OF TRUTH (real controller):
//   SmartAndPro.ERP.Inventory/SmartAndPro.ERP.WebAPI/Controllers/PaymentController.cs
//     GET  /api/payments/methods?country=SA   [AllowAnonymous]
//     GET  /api/payments/verify/{reference}   -> { success, status? }
//     POST /api/payments                      -> { paymentUrl, externalId, ... }
//
// HONESTY — what these fixtures ARE and ARE NOT: they are hand-written from the
// documented contract and each gateway's public host conventions, NOT captured
// from a live ERP. A stub test therefore proves the KIT honours the agreed
// shape against a deterministic server; it does NOT prove the ERP sends that
// shape, and it is NOT a live-gateway test. That leg is blocked on the ERP half
// (PG-10/PG-11/PG-12, real Moyasar credentials). Do not read a green run here
// as gateway verification.
//
// The reference PREFIX is the seam that makes the outcome selectable without
// intercepting the route: `e2e-paid-*` answers Paid, `e2e-malformed-*` answers
// a body the contract rejects, and so on. See `verify.byReferencePrefix`.
// ---------------------------------------------------------------------------
'use strict';

const http = require('http');
const path = require('path');

// Single source of truth, shared with __tests__/contract (PG-55).
const gateways = require(
  path.join(__dirname, '../../fixtures/erp-gateways.json')
);

const HOST = '127.0.0.1';
const PORT = Number(process.env.ERP_STUB_PORT || 4100);

// The real controller resolves a tenant's subscription through
// `FindActiveSubscriptionAsync`, which filters to Active|Trial. Everything
// below reads through the same lens, so `GET` reports `null` for a cancelled
// tenant exactly as the ERP would.
const LIVE_STATUSES = new Set(['Active', 'Trial']);

const DEFAULT_PACKAGE_ID = 'stub-package';
const DEFAULT_PLAN_NAME = 'Stub Plan';
const DEFAULT_PRICE_MONTHLY = 199;
const DEFAULT_DURATION_DAYS = 30;

/** tenantId -> subscription record. Recreated on every stub start. */
const subscriptions = new Map();

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
  });

const parseJsonBody = async (req) => {
  const raw = await readBody(req);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

/** Normalises anything date-shaped to a full ISO instant, or `null`. */
const toIsoInstant = (value) => {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
};

const daysUntil = (endDate) => {
  const ms = Date.parse(endDate);
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil((ms - Date.now()) / 86400000));
};

const addDays = (fromMs, days) =>
  new Date(fromMs + days * 86400000).toISOString();

/** Builds a subscription record shaped like the ERP's subscription DTO. */
const buildSubscription = (tenantId, patch = {}) => {
  const startDate = patch.startDate || new Date().toISOString();
  const endDate =
    patch.endDate || addDays(Date.parse(startDate), DEFAULT_DURATION_DAYS);
  const isTrial = patch.isTrial === true;

  return {
    id: `stub-sub-${tenantId}`,
    tenantId,
    subdomain: `stub-${tenantId}`,
    status: isTrial ? 'Trial' : 'Active',
    startDate,
    endDate,
    isTrial,
    packageId: patch.packageId || DEFAULT_PACKAGE_ID,
    // The platform's `sanitizeSubscriptionSnapshot` reads `planName` or falls
    // back to `package.name`; both are offered so the stub matches the ERP DTO
    // (which includes the Package navigation).
    package: {
      id: patch.packageId || DEFAULT_PACKAGE_ID,
      name: DEFAULT_PLAN_NAME,
    },
    planName: DEFAULT_PLAN_NAME,
    priceMonthly: DEFAULT_PRICE_MONTHLY,
    daysRemaining: daysUntil(endDate),
    trialDays: patch.trialDays ?? null,
  };
};

/** Mirrors `FindActiveSubscriptionAsync`: only Active/Trial tenants resolve. */
const liveSubscription = (tenantId) => {
  const sub = subscriptions.get(tenantId);
  return sub && LIVE_STATUSES.has(sub.status) ? sub : null;
};

const notFoundNoSubscription = (res) =>
  sendJson(res, 404, { error: 'No active subscription for tenant.' });

// The real controller's trial-override 404 is a TENANT lookup
// (`OverrideTrialForTenantAsync` -> null when the tenant row is missing), so it
// answers a different body than extend/cancel, which fail the
// `FindActiveSubscriptionAsync` lookup. PlatformBillingController.cs:103-114.
const notFoundTenant = (res) =>
  sendJson(res, 404, { error: 'Tenant not found.' });

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${HOST}:${PORT}`);
  const method = req.method || 'GET';

  // Health probe for the Playwright webServer entry.
  if (pathname === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // -------------------------------------------------------------------------
  // PG-55 — public payments surface. Additive: the billing routes below are
  // untouched, so every pre-existing spec (admin-subscriptions, teams-erp)
  // keeps its exact expectations.
  // -------------------------------------------------------------------------

  // GET /api/payments/methods?country=SA
  if (pathname === '/api/payments/methods' && method === 'GET') {
    sendJson(res, 200, gateways.methods.catalogue);
    return;
  }

  // GET /api/payments/verify/:reference
  const verifyRoute = pathname.match(/^\/api\/payments\/verify\/(.+)$/);
  if (verifyRoute && method === 'GET') {
    const reference = decodeURIComponent(verifyRoute[1]);
    const prefixes = gateways.verify.byReferencePrefix;
    const matched = Object.keys(prefixes).find((prefix) =>
      reference.startsWith(prefix)
    );
    const outcome = matched ? prefixes[matched] : gateways.verify._default;

    sendJson(res, outcome.status, outcome.body);
    return;
  }

  // POST /api/payments
  if (pathname === '/api/payments' && method === 'POST') {
    const body = await parseJsonBody(req);
    const methodKey =
      typeof body.paymentMethod === 'string' ? body.paymentMethod : '';

    if (methodKey === 'no_redirect') {
      sendJson(res, 200, gateways.createPayment.noUrl);
      return;
    }

    const gatewayResponse = gateways.createPayment.byMethod[methodKey];

    // The real controller resolves the method through `PaymentService` and
    // answers 400 for anything its provider map does not contain.
    if (!gatewayResponse) {
      sendJson(res, 400, gateways.createPayment.unsupportedMethodBody);
      return;
    }

    // Mirrors the ERP's own amount guard so a direct call can exercise the
    // `invalid-amount` mapping. The BFF's zod schema rejects most of these
    // first, which is the point: this is the second line, not the only one.
    if (typeof body.amount !== 'number' || body.amount <= 0) {
      sendJson(res, 400, gateways.createPayment.amountErrorBody);
      return;
    }

    sendJson(res, 200, gatewayResponse);
    return;
  }

  // GET|POST /api/platform/billing/subscriptions/by-tenant/:tenantId
  const collectionRoute = pathname.match(
    /^\/api\/platform\/billing\/subscriptions\/by-tenant\/([^/]+)$/
  );
  if (collectionRoute) {
    const tenantId = decodeURIComponent(collectionRoute[1]);

    if (method === 'GET') {
      sendJson(res, 200, { subscription: liveSubscription(tenantId) });
      return;
    }

    if (method === 'POST') {
      const body = await parseJsonBody(req);
      const current = subscriptions.get(tenantId);
      const record = buildSubscription(tenantId, {
        packageId: body.packageId || current?.packageId,
        startDate: toIsoInstant(body.startDate) || current?.startDate,
        endDate: toIsoInstant(body.endDate) || current?.endDate,
        isTrial: body.isTrial === true,
        trialDays: body.trialDays,
      });

      subscriptions.set(tenantId, record);
      sendJson(res, 200, record);
      return;
    }

    res.writeHead(405, {
      'Content-Type': 'application/json',
      Allow: 'GET, POST',
    });
    res.end(
      JSON.stringify({ error: `stub:method-not-allowed ${method} ${pathname}` })
    );
    return;
  }

  // POST /api/platform/billing/subscriptions/by-tenant/:tenantId/(extend|cancel|trial-override)
  const actionRoute = pathname.match(
    /^\/api\/platform\/billing\/subscriptions\/by-tenant\/([^/]+)\/(extend|cancel|trial-override)$/
  );
  if (actionRoute && method === 'POST') {
    const tenantId = decodeURIComponent(actionRoute[1]);
    const action = actionRoute[2];
    const body = await parseJsonBody(req);
    const current = liveSubscription(tenantId);

    if (action === 'extend') {
      // Deliberate leniency — see "DELIBERATE DEVIATION" in the file header.
      const base = current || buildSubscription(tenantId);
      const newEndDate =
        toIsoInstant(body.newEndDate) ||
        addDays(Date.now(), DEFAULT_DURATION_DAYS);
      const record = {
        ...base,
        endDate: newEndDate,
        daysRemaining: daysUntil(newEndDate),
      };

      subscriptions.set(tenantId, record);
      sendJson(res, 200, record);
      return;
    }

    // cancel + trial-override keep the real controller's 404 semantics, each
    // with its own body (see notFoundTenant above).
    if (!current) {
      if (action === 'trial-override') {
        notFoundTenant(res);
        return;
      }

      notFoundNoSubscription(res);
      return;
    }

    if (action === 'cancel') {
      const record = { ...current, status: 'Cancelled', daysRemaining: 0 };

      subscriptions.set(tenantId, record);
      sendJson(res, 200, record);
      return;
    }

    const newTrialEndDate =
      toIsoInstant(body.newTrialEndDate) ||
      addDays(Date.now(), DEFAULT_DURATION_DAYS);
    const record = {
      ...current,
      status: 'Trial',
      isTrial: true,
      endDate: newTrialEndDate,
      daysRemaining: daysUntil(newTrialEndDate),
    };

    subscriptions.set(tenantId, record);
    sendJson(res, 200, record);
    return;
  }

  sendJson(res, 404, {
    success: false,
    message: `stub:no-route ${method} ${pathname}`,
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[erp-stub] listening on http://${HOST}:${PORT}`);
});
