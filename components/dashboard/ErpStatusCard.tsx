import { Card } from '@/components/shared';
import Badge from '@/components/shared/Badge';
import { DashboardErp } from '@/lib/dashboard';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { formatDate } from './format';

interface ErpStatusCardProps {
  erp: DashboardErp;
  manageHref: string;
}

const ErpStatusCard = ({ erp, manageHref }: ErpStatusCardProps) => {
  const { t, i18n } = useTranslation('common');

  return (
    <Card>
      <Card.Body>
        <Card.Header>
          <Card.Title>{t('erp-connection')}</Card.Title>
        </Card.Header>
        {erp.linked ? (
          <div className="space-y-3 text-sm">
            <div>
              <Badge color="success">{t('erp-linked')}</Badge>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">
                {t('erp-tenant-id')}
              </span>
              <span className="font-mono text-xs text-gray-900 dark:text-gray-100">
                {erp.tenantId}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">
                {t('erp-subdomain')}
              </span>
              <span className="font-mono text-xs text-gray-900 dark:text-gray-100">
                {erp.subdomain}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500 dark:text-gray-400">
                {t('erp-linked-at')}
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {erp.linkedAt ? formatDate(erp.linkedAt, i18n.language) : '—'}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div>
              <Badge color="warning">{t('erp-not-linked')}</Badge>
            </div>
            <p className="text-gray-500 dark:text-gray-400">
              {t('erp-not-linked-description')}
            </p>
          </div>
        )}
        <div className="pt-4">
          <Link
            href={manageHref}
            className="text-sm font-medium text-primary hover:underline"
          >
            {erp.linked ? t('manage-erp') : t('connect-erp')}
          </Link>
        </div>
      </Card.Body>
    </Card>
  );
};

export default ErpStatusCard;
