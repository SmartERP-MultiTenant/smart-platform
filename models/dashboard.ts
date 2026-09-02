import { prisma } from '@/lib/prisma';
import { permissions, Resource } from '@/lib/permissions';
import {
  buildMemberGrowth,
  buildRoleCounts,
  DashboardPayload,
} from '@/lib/dashboard';
import { getByCustomerId } from 'models/subscription';
import { getServiceByPriceId } from 'models/price';
import { Role, Team } from '@prisma/client';

/**
 * `team` must already be resolved for the caller (e.g. via
 * `throwIfNoTeamAccess`) — this function never re-checks team access.
 * Sections the caller lacks permission to read are returned as `null`
 * instead of zeros, so clients never present restricted data as real.
 */
const canRead = (role: Role, resource: Resource): boolean => {
  return (permissions[role] || []).some(
    (permission) =>
      permission.resource === resource &&
      (permission.actions === '*' || permission.actions.includes('read'))
  );
};

export const getDashboardData = async (
  team: Team,
  role: Role
): Promise<DashboardPayload> => {
  const teamId = team.id;

  const members = await prisma.teamMember.findMany({
    where: { teamId },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: {
        select: {
          name: true,
          email: true,
          image: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const memberSection = canRead(role, 'team_member')
    ? {
        memberCount: members.length,
        memberRoleCounts: buildRoleCounts(members.map((member) => member.role)),
        memberGrowth: buildMemberGrowth(
          members.map((member) => member.createdAt)
        ),
        recentMembers: members.slice(0, 5).map((member) => ({
          id: member.id,
          name: member.user.name,
          email: member.user.email,
          image: member.user.image,
          role: member.role,
          createdAt: member.createdAt.toISOString(),
        })),
      }
    : {
        memberCount: null,
        memberRoleCounts: null,
        memberGrowth: null,
        recentMembers: null,
      };

  const [apiKeys, apiKeysCount] = canRead(role, 'team_api_key')
    ? await prisma.$transaction([
        prisma.apiKey.findMany({
          where: { teamId },
          select: {
            id: true,
            name: true,
            createdAt: true,
            lastUsedAt: true,
            expiresAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        prisma.apiKey.count({ where: { teamId } }),
      ])
    : [null, null];

  const pendingInvitationsCount = canRead(role, 'team_invitation')
    ? await prisma.invitation.count({
        where: {
          teamId,
          expires: { gt: new Date() },
        },
      })
    : null;

  const [serviceCount, planCount] = await prisma.$transaction([
    prisma.service.count(),
    prisma.price.count(),
  ]);

  // Never call getStripeCustomerId() here: it creates a Stripe customer as a
  // side effect when billingId is missing. We only read persisted data.
  let activeSubscription: DashboardPayload['activeSubscription'] = null;
  if (canRead(role, 'team_payments') && team.billingId) {
    const subscriptions = await getByCustomerId(team.billingId);
    const active = subscriptions.find(
      (subscription) =>
        subscription.active && subscription.endDate >= new Date()
    );

    if (active) {
      const service = await getServiceByPriceId(active.priceId);
      activeSubscription = {
        planName: service?.name || null,
        startDate: active.startDate.toISOString(),
        endDate: active.endDate.toISOString(),
      };
    }
  }

  return {
    teamName: team.name,
    teamSlug: team.slug,
    ...memberSection,
    pendingInvitationsCount,
    apiKeysCount,
    recentApiKeys: apiKeys
      ? apiKeys.map((apiKey) => ({
          id: apiKey.id,
          name: apiKey.name,
          createdAt: apiKey.createdAt.toISOString(),
          lastUsedAt: apiKey.lastUsedAt
            ? apiKey.lastUsedAt.toISOString()
            : null,
          expiresAt: apiKey.expiresAt ? apiKey.expiresAt.toISOString() : null,
        }))
      : null,
    serviceCount,
    planCount,
    activeSubscription,
    erp: {
      linked: Boolean(team.erpTenantId && team.erpLinkedAt),
      tenantId: team.erpTenantId,
      subdomain: team.erpSubdomain,
      linkedAt: team.erpLinkedAt ? team.erpLinkedAt.toISOString() : null,
    },
  };
};
