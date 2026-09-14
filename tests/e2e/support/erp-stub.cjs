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
'use strict';

const http = require('http');

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

// ---------------------------------------------------------------------------
// P5.6 — rules / permissions fixtures.
//
// Mirrors the two reads the platform's `/api/admin/rules` route performs
// (`lib/erp.ts:539` getSystemModulesM2M, `:544` getPackagesM2M) and the two
// writes its `/api/admin/rules/{plans/[planId],sync}` routes perform.
//
// WHY A DECLARED STORE RATHER THAN ECHOED INPUT: the platform's toggle flow is
// read-modify-write — the matrix GETs the packages, flips one module, and PUTs
// the resulting id list. A stub that echoed the request body back would make
// "the change persisted" unfalsifiable, because the GET after the PUT would
// return whatever it was last handed rather than what was stored. The map below
// is therefore real state, seeded to a KNOWN shape and mutated in place, so
// `rules-matrix.spec.ts` can assert that a toggle survives a page reload.
//
// Module ids are UUID-shaped because `pages/api/admin/rules/plans/[planId].ts`
// validates `systemModuleIds` with `z.array(z.string().uuid(...))` — a
// non-UUID fixture would be rejected by the route before the ERP is called and
// the test would pass for the wrong reason.
//
// Seeded enabled sets are deliberately ASYMMETRIC (Basic lacks Inventory and
// Point of Sale) so the toggle test has a genuinely-disabled module on a known
// plan instead of depending on which plan happens to render first.
const SALES_MODULE_ID = '11111111-1111-4111-8111-111111111111';
const INVENTORY_MODULE_ID = '22222222-2222-4222-8222-222222222222';
const POS_MODULE_ID = '33333333-3333-4333-8333-333333333333';

const BASIC_PACKAGE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRO_PACKAGE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const SYSTEM_MODULES = [
  {
    id: SALES_MODULE_ID,
    code: 'SALES',
    name: 'Sales & Invoicing',
    description: 'Quotations, invoices and customer accounts.',
    isActive: true,
  },
  {
    id: INVENTORY_MODULE_ID,
    code: 'INVENTORY',
    name: 'Inventory',
    description: 'Warehouses, stock movements and item costing.',
    isActive: true,
  },
  {
    id: POS_MODULE_ID,
    code: 'POS',
    name: 'Point of Sale',
    description: 'Retail counters, cash sessions and receipts.',
    isActive: true,
  },
];

const summaryOf = (id) => {
  const found = SYSTEM_MODULES.find((m) => m.id === id);

  return found ? { id: found.id, code: found.code, name: found.name } : null;
};

const buildPackage = (id, name, enabledIds, extra = {}) => ({
  id,
  name,
  description: `${name} subscription plan.`,
  priceMonthly: extra.priceMonthly ?? 199,
  priceYearly: (extra.priceMonthly ?? 199) * 10,
  trialDays: 14,
  isActive: true,
  systemModules: enabledIds.map(summaryOf).filter(Boolean),
  systemModuleCodes: enabledIds
    .map((moduleId) => SYSTEM_MODULES.find((m) => m.id === moduleId)?.code)
    .filter(Boolean),
});

const PACKAGES = new Map([
  [
    BASIC_PACKAGE_ID,
    buildPackage(BASIC_PACKAGE_ID, 'Basic', [SALES_MODULE_ID], {
      priceMonthly: 199,
    }),
  ],
  [
    PRO_PACKAGE_ID,
    buildPackage(
      PRO_PACKAGE_ID,
      'Pro',
      [SALES_MODULE_ID, INVENTORY_MODULE_ID, POS_MODULE_ID],
      { priceMonthly: 499 }
    ),
  ],
]);

// ---------------------------------------------------------------------------
// P5.7 — revenue aggregate fixtures.
//
// `GET /platform/billing/subscriptions` (the M2M aggregate, `lib/erp.ts:445`)
// was the ONE surface the stub never served, which is why
// `admin-revenue.spec.ts` could only assert the payload was well-FORMED and
// never that it was CORRECT. Serving a fixed, hand-counted set lets the spec
// assert the displayed numbers instead of accepting any shape.
//
// The expected rollup for this exact seed — asserted in the spec, and the reason
// the counts are hand-written here rather than computed — is:
//   active 2 · trial 1 · expired 1 · total 4 · MRR 350 (100 + 250)
//
// `expired` is produced the way the real data produces it: an ACTIVE status with
// a PAST endDate. `deriveSubscriptionStatus` in `lib/adminRevenue.ts` re-derives
// status from the date, so seeding `status: 'Expired'` would skip that path and
// let a status-derivation regression pass unnoticed.
const PAST = () => new Date(Date.now() - 5 * 86400000).toISOString();
const FUTURE = (days) => new Date(Date.now() + days * 86400000).toISOString();

