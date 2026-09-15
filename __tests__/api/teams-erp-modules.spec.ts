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
