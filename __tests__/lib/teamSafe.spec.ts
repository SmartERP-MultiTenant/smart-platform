import { Role } from '@prisma/client';
import {
  sanitizeTeam,
  sanitizeTeamWithCount,
  TEAM_CLIENT_FIELDS,
  TeamWithoutSecrets,
} from '@/lib/teamSafe';

const ERPCredentials = {
  erpApiUrl: 'https://api.erp.test',
  erpAccessToken: 'ERPSECRETTOKEN123',
};

const baseTeam = {
  id: 'team_1',
  name: 'Acme Corp',
  slug: 'acme-corp',
  domain: 'acme.example.com',
  defaultRole: Role.OWNER,
  billingId: 'cus_123',
  billingProvider: 'stripe',
  erpTenantId: 'tenant_9',
  erpSubdomain: 'acme',
  erpLinkedAt: new Date('2026-08-01T00:00:00Z'),
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-08-02T00:00:00Z'),
};

describe('Lib - teamSafe', () => {
  it('never includes the ERP credentials in TEAM_CLIENT_FIELDS', () => {
    expect(TEAM_CLIENT_FIELDS).not.toContain('erpAccessToken');
    expect(TEAM_CLIENT_FIELDS).not.toContain('erpApiUrl');
  });

  describe('sanitizeTeam', () => {
    it('strips erpAccessToken and erpApiUrl from a full Team row', () => {
      const fullTeam = {
        ...baseTeam,
        ...ERPCredentials,
      } as unknown as TeamWithoutSecrets;

      const result = sanitizeTeam(fullTeam);

      expect(result).not.toHaveProperty('erpAccessToken');
      expect(result).not.toHaveProperty('erpApiUrl');
      // No way for the secrets to leak through the JSON that hits the wire.
      expect(JSON.stringify(result)).not.toContain('ERPSECRETTOKEN123');
      expect(JSON.stringify(result)).not.toContain('api.erp.test');
    });

    it('preserves every safe scalar field with its value', () => {
      const result = sanitizeTeam({
        ...baseTeam,
        ...ERPCredentials,
      } as unknown as TeamWithoutSecrets);

      expect(result).toEqual({
        ...baseTeam,
      });
      expect(result.name).toBe('Acme Corp');
      expect(result.slug).toBe('acme-corp');
      expect(result.erpTenantId).toBe('tenant_9');
      expect(result.erpSubdomain).toBe('acme');
      expect(result.defaultRole).toBe(Role.OWNER);
      expect(result.billingId).toBe('cus_123');
      expect(result.createdAt).toEqual(baseTeam.createdAt);
      expect(result.updatedAt).toEqual(baseTeam.updatedAt);
      expect(result.erpLinkedAt).toEqual(baseTeam.erpLinkedAt);
    });

    it('returns exactly the client-safe field set', () => {
      const result = sanitizeTeam({
        ...baseTeam,
        ...ERPCredentials,
      } as unknown as TeamWithoutSecrets);

      expect(Object.keys(result).sort()).toEqual(
        [...TEAM_CLIENT_FIELDS].sort()
      );
    });

    it('returns a new object, not the same reference', () => {
      const fullTeam = {
        ...baseTeam,
        ...ERPCredentials,
      } as unknown as TeamWithoutSecrets;

      const result = sanitizeTeam(fullTeam);

      expect(result).not.toBe(fullTeam);
      // Mutating the input after sanitizing must not affect the result.
      (fullTeam as Record<string, unknown>).erpAccessToken = 'CHANGED';
      expect(result).not.toHaveProperty('erpAccessToken');
    });

    it('handles list-path rows that already omitted the secrets', () => {
      const omittedRows = [
        { ...baseTeam, id: 'team_1' },
        { ...baseTeam, id: 'team_2', slug: 'acme-corp-2' },
      ] as TeamWithoutSecrets[];

      const results = omittedRows.map(sanitizeTeam);

      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result).not.toHaveProperty('erpAccessToken');
        expect(result).not.toHaveProperty('erpApiUrl');
      }
      expect(results.map((row) => row.id)).toEqual(['team_1', 'team_2']);
    });
  });

  describe('sanitizeTeamWithCount', () => {
    const baseRow = {
      ...baseTeam,
      ...ERPCredentials,
      _count: { members: 3 },
    } as unknown as TeamWithoutSecrets & { _count: { members: number } };

    it('keeps the member count that the team list renders', () => {
      const result = sanitizeTeamWithCount(baseRow);

      expect(result._count).toEqual({ members: 3 });
      expect(result).toHaveProperty('_count.members');
    });

    it('never includes the ERP credentials', () => {
      const result = sanitizeTeamWithCount(baseRow);

      expect(result).not.toHaveProperty('erpAccessToken');
      expect(result).not.toHaveProperty('erpApiUrl');
      expect(JSON.stringify(result)).not.toContain('ERPSECRETTOKEN123');
      expect(JSON.stringify(result)).not.toContain('api.erp.test');
    });

    it('returns exactly the client-safe field set plus _count', () => {
      const result = sanitizeTeamWithCount(baseRow);

      expect(Object.keys(result).sort()).toEqual(
        [...TEAM_CLIENT_FIELDS, '_count'].sort()
      );
    });
  });
});
