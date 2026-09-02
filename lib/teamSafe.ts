import type { Team } from '@prisma/client';

/**
 * Scalar `Team` fields that are safe to expose to browser clients.
 *
 * `erpAccessToken` and `erpApiUrl` are credentials and MUST never be
 * serialized to the client (see pages/api/teams/* and pages/teams/switch.tsx).
 * Keep this list in sync with prisma/schema.prisma when new scalar fields
 * are added to the Team model.
 */
export const TEAM_CLIENT_FIELDS = [
  'id',
  'name',
  'slug',
  'domain',
  'defaultRole',
  'billingId',
  'billingProvider',
  'erpTenantId',
  'erpSubdomain',
  'erpLinkedAt',
  'createdAt',
  'updatedAt',
] as const;

export type TeamClientSafe = Pick<Team, (typeof TEAM_CLIENT_FIELDS)[number]>;

/**
 * A client-safe `Team` plus the member count the `/api/teams` listing adds
 * via Prisma `include._count` (consumed by the team list/switch page).
 */
export type TeamClientSafeWithCount = TeamClientSafe & {
  _count: { members: number };
};

/**
 * A `Team` that carries no credential fields. Accepts both the full row
 * (e.g. from `getTeam`, where the secrets are still present server-side)
 * and rows that already omitted the secrets at the data layer (e.g.
 * `getTeams` with Prisma `omit`).
 */
export type TeamWithoutSecrets = Omit<Team, 'erpAccessToken' | 'erpApiUrl'>;

/**
 * Single choke point for stripping ERP credentials off a `Team` before it is
 * sent to a browser client. Builds a brand-new object with an explicit field
 * pick — never spreads `team` (a spread would still carry the secrets).
 */
export const sanitizeTeam = (team: TeamWithoutSecrets): TeamClientSafe => ({
  id: team.id,
  name: team.name,
  slug: team.slug,
  domain: team.domain,
  defaultRole: team.defaultRole,
  billingId: team.billingId,
  billingProvider: team.billingProvider,
  erpTenantId: team.erpTenantId,
  erpSubdomain: team.erpSubdomain,
  erpLinkedAt: team.erpLinkedAt,
  createdAt: team.createdAt,
  updatedAt: team.updatedAt,
});

/**
 * Sanitizes a row from the team-list path (Prisma `include._count`) and
 * carries the member count over, since `sanitizeTeam` intentionally drops
 * everything outside `TEAM_CLIENT_FIELDS`. Never spreads the raw row.
 */
export const sanitizeTeamWithCount = (
  team: TeamWithoutSecrets & { _count: { members: number } }
): TeamClientSafeWithCount => ({
  ...sanitizeTeam(team),
  _count: team._count,
});
