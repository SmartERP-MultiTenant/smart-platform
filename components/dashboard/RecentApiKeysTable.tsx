import { Card, EmptyState } from '@/components/shared';
import { DashboardApiKey } from '@/lib/dashboard';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { formatDate } from './format';

interface RecentApiKeysTableProps {
  apiKeys: DashboardApiKey[];
  viewAllHref?: string | null;
}

const RecentApiKeysTable = ({
  apiKeys,
  viewAllHref,
}: RecentApiKeysTableProps) => {
  const { t, i18n } = useTranslation('common');

  return (
    <Card>
      <Card.Body>
        <Card.Header>
          <div className="flex items-center justify-between gap-4">
            <Card.Title>{t('recent-api-keys')}</Card.Title>
            {viewAllHref && (
              <Link
                href={viewAllHref}
                className="text-sm font-medium text-primary hover:underline"
              >
                {t('view-all')}
              </Link>
            )}
          </div>
        </Card.Header>
        {apiKeys.length === 0 ? (
          <EmptyState title={t('no-recent-api-keys')} />
        ) : (
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
              <thead className="bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-400">
                <tr>
                  <th scope="col" className="px-6 py-3">
                    {t('name')}
                  </th>
                  <th scope="col" className="px-6 py-3">
                    {t('created-at')}
                  </th>
                  <th scope="col" className="px-6 py-3">
                    {t('last-used')}
                  </th>
                  <th scope="col" className="px-6 py-3">
                    {t('expires-at')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((apiKey) => (
                  <tr
                    key={apiKey.id}
                    className="border-b border-gray-200 bg-white last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
                  >
                    <td className="px-6 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {apiKey.name}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      {formatDate(apiKey.createdAt, i18n.language)}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      {apiKey.lastUsedAt
                        ? formatDate(apiKey.lastUsedAt, i18n.language)
                        : t('never-used')}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      {apiKey.expiresAt
                        ? formatDate(apiKey.expiresAt, i18n.language)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default RecentApiKeysTable;
