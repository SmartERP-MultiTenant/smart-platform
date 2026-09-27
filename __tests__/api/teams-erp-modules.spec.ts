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

  it('reads object entries through code -> name -> displayName -> title', () => {
    expect(
      normalizeTenantModules({
        modules: [
          { name: 'Point of Sale', code: 'POS' },
          { code: 'ACC' },
          { displayName: 'CRM' },
          { title: 'Payroll' },
        ],
      })
    ).toEqual(['POS', 'ACC', 'CRM', 'Payroll']);
  });

  it('prefers the earliest field even when a later one is also present', () => {
    expect(
      normalizeTenantModules([{ name: 'From name', code: 'FROM_CODE' }])
    ).toEqual(['FROM_CODE']);
  });

  it('falls through to a later field when an earlier one is blank', () => {
    expect(normalizeTenantModules([{ code: '   ', name: '  ACC  ' }])).toEqual([
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
 * The `GET /api/platform/TenantStatus/modules` response, as the ERP defines it.
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
 * The `code` / `name` pairs are the real ones seeded by
 * `SmartAndPro.ERP.Infrastructure/Data/Persistence/PlatformSeeder.cs`
 * (`SeedSystemModules`), and the module list below is that function's complete
 * catalogue rather than a sample, so dropping one of them is caught here.
 *
 * Field **values** are derived; field **order** is not. The controller orders
 * `EnabledModules` by `SystemModule.Name`, an Arabic collation this fixture does
 * not reproduce, so the order below is the seeder's own order and is not
 * ERP-canonical. Nothing here depends on it: `normalizeTenantModules` preserves
 * input order and the expectations restate the order they were given.
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
      id: '6fa85f64-5717-4562-b3fc-2c963f66afa1',
      code: 'SALES',
      name: 'المبيعات',
    },
    {
      id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      code: 'POS',
      name: 'نقطة البيع - POS',
    },
    {
      id: '1c9e5b21-7d3a-4f60-9b12-6a0d4e8c1b22',
      code: 'OPERATIONS',
      name: 'الحجوزات',
    },
    {
      id: '2d4f6a13-8e4b-4a71-8c23-7b1e5f9d2c33',
      code: 'RESERVATIONS_DATA',
      name: 'اعدادات الحجوزات',
    },
    {
      id: '4e607b25-9f5c-4b82-9d34-8c2f6a0e3d44',
      code: 'SMART_BOOKING',
      name: 'الموقع الالكتروني',
    },
    {
      id: '5f718c36-a06d-4c93-ae45-9d3a7b1f4e55',
      code: 'PURCHASES',
      name: 'المشتريات',
    },
    {
      id: '7a92ad58-c28f-4eb5-c067-bf5c9d3b6a77',
      code: 'RESTAURANT',
      name: 'المطاعم والمطابخ',
    },
    {
      id: '4fa85f64-5717-4562-b3fc-2c963f66afa7',
      code: 'INVENTORY',
      name: 'المخازن',
    },
    {
      id: '8ba3be69-d39a-4fc6-d178-ca6dae4c7b88',
      code: 'CUSTOMERS',
      name: 'العملاء',
    },
    {
      id: '9cb4cf7a-e4ab-4ad7-e289-db7ebf5d8c99',
      code: 'SUPPLIERS',
      name: 'الموردين',
    },
    {
      id: '5fa85f64-5717-4562-b3fc-2c963f66afa8',
      code: 'ACCOUNTING',
      name: 'الحسابات العامة',
    },
    {
      id: 'adc5d08b-f5bc-4be8-f39a-ec8fc06e9daa',
      code: 'FINANCE',
      name: 'الإدارة العامة',
    },
    {
      id: 'bed6e19c-06cd-4cf9-a4ab-fd9ad17f0ebb',
      code: 'PROJECTS',
      name: 'إدارة المشاريع',
    },
    {
      id: 'cfe7f2ad-17de-4d0a-b5bc-0eabe2801fcc',
      code: 'REPORTS',
      name: 'التقارير العامة',
    },
  ],
  enabledModuleCodes: [
    'SALES',
    'POS',
    'OPERATIONS',
    'RESERVATIONS_DATA',
    'SMART_BOOKING',
    'PURCHASES',
    'RESTAURANT',
    'INVENTORY',
    'CUSTOMERS',
    'SUPPLIERS',
    'ACCOUNTING',
    'FINANCE',
    'PROJECTS',
    'REPORTS',
  ],
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
  it('maps the real TenantStatus response to the codes the page localizes', () => {
    // Codes, not the Arabic labels: `getLocalizedModuleName` resolves each of
    // these through `erp-module-*`, which is where the bilingual label comes from.
    expect(normalizeTenantModules(realTenantModulesResponse)).toEqual([
      'SALES',
      'POS',
      'OPERATIONS',
      'RESERVATIONS_DATA',
      'SMART_BOOKING',
      'PURCHASES',
      'RESTAURANT',
      'INVENTORY',
      'CUSTOMERS',
      'SUPPLIERS',
      'ACCOUNTING',
      'FINANCE',
      'PROJECTS',
      'REPORTS',
    ]);
  });

  it('reads `code` before `name` for a real entry', () => {
    // The seeder puts the Latin token in `Code` and an Arabic label in `Name`.
    // The localizer keys on the code, so the code is what must survive; the
    // Arabic label is the fallback for a code-less entry, not the value.
    const modules = normalizeTenantModules(realTenantModulesResponse);

    expect(modules).toContain('POS');
    expect(modules).not.toContain('نقطة البيع - POS');
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
    ).toEqual(['POS']);
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

  it('documents the PascalCase drift boundary: `EnabledModules` yields no modules', () => {
    // The wire is camelCase only because `Program.cs:90` sets
    // `JsonNamingPolicy.CamelCase`. A body that bypassed that policy — a
    // manually serialized response, or a proxy that reformatted one — would
    // carry `EnabledModules` and normalize to `[]`, which the page renders as
    // its existing empty state rather than as raw ERP data. The lookup stays
    // case-sensitive on purpose: accepting both spellings would hide a contract
    // change instead of surfacing it.
    expect(
      normalizeTenantModules({
        status: 'Active',
        EnabledModules: [{ Id: 'a', Code: 'POS', Name: 'نقطة البيع - POS' }],
      })
    ).toEqual([]);
  });
});
