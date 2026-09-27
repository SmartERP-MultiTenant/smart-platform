import { readFileSync } from 'fs';
import path from 'path';

import handler, { normalizeTenantModules } from 'pages/api/teams/[slug]/erp';
import { erp } from '@/lib/erp';
import { decryptErpToken } from '@/lib/crypto/erpToken';
import { throwIfNoTeamAccess } from 'models/team';

// `pages/api/teams/[slug]/erp.ts` imports the Prisma client, the typed env and
// the ERP client. Two layers are exercised here: the pure normalizer, which
// needs none of them, and the route handler itself, which needs all of them
// stubbed. The stubs below serve both.
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

  it('accepts the legacy `{ modules: [...] }` wrapper kept for compatibility', () => {
    // Deliberately NOT called "observed": the live controller returns
    // `enabledModules` and nothing else. The only place `{ modules: [...] }` has
    // ever come from is this repo's own mock at `__tests__/lib/erp.spec.ts:181`,
    // so this pins a tolerance the route retains, not a contract the ERP ships.
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
 *
 * Three `name` values below contradict their own `code` — `OPERATIONS` is
 * `الحجوزات`, `FINANCE` is `الإدارة العامة` and `SMART_BOOKING` is
 * `الموقع الالكتروني`. They are recorded as the ERP sends them today, **not** as
 * the platform wants them: the platform labels those modules from the code via
 * `locales/ar/common.json`, so its Arabic deliberately disagrees. Reported
 * upstream as ClickUp `123q2bpfyvw`; if that lands, these three values move too.
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
describe('normalizeTenantModules — the ERP-shaped payload (derived, not captured)', () => {
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

  it('reads `code` before `name` for an ERP-shaped entry', () => {
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

/**
 * The boundary test the helper assertions cannot give. They exercise
 * `normalizeTenantModules` in isolation, so a regression that stopped *calling*
 * it in `handleGET` — passing the raw ERP payload straight through — would leave
 * every one of them green while the browser received untyped ERP objects.
 */
describe('GET /api/teams/[slug]/erp — what the browser is handed', () => {
  const throwIfNoTeamAccessMock = throwIfNoTeamAccess as unknown as jest.Mock;
  const decryptErpTokenMock = decryptErpToken as unknown as jest.Mock;
  const getTenantSubscriptionMock =
    erp.getTenantSubscription as unknown as jest.Mock;
  const getTenantModulesMock = erp.getTenantModules as unknown as jest.Mock;

  // Same shape as `__tests__/api/cron-renewal-reminders.spec.ts`.
  const createMockReqRes = () => {
    const req = { method: 'GET' } as any;

    const res = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: undefined as any,
      setHeader: jest.fn((key: string, value: string) => {
        res.headers[key] = value;
      }),
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

  beforeEach(() => {
    jest.clearAllMocks();
    throwIfNoTeamAccessMock.mockResolvedValue({
      team: {
        erpAccessToken: 'encrypted-token',
        erpTenantId: 'tenant-1',
        erpSubdomain: 'demo',
      },
    });
    decryptErpTokenMock.mockReturnValue('raw-erp-token');
    getTenantSubscriptionMock.mockResolvedValue({ status: 'Active' });
    getTenantModulesMock.mockResolvedValue(realTenantModulesResponse);
  });

  it('hands the browser a string array, never the raw ERP entries', async () => {
    const { req, res } = createMockReqRes();

    await handler(req, res);

    const modules = res.body.data.modules;

    expect(Array.isArray(modules)).toBe(true);
    expect(modules.every((entry: unknown) => typeof entry === 'string')).toBe(
      true
    );
    expect(modules).toEqual([
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

  it('applies the full entry policy, so the route cannot stop calling the normalizer', async () => {
    // The assertion above does not prove the normalizer ran: every entry in the
    // canonical fixture carries a code, so a route that inlined
    // `enabledModules.map((entry) => entry.code)` and never called
    // `normalizeTenantModules` would satisfy it. This payload is answered
    // correctly only by the full policy — blank-code fallback to `name`, the
    // 64-character cap, and case-insensitive dedupe — so bypassing the
    // normalizer fails right here.
    const { req, res } = createMockReqRes();

    getTenantModulesMock.mockResolvedValue({
      status: 'Active',
      enabledModules: [
        { id: 'a', code: '   ', name: 'Fallback From Name' },
        { id: 'b', code: 'X'.repeat(65), name: 'Over The Cap' },
        { id: 'c', code: 'POS', name: 'نقطة البيع - POS' },
        { id: 'd', code: 'pos', name: 'duplicate' },
      ],
      enabledModuleCodes: [],
    });

    await handler(req, res);

    expect(res.body.data.modules).toEqual(['Fallback From Name', 'POS']);
  });
});

/**
 * The gap this file exists to prevent from reopening: a seeded ERP module code
 * with no localizer branch — or a branch whose key is missing from a locale —
 * renders a raw Latin token instead of a label.
 *
 * These are source-level assertions because the localizer is module-private and
 * cannot be imported. That is an established convention here for cross-file
 * coverage no import can express: `__tests__/lib/payments/allowlist.spec.ts` and
 * `__tests__/components/landing/sections.spec.tsx` read sources the same way.
 */
describe('module label localisation coverage', () => {
  const MODULE_PAGE = 'pages/teams/[slug]/erp.tsx';
  const LOCALES = ['en', 'ar'] as const;

  /**
   * Every code `PlatformSeeder.SeedSystemModules` ships — **manually copied**
   * from the sibling ERP repository, at its current path:
   *
   *   SmartAndPro.ERP.Inventory/SmartAndPro.ERP.Infrastructure/Data/Persistence/PlatformSeeder.cs
   *
   * It cannot be generated at test time: that repository is not a dependency of
   * this one and nothing here can read its source. The copy must therefore be
   * updated in lockstep with that function — a module added upstream and missed
   * here would render a raw Latin token in both locales, which is the exact
   * defect this suite exists to catch. The guards below make any local change to
   * this list deliberate; only a contract test inside the ERP repo can detect
   * the upstream half of that drift.
   */
  const SEEDED_MODULE_CODES = [
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
  ];

  /** The size of that catalogue at the time of writing. */
  const SEEDED_MODULE_CODE_COUNT = 14;

  /**
   * The complete `getLocalizedModuleName` branch table: lowercased ERP token ->
   * locale key. Pinned entry for entry, because the check this replaced asserted
   * only that a *string* appeared somewhere in the page — which a mis-mapped
   * branch passed as long as its key existed in both locales.
   *
   * Every key here is one the localizer can reach. Codes that the seeder does not
   * ship (`invoicing`, `hr`, `payroll` and the tolerated variant spellings) are
   * included on purpose: they are reachable from an ERP that ships an older or
   * differently-spelled catalogue, and pinning them makes removing one a visible
   * decision rather than a silent narrowing of the mapping.
   */
  const EXPECTED_BRANCHES: Record<string, string> = {
    accounting: 'erp-module-accounting',
    general_accounting: 'erp-module-accounting',
    invoicing: 'erp-module-invoicing',
    e_invoicing: 'erp-module-invoicing',
    einvoicing: 'erp-module-invoicing',
    inventory: 'erp-module-inventory',
    stock: 'erp-module-inventory',
    pos: 'erp-module-pos',
    point_of_sale: 'erp-module-pos',
    hr: 'erp-module-hr',
    human_resources: 'erp-module-hr',
    employees: 'erp-module-hr',
    crm: 'erp-module-crm',
    customers: 'erp-module-customers',
    payroll: 'erp-module-payroll',
    purchases: 'erp-module-purchases',
    procurement: 'erp-module-purchases',
    sales: 'erp-module-sales',
    operations: 'erp-module-operations',
    reservations_data: 'erp-module-reservations-data',
    smart_booking: 'erp-module-smart-booking',
    restaurant: 'erp-module-restaurant',
    suppliers: 'erp-module-suppliers',
    finance: 'erp-module-finance',
    projects: 'erp-module-projects',
    reports: 'erp-module-reports',
  };

  const readSource = (relative: string) =>
    readFileSync(path.join(process.cwd(), relative), 'utf8');

  const readLocale = (locale: string) =>
    JSON.parse(readSource(`locales/${locale}/common.json`)) as Record<
      string,
      string
    >;

  /**
   * Parses the localizer's branch table out of the page source.
   *
   * Scoped to the `getLocalizedModuleName` body on purpose: scanning the whole
   * file would be satisfied by any quoted token anywhere in it, including a
   * branch that maps a code to the wrong key. The page cannot simply be imported
   * — it pulls in the app shell — so this is a source assertion, the convention
   * `__tests__/lib/payments/allowlist.spec.ts` and
   * `__tests__/components/landing/sections.spec.tsx` already follow here.
   */
  const localizerBranchMap = () => {
    const source = readSource(MODULE_PAGE);
    const start = source.indexOf('const getLocalizedModuleName = (');
    const end = source.indexOf('return raw;', start);

    if (start === -1 || end === -1) {
      throw new Error(
        `${MODULE_PAGE} no longer declares a getLocalizedModuleName branch table closing with return raw;`
      );
    }

    const body = source.slice(start, end);
    const branches: Record<string, string> = {};
    const branchPattern = /if \(([^)]*)\)\s*return t\('([^']+)'\);/g;
    let branch: RegExpExecArray | null;

    while ((branch = branchPattern.exec(body)) !== null) {
      const localeKey = branch[2];
      const comparisonPattern = /key === '([^']*)'/g;
      let comparison: RegExpExecArray | null;

      while ((comparison = comparisonPattern.exec(branch[1])) !== null) {
        branches[comparison[1]] = localeKey;
      }
    }

    return branches;
  };

  const localizerKeys = () =>
    Array.from(new Set(Object.values(localizerBranchMap()))).sort();

  it('maps every ERP token to its expected locale key, entry for entry', () => {
    expect(localizerBranchMap()).toEqual(EXPECTED_BRANCHES);
  });

  it('has a localizer branch for every code the ERP seeder ships', () => {
    const branches = localizerBranchMap();
    const unbranched = SEEDED_MODULE_CODES.filter(
      (code) => !branches[code.toLowerCase()]
    );

    expect({ unbranched }).toEqual({ unbranched: [] });
  });

  it('keeps the ERP payload fixture and the seeded code list in lockstep', () => {
    expect({
      fixtureCodes: realTenantModulesResponse.enabledModules.map(
        (module) => module.code
      ),
    }).toEqual({ fixtureCodes: SEEDED_MODULE_CODES });
  });

  it('states the seeded catalogue size, so an upstream change is visible', () => {
    expect(SEEDED_MODULE_CODES).toHaveLength(SEEDED_MODULE_CODE_COUNT);
  });

  it('resolves every key the localizer uses in both locales', () => {
    const keys = localizerKeys();

    expect(keys.length).toBeGreaterThan(0);

    for (const locale of LOCALES) {
      const strings = readLocale(locale);
      const missing = keys.filter((key) => !strings[key]);

      expect({ locale, missing }).toEqual({ locale, missing: [] });
    }
  });

  it('never labels a module with its raw ERP token', () => {
    const en = readLocale('en');
    const ar = readLocale('ar');

    // `erp-module-crm` is the one documented exception: its English label IS the
    // acronym, which is the real term for that module in this product.
    const acronymKeys = new Set(['erp-module-crm']);

    const echoed = localizerKeys().filter((key) => {
      if (acronymKeys.has(key)) return false;

      const code = key
        .replace('erp-module-', '')
        .replace(/-/g, '_')
        .toUpperCase();

      return en[key] === code || ar[key] === code;
    });

    expect({ echoed }).toEqual({ echoed: [] });

    // The Arabic locale must never fall back to a Latin token.
    const withoutArabic = localizerKeys().filter(
      (key) => !/[\u0600-\u06FF]/.test(ar[key] ?? '')
    );

    expect({ withoutArabic }).toEqual({ withoutArabic: [] });
  });
});
