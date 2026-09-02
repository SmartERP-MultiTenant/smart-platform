import { Card, EmptyState, LetterAvatar } from '@/components/shared';
import Badge from '@/components/shared/Badge';
import { DashboardMember } from '@/lib/dashboard';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { formatDate } from './format';

const roleColor = (role: string) => {
  switch (role) {
    case 'OWNER':
      return 'primary';
    case 'ADMIN':
      return 'secondary';
    default:
      return 'ghost';
  }
};

interface RecentMembersTableProps {
  members: DashboardMember[];
  viewAllHref?: string | null;
}

const RecentMembersTable = ({
  members,
  viewAllHref,
}: RecentMembersTableProps) => {
  const { t, i18n } = useTranslation('common');

  return (
    <Card>
      <Card.Body>
        <Card.Header>
          <div className="flex items-center justify-between gap-4">
            <Card.Title>{t('recent-members')}</Card.Title>
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
        {members.length === 0 ? (
          <EmptyState title={t('no-recent-members')} />
        ) : (
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left text-sm text-gray-500 dark:text-gray-400">
              <thead className="bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-400">
                <tr>
                  <th scope="col" className="px-6 py-3">
                    {t('name')}
                  </th>
                  <th scope="col" className="px-6 py-3">
                    {t('email')}
                  </th>
                  <th scope="col" className="px-6 py-3">
                    {t('role')}
                  </th>
                  <th scope="col" className="px-6 py-3">
                    {t('joined-at')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr
                    key={member.id}
                    className="border-b border-gray-200 bg-white last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <LetterAvatar name={member.name} />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {member.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3">{member.email}</td>
                    <td className="px-6 py-3">
                      <Badge color={roleColor(member.role)}>
                        {member.role}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      {formatDate(member.createdAt, i18n.language)}
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

export default RecentMembersTable;
