import { Card, EmptyState } from '@/components/shared';
import { DashboardRoleCount, DashboardGrowthPoint } from '@/lib/dashboard';
import { useTranslation } from 'next-i18next';
import ApexChart from './charts/ApexChart';
import { chartBaseOptions, chartColors } from './charts/theme';
import useIsDark from './charts/useIsDark';
import { formatMonth } from './format';

interface MemberRoleChartProps {
  roleCounts: DashboardRoleCount[];
}

const MemberRoleChart = ({ roleCounts }: MemberRoleChartProps) => {
  const { t } = useTranslation('common');
  const isDark = useIsDark();

  return (
    <Card>
      <Card.Body>
        <Card.Header>
          <Card.Title>{t('member-role-distribution')}</Card.Title>
        </Card.Header>
        {roleCounts.length === 0 ? (
          <EmptyState title={t('no-members-yet')} />
        ) : (
          <ApexChart
            type="donut"
            height={300}
            options={{
              ...chartBaseOptions(isDark),
              labels: roleCounts.map((item) => item.role),
              colors: chartColors.series.slice(0, roleCounts.length),
              legend: { position: 'bottom' },
              stroke: { width: 0 },
              plotOptions: {
                pie: {
                  donut: {
                    size: '72%',
                    labels: {
                      show: true,
                      total: {
                        show: true,
                        label: t('members'),
                      },
                    },
                  },
                },
              },
            }}
            series={roleCounts.map((item) => item.count)}
          />
        )}
      </Card.Body>
    </Card>
  );
};

interface MemberGrowthChartProps {
  growth: DashboardGrowthPoint[];
}

const MemberGrowthChart = ({ growth }: MemberGrowthChartProps) => {
  const { t, i18n } = useTranslation('common');
  const isDark = useIsDark();

  const hasData = growth.some((point) => point.count > 0);

  return (
    <Card>
      <Card.Body>
        <Card.Header>
          <Card.Title>{t('member-growth')}</Card.Title>
        </Card.Header>
        {hasData ? (
          <ApexChart
            type="area"
            height={300}
            options={{
              ...chartBaseOptions(isDark),
              colors: [chartColors.series[0]],
              stroke: { curve: 'smooth', width: 2 },
              fill: {
                type: 'gradient',
                gradient: {
                  shadeIntensity: 1,
                  opacityFrom: 0.35,
                  opacityTo: 0.05,
                },
              },
              xaxis: {
                categories: growth.map((point) =>
                  formatMonth(point.month, i18n.language)
                ),
              },
              yaxis: { min: 0, forceNiceScale: true },
            }}
            series={[
              {
                name: t('members'),
                data: growth.map((point) => point.count),
              },
            ]}
          />
        ) : (
          <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            {t('no-members-yet')}
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export { MemberRoleChart, MemberGrowthChart };
