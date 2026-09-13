import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import {
  AdjustmentsHorizontalIcon,
  BanknotesIcon,
  ClipboardDocumentListIcon,
  HomeIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';

interface AdminNavProps {
  activeTab:
    | 'overview'
    | 'revenue'
    | 'users'
    | 'tenants'
    | 'rules'
    | 'audit-logs';
}

interface AdminNavItem {
  name: string;
  href: string;
  key: AdminNavProps['activeTab'];
  icon: typeof HomeIcon;
  /** Target page is not built yet — render inert, not a dead link. */
  upcoming?: boolean;
}

export const AdminNav: React.FC<AdminNavProps> = ({ activeTab }) => {
  const { t } = useTranslation('common');

  const navItems: AdminNavItem[] = [
    {
      name: t('admin-nav-overview'),
      href: '/admin',
      key: 'overview',
      icon: HomeIcon,
    },
    {
      name: t('admin-nav-revenue'),
      href: '/admin/revenue',
      key: 'revenue',
      icon: BanknotesIcon,
    },
    {
      name: t('admin-nav-users'),
      href: '/admin/users',
      key: 'users',
      icon: UsersIcon,
    },
    {
      name: t('admin-nav-rules', 'قواعد وصلاحيات الباقات'),
      href: '/admin/rules',
      key: 'rules',
      icon: AdjustmentsHorizontalIcon,
    },
    {
      name: t('admin-nav-audit-logs', 'سجل العمليات'),
      href: '/admin/audit-logs',
      key: 'audit-logs',
      icon: ClipboardDocumentListIcon,
    },
  ];

  // Direction is inherited from the locale-aware page container that renders
  // <AdminNav> (pages/admin.tsx, pages/admin/revenue.tsx) and from <Html dir> in
  // pages/_document.tsx. Do NOT re-add dir="rtl" here: it would force the
  // English admin UI back to RTL.
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-8">
      <div className="flex justify-between items-center flex-wrap gap-4 mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('admin-platform-title')}
            </h1>
            <p className="text-xs text-gray-500">
              {t('admin-platform-subtitle')}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="btn btn-sm btn-ghost gap-1.5 text-xs"
        >
          {t('admin-back-to-team')}
        </Link>
      </div>

      <nav className="flex gap-2 border-b border-gray-100 dark:border-gray-800">
        {navItems.map((item) => {
          const isActive = activeTab === item.key;
          const Icon = item.icon;

          if (item.upcoming) {
            return (
              <span
                key={item.key}
                aria-disabled="true"
                className="inline-flex cursor-not-allowed items-center gap-2 border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold text-gray-400 dark:text-gray-500"
              >
                <Icon className="h-4 w-4" />
                {item.name}
                <span className="badge badge-ghost badge-xs">قريباً</span>
              </span>
            );
          }

          return (
            <Link
              key={item.key}
              href={item.href}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300 dark:hover:text-gray-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default AdminNav;
