import { readFileSync } from 'fs';
import path from 'path';

import handler, { normalizeTenantModules } from 'pages/api/teams/[slug]/erp';
import {
  localizeModuleCode,
  moduleLabels,
  resolveModuleLabel,
} from '@/lib/erpModuleLabel';
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

/** The route's per-field width cap (`MAX_MODULE_NAME_LENGTH` in the route). */
const MODULE_WIDTH_GUARD = 64;

/**
 * P3.1 — the ERP `TenantStatus/modules` payload is untyped at the boundary
 * (`lib/erp.ts` types the call `erpFetch<unknown>`). This function is the one
 * place that narrows it, so these are the contract tests for the shape the
 * browser is allowed to receive.
 */
describe('normalizeTenantModules (P3.1 — ERP module boundary)', () => {
  it('accepts the legacy `{ modules: [...] }` wrapper kept for compatibility', () => {
    // Deliberately NOT called "observed": the live controller returns
    // `enabledModules` and nothing else. The only place `{ modules: [...] }` has
    // ever come from is this repo's own mock at `__tests__/lib/erp.spec.ts:181`,
    // so this pins a tolerance the route retains, not a contract the ERP ships.
    expect(normalizeTenantModules({ modules: ['POS', 'SALES'] })).toEqual([
      { code: 'POS', name: '' },
      { code: 'SALES', name: '' },
    ]);
  });

  it('accepts a bare array', () => {
    expect(normalizeTenantModules(['Accounting', 'Inventory'])).toEqual([
      { code: 'Accounting', name: '' },
      { code: 'Inventory', name: '' },
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
    ).toEqual([
      // Both fields survive the boundary: the code carries the label, and the
      // ERP's own `name` rides alongside it for a code the page cannot resolve.
      { code: 'POS', name: 'Point of Sale' },
      { code: 'ACC', name: '' },
      { code: '', name: 'CRM' },
      { code: '', name: 'Payroll' },
    ]);
  });

  it('prefers the earliest field even when a later one is also present', () => {
    expect(
      normalizeTenantModules([{ name: 'From name', code: 'FROM_CODE' }])
    ).toEqual([{ code: 'FROM_CODE', name: 'From name' }]);
  });

  it('falls through to a later field when an earlier one is blank', () => {
    expect(normalizeTenantModules([{ code: '   ', name: '  ACC  ' }])).toEqual([
      { code: '', name: 'ACC' },
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
    ).toEqual([{ code: 'POS', name: '' }]);
  });

  it('trims entries and drops empty or whitespace-only ones', () => {
    expect(normalizeTenantModules(['  POS  ', '', '   ', '\n'])).toEqual([
      { code: 'POS', name: '' },
    ]);
  });

  it(`drops a bare-string entry longer than ${MODULE_WIDTH_GUARD} characters`, () => {
    // A bare string is carried as the code, so over the cap it is blanked — and
    // with no `name` to fall back to there is nothing left to render.
    const atLimit = 'A'.repeat(MODULE_WIDTH_GUARD);
    const overLimit = 'B'.repeat(MODULE_WIDTH_GUARD + 1);
    expect(normalizeTenantModules([atLimit, overLimit])).toEqual([
      { code: atLimit, name: '' },
    ]);
  });

  it(`blanks an over-long name rather than forwarding it (${MODULE_WIDTH_GUARD}-character cap)`, () => {
    // The defect this replaces: the cap was applied to the single resolved
    // `label` (`code || name`) while BOTH fields were forwarded, so a short code
    // let an over-long `name` ride along past the boundary — and the page renders
    // `name` precisely when the code has no branch, which is the case the
    // boundary claims to protect. Capping each field is what makes the width
    // promise in `docs/platform-erp-api-contract.md` true.
    const longName = 'X'.repeat(MODULE_WIDTH_GUARD + 16);

    const modules = normalizeTenantModules([
      { id: 'a', code: 'LOYALTY', name: longName },
    ]);

    expect(modules).toEqual([{ code: 'LOYALTY', name: '' }]);
    expect(JSON.stringify(modules)).not.toContain(longName);
  });

  it('keeps an entry whose code is over-long but whose name is renderable', () => {
    // The other direction, and the same root cause: capping the resolved label
    // dropped the whole entry, so a module the pre-change route rendered as its
    // name disappeared from both locales. Blanking the offending field keeps it.
    const longCode = 'C'.repeat(MODULE_WIDTH_GUARD + 6);

    expect(
      normalizeTenantModules([{ id: 'a', code: longCode, name: 'Invoices' }])
    ).toEqual([{ code: '', name: 'Invoices' }]);
  });

  it('falls past an over-long `name` to a narrower `displayName`', () => {
    // Blanking the entry after selecting an over-long label would discard this
    // one even though a usable label was present, so the chain refuses an
    // over-long candidate instead of selecting it and losing the entry to it.
    expect(
      normalizeTenantModules([
        {
          code: 'LOYALTY',
          name: 'Y'.repeat(MODULE_WIDTH_GUARD + 1),
          displayName: 'Loyalty',
        },
      ])
    ).toEqual([{ code: 'LOYALTY', name: 'Loyalty' }]);
  });

  it('bounds every string it emits, whatever shape the entry takes', () => {
    // The invariant rather than the two cases: no forwarded field may exceed the
    // cap for ANY field combination.
    const over = 'Z'.repeat(MODULE_WIDTH_GUARD + 1);

    const modules = normalizeTenantModules([
      { code: 'POS', name: over },
      { code: over, name: 'Invoices' },
      { code: over, name: over },
      { code: '', name: over, displayName: over, title: over },
      over,
      { code: 'SALES' },
    ]);

    expect(modules).toEqual([
      { code: 'POS', name: '' },
      { code: '', name: 'Invoices' },
      { code: 'SALES', name: '' },
    ]);

    for (const entry of modules) {
      expect(entry.code.length).toBeLessThanOrEqual(MODULE_WIDTH_GUARD);
      expect(entry.name.length).toBeLessThanOrEqual(MODULE_WIDTH_GUARD);
    }
  });

  it('collapses duplicates case-insensitively, keeping the first casing', () => {
    expect(
      normalizeTenantModules(['POS', 'pos', ' Pos ', { name: 'pOs' }])
    ).toEqual([{ code: 'POS', name: '' }]);
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
    expect(result).toEqual([{ code: 'POS', name: '' }]);
    expect(result).not.toBe(input);
  });

  it('carries the ERP `name` alongside the code, not instead of it', () => {
    // The reason the element is an object rather than a bare label: the code is
    // what the page localizes, and the ERP's own label has to survive the
    // boundary so the page can fall back to it for an untranslated code.
    expect(
      normalizeTenantModules({
        enabledModules: [{ id: 'a', code: 'LOYALTY', name: 'برنامج الولاء' }],
      })
    ).toEqual([{ code: 'LOYALTY', name: 'برنامج الولاء' }]);
  });

  it('emits only `code` and `name`, never the ERP entry itself', () => {
    // The browser needs two short strings. `id` is dropped here, and a field the
    // DTO gains later must not be forwarded by default — that is the whole point
    // of narrowing at the trust boundary rather than passing the payload through.
    const [module] = normalizeTenantModules([
      {
        id: '6fa85f64-5717-4562-b3fc-2c963f66afa1',
        code: 'POS',
        name: 'نقطة البيع - POS',
        extra: 'added upstream without telling the platform',
      },
    ]);

    expect(Object.keys(module).sort()).toEqual(['code', 'name']);
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
 *
 * One further divergence is orthographic rather than semantic and needs no ticket.
 * The ERP seeds `RESERVATIONS_DATA` with the hamza-less `اعدادات الحجوزات`; that is
 * the spelling recorded below, because this fixture records what the ERP sends.
 * `locales/ar/common.json` renders the same label with the hamza (`إعدادات الحجوزات`)
 * to match the form that file uses everywhere else (`الإعدادات`, `إعدادات`,
 * `الإلكتروني`) — a spelling normalisation of a label whose meaning is identical,
 * not a disagreement about what the module is.
 */
const derivedTenantModulesResponse = {
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
 * The tenant-has-no-subscription branch, **derived** from the controller like the
 * fixture above — not captured from a running instance: it returns a
 * default-constructed DTO carrying only `Status`, so the nullable fields are
 * `null` and both lists are empty.
 */
const derivedNoActiveSubscriptionResponse = {
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
  it('maps the ERP-shaped TenantStatus response to the codes the page localizes', () => {
    // Codes, not the Arabic labels: `getLocalizedModuleName` resolves each of
    // these through `erp-module-*`, which is where the bilingual label comes from.
    const modules = normalizeTenantModules(derivedTenantModulesResponse);

    expect(modules.map((module) => module.code)).toEqual([
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

    // Every entry the ERP ships also carries a `name`, and that label is what the
    // page falls back to for a code it has no branch for. Asserting the codes
    // alone would not notice if the names stopped surviving the boundary.
    expect({
      withoutName: modules.filter((module) => !module.name),
    }).toEqual({ withoutName: [] });
  });

  it('reads `code` before `name` for an ERP-shaped entry', () => {
    // The seeder puts the Latin token in `Code` and an Arabic label in `Name`.
    // The localizer keys on the code, so the code is what must lead; the Arabic
    // label is carried as `name` — the fallback for an unbranched code — and
    // must never be smuggled into `code`.
    const modules = normalizeTenantModules(derivedTenantModulesResponse);
    const codes = modules.map((module) => module.code);

    expect(codes).toContain('POS');
    expect(codes).not.toContain('نقطة البيع - POS');
    expect(modules.find((module) => module.code === 'POS')?.name).toBe(
      'نقطة البيع - POS'
    );
  });

  it('normalizes a NoActiveSubscription response to an empty array', () => {
    expect(normalizeTenantModules(derivedNoActiveSubscriptionResponse)).toEqual(
      []
    );
  });

  it('prefers enabledModules over the legacy modules wrapper', () => {
    expect(
      normalizeTenantModules({
        enabledModules: [{ id: 'a', code: 'POS', name: 'نقطة البيع - POS' }],
        modules: ['LEGACY_POS', 'LEGACY_SALES'],
      })
    ).toEqual([{ code: 'POS', name: 'نقطة البيع - POS' }]);
  });

  it('falls back to the legacy wrapper when enabledModules is null', () => {
    expect(
      normalizeTenantModules({ enabledModules: null, modules: ['POS'] })
    ).toEqual([{ code: 'POS', name: '' }]);
  });

  it('falls back to the legacy wrapper when enabledModules is not an array', () => {
    expect(
      normalizeTenantModules({
        enabledModules: 'POS',
        modules: ['From legacy modules'],
      })
    ).toEqual([{ code: 'From legacy modules', name: '' }]);
  });

  it('never uses enabledModuleCodes as the module list', () => {
    // Codes are not display names. This pins the deliberate non-consumption, so
    // that adding `enabledModuleCodes` to MODULE_ARRAY_FIELDS fails here.
    expect(
      normalizeTenantModules({ enabledModuleCodes: ['POS', 'INVENTORY'] })
    ).toEqual([]);
  });

  it('prefers the legacy wrapper over `enabledModuleCodes`', () => {
    // The documented precedence, pinned from the other side: with no
    // `enabledModules`, the legacy `modules` wrapper is the array and
    // `enabledModuleCodes` is still not a fallback. An implementation that
    // reached for the codes here passed the whole suite until this test existed.
    // Unreachable from the live DTO — the codes never ship without the entries —
    // which is why nothing caught it.
    expect(
      normalizeTenantModules({
        modules: [{ code: 'POS', name: 'نقطة البيع - POS' }],
        enabledModuleCodes: ['SALES'],
      })
    ).toEqual([{ code: 'POS', name: 'نقطة البيع - POS' }]);
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
    getTenantModulesMock.mockResolvedValue(derivedTenantModulesResponse);
  });

  it('hands the browser `{ code, name }` entries, never the raw ERP entries', async () => {
    const { req, res } = createMockReqRes();

    await handler(req, res);

    const modules = res.body.data.modules;

    expect(Array.isArray(modules)).toBe(true);
    expect(
      modules.every(
        (entry: { code?: unknown; name?: unknown }) =>
          typeof entry.code === 'string' && typeof entry.name === 'string'
      )
    ).toBe(true);
    // The other half of the title: the ERP entry carries `id`, and it must not
    // reach the browser. Narrowing to two strings is the whole boundary.
    expect(modules.some((entry: object) => 'id' in entry)).toBe(false);
    expect(modules.map((entry: { code: string }) => entry.code)).toEqual([
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

  it('applies the full entry policy to what the browser is handed', async () => {
    // This pins the POLICY the route applies, not the call site: every entry in
    // the canonical fixture carries a code, so a route that inlined
    // `enabledModules.map((entry) => entry.code)` would satisfy the assertion
    // above. A verbatim reimplementation of the whole policy inline would still
    // pass here — a black-box route test cannot distinguish that from a call —
    // but nothing weaker can. This payload is answered correctly only by blank
    // code falling back to `name`, the 64-character cap and case-insensitive
    // dedupe.
    const { req, res } = createMockReqRes();

    getTenantModulesMock.mockResolvedValue({
      status: 'Active',
      enabledModules: [
        { id: 'a', code: '   ', name: 'Fallback From Name' },
        {
          id: 'b',
          code: 'X'.repeat(MODULE_WIDTH_GUARD + 1),
          name: 'Over The Cap',
        },
        { id: 'c', code: 'POS', name: 'نقطة البيع - POS' },
        { id: 'd', code: 'pos', name: 'duplicate' },
      ],
      enabledModuleCodes: [],
    });

    await handler(req, res);

    expect(res.body.data.modules).toEqual([
      { code: '', name: 'Fallback From Name' },
      { code: '', name: 'Over The Cap' },
      { code: 'POS', name: 'نقطة البيع - POS' },
    ]);
  });

  it(`bounds every string it hands the browser to ${MODULE_WIDTH_GUARD} characters`, async () => {
    // The invariant, stated over the whole response rather than over the two
    // fields individually: nothing wider than the cap may cross this boundary. It
    // fails the moment a future field is forwarded uncapped, which a
    // case-by-case assertion on `code` and `name` cannot catch.
    const { req, res } = createMockReqRes();

    getTenantModulesMock.mockResolvedValue({
      status: 'Active',
      enabledModules: [
        { id: 'a', code: 'LOYALTY', name: 'N'.repeat(MODULE_WIDTH_GUARD + 16) },
        { id: 'b', code: 'C'.repeat(MODULE_WIDTH_GUARD + 6), name: 'Invoices' },
        { id: 'c', code: 'POS', name: 'نقطة البيع - POS' },
      ],
      enabledModuleCodes: [],
    });

    await handler(req, res);

    const collectStrings = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.flatMap(collectStrings);
      if (typeof value === 'object' && value !== null) {
        return Object.values(value).flatMap(collectStrings);
      }

      return [];
    };

    // Both directions at once: the over-long name is blanked behind its short
    // code, and the over-long code is blanked so its renderable name survives.
    expect(res.body.data.modules).toEqual([
      { code: 'LOYALTY', name: '' },
      { code: '', name: 'Invoices' },
      { code: 'POS', name: 'نقطة البيع - POS' },
    ]);

    const overWide = collectStrings(res.body).filter(
      (value) => value.length > MODULE_WIDTH_GUARD
    );

    expect({ overWide }).toEqual({ overWide: [] });
  });
});

/**
 * The page's label resolution, unit tested.
 *
 * `pages/teams/[slug]/erp.tsx` cannot be imported — it pulls in the app shell —
 * so the three-step order lives in `lib/erpModuleLabel.ts`, where it can be. The
 * branch table itself stays in the page and is asserted from source below.
 */
describe('module label resolution — the page order', () => {
  // The shape of the page's localizer, stubbed down to two curated tokens.
  const branchTable = (token: string, translate: (key: string) => string) => {
    const key = token.toLowerCase().trim();

    if (key === 'pos') return translate('erp-module-pos');
    if (key === 'crm') return translate('erp-module-crm');

    return token;
  };

  const translate = (key: string) => {
    const labels: Record<string, string> = {
      'erp-module-pos': 'Point of Sale (POS)',
      'erp-module-crm': 'CRM',
    };

    return labels[key] ?? key;
  };

  const localize = (code: string) =>
    localizeModuleCode(code, translate, branchTable);

  it('uses the curated translation for a code the platform knows', () => {
    expect(
      resolveModuleLabel({ code: 'POS', name: 'نقطة البيع - POS' }, localize)
    ).toBe('Point of Sale (POS)');
  });

  it('falls back to the Arabic name the ERP ships for a code it never translated', () => {
    // The regression this shape change fixes: an admin-created or newly seeded
    // module rendered its bare Latin code in the Arabic UI, where the ERP's own
    // Arabic label is what the customer expects to read.
    expect(
      resolveModuleLabel({ code: 'LOYALTY', name: 'برنامج الولاء' }, localize)
    ).toBe('برنامج الولاء');
  });

  it('falls back to the raw code when the entry carries no name either', () => {
    expect(resolveModuleLabel({ code: 'LOYALTY', name: '' }, localize)).toBe(
      'LOYALTY'
    );
  });

  it('treats a translation equal to its own code as a branch, not a miss', () => {
    // Why membership comes from the `translate` call and not from comparing the
    // label to the code: `erp-module-crm`'s English label IS `CRM`. The
    // comparison would read this as "no branch" and show the ERP's Arabic name
    // in the English UI instead of the acronym the product actually uses.
    expect(
      resolveModuleLabel(
        { code: 'CRM', name: 'إدارة علاقات العملاء' },
        localize
      )
    ).toBe('CRM');
  });

  it('drops an entry that would render an empty badge', () => {
    // The route already drops these, so this is the second line of defence: a
    // payload that reached the browser by another path must not paint a blank
    // chip.
    expect(moduleLabels([{ code: '', name: '' }], localize)).toEqual([]);
  });

  it('resolves a whole list in order, keeping every renderable label', () => {
    expect(
      moduleLabels(
        [
          { code: 'POS', name: 'نقطة البيع - POS' },
          { code: 'LOYALTY', name: 'برنامج الولاء' },
          { code: '   ', name: '   ' },
        ],
        localize
      )
    ).toEqual(['Point of Sale (POS)', 'برنامج الولاء']);
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
      fixtureCodes: derivedTenantModulesResponse.enabledModules.map(
        (module) => module.code
      ),
    }).toEqual({ fixtureCodes: SEEDED_MODULE_CODES });
  });

  it('tripwire: the seeded catalogue size is stated, so an upstream change is visible', () => {
    // A tripwire, not evidence. Both sides are constants declared in this one
    // file, so it can only fail when the two are edited inconsistently in a
    // single change. Its value is narrow and real: a new seeder code forces a
    // second deliberate edit here, and the lockstep test above is what pins the
    // fixture against the actual list.
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

  it('renders the page through the resolver over the route entries', () => {
    // The glue nothing pinned. The suite proves the route narrows correctly and
    // that `lib/erpModuleLabel.ts` resolves in the documented order, but not that
    // the page calls the resolver at all: a page reverted to
    // `payload?.modules.map((entry) => getLocalizedModuleName(entry.code, t))`
    // would drop both the `name` fallback and the empty-badge filter and still
    // keep every other test in this file green — reintroducing exactly the bare
    // Latin token in the Arabic UI that this PR exists to remove.
    const source = readSource(MODULE_PAGE);

    expect(source).toMatch(
      /moduleLabels\(\s*payload\?\.modules\s*\?\?\s*\[\]\s*,/
    );
    expect(source).toMatch(/localizeErpModuleCode\(/);
    // …and that the resolved list, not the raw entries, is what gets rendered.
    expect(source).toMatch(/modulesList\.map\(/);
    expect(source).not.toMatch(/payload\?\.modules\.map\(/);
  });
});
