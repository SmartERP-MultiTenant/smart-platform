import { Card } from '@/components/shared';
import Badge from '@/components/shared/Badge';
import { DashboardSubscription } from '@/lib/dashboard';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { formatDate } from './format';

interface SubscriptionStatusCardProps {
  subscription: DashboardSubscription | null;
  viewAllHref?: string | null;
}

const SubscriptionStatusCard = ({
  subscription,
  viewAllHref,
}: SubscriptionStatusCardProps) => {
  const { t, i18n } = useTranslation('common');

  return (
    <Card>
      <Card.Body>
        <Card.Header>
          <Card.Title>{t('subscription-status')}</Card.Title>
        </Card.Header>
        {subscription ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">
                {t('plan')}
              </span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {subscription.planName || t('unknown')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">
                {t('start-date')}
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {formatDate(subscription.startDate, i18n.language)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">
                {t('subscription-expires')}
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {formatDate(subscription.endDate, i18n.language)}
              </span>
            </div>
            <div>
              <Badge color="success">{t('active')}</Badge>
            </div>
          </div>
        ) : (
          <div className="py-6 text-sm text-gray-500 dark:text-gray-400">
            {t('no-active-subscription')}
          </div>
        )}
        {viewAllHref && (
          <div className="pt-4">
            <Link
              href={viewAllHref}
              className="text-sm font-medium text-primary hover:underline"
            >
              {t('manage-subscription')}
            </Link>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default SubscriptionStatusCard;
