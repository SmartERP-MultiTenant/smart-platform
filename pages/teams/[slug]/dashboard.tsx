import {
  ErpStatusCard,
  MemberGrowthChart,
  MemberRoleChart,
  RecentApiKeysTable,
  RecentMembersTable,
  StatCard,
  SubscriptionStatusCard,
} from '@/components/dashboard';
import { Error, Loading } from '@/components/shared';
import { TeamTab } from '@/components/team';
import env from '@/lib/env';
import useCanAccess from 'hooks/useCanAccess';
import useDashboard from 'hooks/useDashboard';
import useTeam from 'hooks/useTeam';
import {
  CubeIcon,
  EnvelopeIcon,
  KeyIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import type { GetServerSidePropsContext } from 'next';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { TeamFeature } from 'types';

const TeamDashboard = ({ teamFeatures }: { teamFeatures: TeamFeature }) => {
  const { t } = useTranslation('common');
  const { canAccess } = useCanAccess();
  const { isLoading, isError, team } = useTeam();
  const {
    data: dashboard,
    isLoading: isDashboardLoading,
    error: dashboardError,
  } = useDashboard(team?.slug);

  if (isLoading) {
    return <Loading />;
  }

  if (isError) {
    return <Error message={isError.message} />;
  }

  if (!team) {
    return <Error message={t('team-not-found')} />;
  }

  const payload = dashboard?.data;
  const canSeeMembers = canAccess('team_member', ['read']);
  const canSeeApiKeys =
    teamFeatures.apiKey && canAccess('team_api_key', ['read']);
  const canSeePayments = canAccess('team_payments', ['read']);

  return (
    <>
      <TeamTab activeTab="dashboard" team={team} teamFeatures={teamFeatures} />

      {isDashboardLoading && <Loading />}
      {dashboardError && <Error message={dashboardError.message} />}

      {payload && !dashboardError && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {t('dashboard-overview-title')}
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {t('dashboard-overview')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {payload.memberCount !== null && (
              <StatCard
                title={t('total-members')}
                value={payload.memberCount}
                icon={UsersIcon}
              />
            )}
            {payload.pendingInvitationsCount !== null && (
              <StatCard
                title={t('pending-invitations-count')}
                value={payload.pendingInvitationsCount}
                icon={EnvelopeIcon}
              />
            )}
            {/* Hide gated sections when their feature flag is disabled; the
                API-only payload is unchanged and RBAC null-checks still apply. */}
            {payload.apiKeysCount !== null && teamFeatures.apiKey && (
              <StatCard
                title={t('api-key-count')}
                value={payload.apiKeysCount}
                icon={KeyIcon}
              />
            )}
            <StatCard
              title={t('service-count')}
              value={payload.serviceCount}
              icon={CubeIcon}
            />
            <StatCard title={t('plan-count')} value={payload.planCount} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {teamFeatures.payments && (
              <SubscriptionStatusCard
                subscription={payload.activeSubscription}
                viewAllHref={
                  canSeePayments ? `/teams/${team.slug}/billing` : null
                }
              />
            )}
            <ErpStatusCard
              erp={payload.erp}
              manageHref={`/teams/${team.slug}/erp`}
            />
          </div>

          {payload.memberRoleCounts !== null && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MemberRoleChart roleCounts={payload.memberRoleCounts} />
              <MemberGrowthChart growth={payload.memberGrowth || []} />
            </div>
          )}

          {payload.recentMembers !== null && (
            <RecentMembersTable
              members={payload.recentMembers}
              viewAllHref={canSeeMembers ? `/teams/${team.slug}/members` : null}
            />
          )}

          {/* Same feature-flag gating as the stat card above. */}
          {payload.recentApiKeys !== null && teamFeatures.apiKey && (
            <RecentApiKeysTable
              apiKeys={payload.recentApiKeys}
              viewAllHref={
                canSeeApiKeys ? `/teams/${team.slug}/api-keys` : null
              }
            />
          )}
        </div>
      )}
    </>
  );
};

export async function getServerSideProps({
  locale,
}: GetServerSidePropsContext) {
  return {
    props: {
      ...(locale ? await serverSideTranslations(locale, ['common']) : {}),
      teamFeatures: env.teamFeatures,
    },
  };
}

export default TeamDashboard;