const REVENUE_SUBSCRIPTIONS = () => [
  {
    tenantId: 'tenant-rev-active-1',
    teamId: 'team-rev-active-1',
    tenantName: 'Active One',
    subdomain: 'active-one',
    planName: 'Pro',
    priceMonthly: 100,
    status: 'Active',
    isTrial: false,
    endDate: FUTURE(30),
  },
  {
    tenantId: 'tenant-rev-active-2',
    teamId: 'team-rev-active-2',
    tenantName: 'Active Two',
    subdomain: 'active-two',
    planName: 'Pro',
    priceMonthly: 250,
    status: 'Active',
    isTrial: false,
    endDate: FUTURE(60),
  },
  {
    tenantId: 'tenant-rev-trial-1',
    tenantName: 'Trial One',
    subdomain: 'trial-one',
    planName: 'Basic',
    priceMonthly: 0,
    status: 'Trial',
    isTrial: true,
    endDate: FUTURE(10),
  },
  {
    tenantId: 'tenant-rev-expired-1',
    tenantName: 'Expired One',
    subdomain: 'expired-one',
    planName: 'Basic',
    priceMonthly: 0,
    status: 'Active',
    isTrial: false,
    endDate: PAST(),
  },
];

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

  // -------------------------------------------------------------------------
  // P5.6 — rules / permissions surface
  // -------------------------------------------------------------------------

  // GET /api/platform/billing/system-modules
  if (pathname === '/api/platform/billing/system-modules' && method === 'GET') {
    sendJson(res, 200, SYSTEM_MODULES);
    return;
  }

  // GET /api/platform/billing/packages
  if (pathname === '/api/platform/billing/packages' && method === 'GET') {
    sendJson(res, 200, Array.from(PACKAGES.values()));
    return;
  }

  // POST /api/platform/billing/subscriptions/sync-modules
  //
  // Matched BEFORE the `packages/:id` routes so the literal `sync-modules`
  // segment can never be captured by an id matcher.
  if (
    pathname === '/api/platform/billing/subscriptions/sync-modules' &&
    method === 'POST'
  ) {
    await parseJsonBody(req);
    sendJson(res, 200, {
      message: `Synchronized modules for ${PACKAGES.size} packages.`,
    });
    return;
  }

  // GET /api/platform/billing/subscriptions  (P5.7 revenue aggregate)
  if (pathname === '/api/platform/billing/subscriptions' && method === 'GET') {
    sendJson(res, 200, { subscriptions: REVENUE_SUBSCRIPTIONS() });
    return;
  }

  // PUT /api/platform/billing/packages/:id/modules
  const packageModulesRoute = pathname.match(
    /^\/api\/platform\/billing\/packages\/([^/]+)\/modules$/
  );
  if (packageModulesRoute && method === 'PUT') {
    const packageId = decodeURIComponent(packageModulesRoute[1]);
    const current = PACKAGES.get(packageId);

    if (!current) {
      sendJson(res, 404, { error: 'Package not found.' });
      return;
    }

    const body = await parseJsonBody(req);
    const requestedIds = Array.isArray(body.systemModuleIds)
      ? body.systemModuleIds
      : [];

    // Stored, not echoed: the ids are filtered against the module registry and
    // the result is written back into the map, so a later GET returns the
    // STORED set — which is what makes the persistence assertion meaningful.
    const updated = buildPackage(packageId, current.name, requestedIds, {
      priceMonthly: current.priceMonthly,
    });

    PACKAGES.set(packageId, updated);
    sendJson(res, 200, updated);
    return;
  }

  // GET /api/platform/billing/packages/:id
  const packageRoute = pathname.match(
    /^\/api\/platform\/billing\/packages\/([^/]+)$/
  );
  if (packageRoute && method === 'GET') {
    const packageId = decodeURIComponent(packageRoute[1]);
    const found = PACKAGES.get(packageId);

    if (!found) {
      sendJson(res, 404, { error: 'Package not found.' });
      return;
    }

    sendJson(res, 200, found);
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
