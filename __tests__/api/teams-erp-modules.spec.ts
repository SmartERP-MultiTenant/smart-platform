import { normalizeTenantModules } from 'pages/api/teams/[slug]/erp';

// `pages/api/teams/[slug]/erp.ts` imports the Prisma client, the typed env and
// the ERP client. The function under test is pure, so those are stubbed: the
// route module is only loaded to reach the export.
jest.mock('@/lib/prisma', () => ({
  prisma: { team: { update: jest.fn() } },
}));

jest.mock('@/lib/env', () => ({
  __esModule: true,
  default: { erp: { apiUrl: 'https://erp.example.test/api' } },
}));

jest.mock('@/lib/erp', () => ({
  erp: {
    getTenantSubscription: jest.fn(),
    getTenantModules: jest.fn(),
    login: jest.fn(),
  },
  ErpApiError: class ErpApiError extends Error {
    status?: number;
  },
}));

jest.mock('models/team', () => ({ throwIfNoTeamAccess: jest.fn() }));
jest.mock('@/lib/zod/erp', () => ({
  erpConnectSchema: { safeParse: jest.fn() },
}));
jest.mock('@/lib/crypto/erpToken', () => ({
  encryptErpToken: jest.fn(),
  decryptErpToken: jest.fn(),
}));

/**
 * P3.1 — the ERP `TenantStatus/modules` payload is untyped at the boundary
 * (`lib/erp.ts` types the call `erpFetch<unknown>`). This function is the one
 * place that narrows it, so these are the contract tests for the shape the
 * browser is allowed to receive.
 */
describe('normalizeTenantModules (P3.1 — ERP module boundary)', () => {
  const MODULE_WIDTH_GUARD = 64;

  it('accepts the observed `{ modules: [...] }` wrapper shape', () => {
    expect(normalizeTenantModules({ modules: ['POS', 'SALES'] })).toEqual([
      'POS',
      'SALES',
    ]);
  });

  it('accepts a bare array', () => {
    expect(normalizeTenantModules(['Accounting', 'Inventory'])).toEqual([
      'Accounting',
      'Inventory',
    ]);
  });

  it('reads object entries through name -> code -> displayName -> title', () => {
    expect(
      normalizeTenantModules({
        modules: [
          { name: 'Point of Sale', code: 'POS' },
          { code: 'ACC' },
          { displayName: 'CRM' },
          { title: 'Payroll' },
        ],
      })
    ).toEqual(['Point of Sale', 'ACC', 'CRM', 'Payroll']);
  });

  it('prefers the earliest field even when a later one is also present', () => {
    expect(
      normalizeTenantModules([{ name: 'From name', code: 'FROM_CODE' }])
    ).toEqual(['From name']);
  });

  it('falls through to a later field when an earlier one is blank', () => {
    expect(normalizeTenantModules([{ name: '   ', code: '  ACC  ' }])).toEqual([
      'ACC',
    ]);
  });

  it('drops entries that carry no usable string', () => {
    expect(
      normalizeTenantModules([
        'POS',
        42,
        null,
        undefined,
        true,
        {},
        [],
        { count: 3 },
        { name: 7 },
      ])
    ).toEqual(['POS']);
  });

  it('trims entries and drops empty or whitespace-only ones', () => {
    expect(normalizeTenantModules(['  POS  ', '', '   ', '\n'])).toEqual([
      'POS',
    ]);
  });

  it(`drops entries longer than ${MODULE_WIDTH_GUARD} characters`, () => {
    const atLimit = 'A'.repeat(MODULE_WIDTH_GUARD);
    const overLimit = 'B'.repeat(MODULE_WIDTH_GUARD + 1);
    expect(normalizeTenantModules([atLimit, overLimit])).toEqual([atLimit]);
  });

  it('collapses duplicates case-insensitively, keeping the first casing', () => {
    expect(
      normalizeTenantModules(['POS', 'pos', ' Pos ', { name: 'pOs' }])
    ).toEqual(['POS']);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'POS'],
    ['a number', 7],
    ['a boolean', true],
    ['an empty object', {}],
    ['modules as a string', { modules: 'POS' }],
    ['modules as an object', { modules: { 0: 'POS' } }],
    ['modules as null', { modules: null }],
  ])('normalizes %s to an empty array', (_label, payload) => {
    expect(normalizeTenantModules(payload)).toEqual([]);
  });

  it('always returns a fresh array, never the caller payload', () => {
    const input = ['POS'];
    const result = normalizeTenantModules(input);
    expect(result).toEqual(['POS']);
    expect(result).not.toBe(input);
  });
});

/**
 * The REAL `GET /api/platform/TenantStatus/modules` response.
 *
 * ## Provenance — read this before trusting the fixture
 *
 * This is **derived** from the ERP C# source of truth, **not captured** from a
 * running instance:
 *
 * - `SmartAndPro.ERP.Application/Common/Dtos/Platform/Tenant/TenantEnabledModulesResponseDto.cs`
 *   — `subscriptionId`, `packageId`, `packageName`, `status`, `enabledModules`,
 *   `enabledModuleCodes`
 * - `SmartAndPro.ERP.Application/Common/Dtos/Platform/SystemModule/SystemModuleSummaryResponseDto.cs`
 *   — `id`, `code`, `name`
 * - `SmartAndPro.ERP.WebAPI/Controllers/Platform/TenantStatusController.cs` — the
 *   `GetEnabledModules` action (`[HttpGet("modules")]`, projection ~line 90)
 * - `SmartAndPro.ERP.WebAPI/Program.cs:90` — `JsonNamingPolicy.CamelCase`, which is
 *   why every field here is camelCase while the DTO is PascalCase
 *
 * The Arabic `name` values are the real ones seeded by
 * `SmartAndPro.ERP.Infrastructure/Data/Persistence/PlatformSeeder.cs` (~108-124),
 * so the fixture matches what production actually returns.
 *
 * What it cannot prove is that the ERP still sends this shape — the ERP WebAPI is
 * not reachable from this repo, the same limitation `tests/fixtures/erp-contract.ts`
 * records for the payment fixtures. One captured payload from staging would settle it.
 */
const realTenantModulesResponse = {
  subscriptionId: '9f2c1a44-6f1e-4e2b-9a3d-5c8b7e6f0a11',
  packageId: '1f1b3311-2477-49f1-8c5c-3abb1c3ecd4c',
  packageName: 'Starter',
  status: 'Active',
  enabledModules: [
    {
      id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      code: 'POS',
      name: 'نقطة البيع - POS',
    },
    {
      id: '4fa85f64-5717-4562-b3fc-2c963f66afa7',
      code: 'INVENTORY',
      name: 'المخازن',
    },
    {
      id: '5fa85f64-5717-4562-b3fc-2c963f66afa8',
      code: 'ACCOUNTING',
      name: 'الحسابات العامة',
    },
  ],
  enabledModuleCodes: ['POS', 'INVENTORY', 'ACCOUNTING'],
};

/**
 * The tenant-has-no-subscription branch, verbatim from the controller: it returns
 * a default-constructed DTO carrying only `Status`, so the nullable fields are
 * `null` and both lists are empty.
 */
const realNoActiveSubscriptionResponse = {
  subscriptionId: null,
  packageId: null,
  packageName: null,
  status: 'NoActiveSubscription',
  enabledModules: [],
  enabledModuleCodes: [],
};

/**
 * The regression this file exists for: the route unwrapped only `modules`, so the
 * live `enabledModules` field was dropped and `/teams/[slug]/erp` rendered its
 * "no active modules" empty state for tenants that had modules.
 */
describe('normalizeTenantModules — the live ERP payload', () => {
  it('maps the real TenantStatus response to the module display names', () => {
    expect(normalizeTenantModules(realTenantModulesResponse)).toEqual([
      'نقطة البيع - POS',
      'المخازن',
      'الحسابات العامة',
    ]);
  });

  it('reads `name` before `code` for a real entry', () => {
    // The seeder puts the Arabic display name in `Name` and the Latin token in
    // `Code`. Preferring `code` would render 'POS' instead of the Arabic label.
    expect(normalizeTenantModules(realTenantModulesResponse)).not.toContain(
      'POS'
    );
  });

  it('normalizes a NoActiveSubscription response to an empty array', () => {
    expect(normalizeTenantModules(realNoActiveSubscriptionResponse)).toEqual(
      []
    );
  });

  it('prefers enabledModules over the legacy modules wrapper', () => {
    expect(
      normalizeTenantModules({
        enabledModules: [{ id: 'a', code: 'POS', name: 'نقطة البيع - POS' }],
        modules: ['LEGACY_POS', 'LEGACY_SALES'],
      })
    ).toEqual(['نقطة البيع - POS']);
  });

  it('falls back to the legacy wrapper when enabledModules is null', () => {
    expect(
      normalizeTenantModules({ enabledModules: null, modules: ['POS'] })
    ).toEqual(['POS']);
  });

  it('falls back to the legacy wrapper when enabledModules is not an array', () => {
    expect(
      normalizeTenantModules({
        enabledModules: 'POS',
        modules: ['From legacy modules'],
      })
    ).toEqual(['From legacy modules']);
  });

  it('never uses enabledModuleCodes as the module list', () => {
    // Codes are not display names. This pins the deliberate non-consumption, so
    // that adding `enabledModuleCodes` to MODULE_ARRAY_FIELDS fails here.
    expect(
      normalizeTenantModules({ enabledModuleCodes: ['POS', 'INVENTORY'] })
    ).toEqual([]);
  });

  it('does not substitute codes when enabledModules is an empty array', () => {
    expect(
      normalizeTenantModules({
        status: 'Active',
        enabledModules: [],
        enabledModuleCodes: ['POS', 'INVENTORY'],
      })
    ).toEqual([]);
  });
});
