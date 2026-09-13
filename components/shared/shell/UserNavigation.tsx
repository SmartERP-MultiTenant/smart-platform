import {
  RectangleStackIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from 'next-i18next';
import { useSession } from 'next-auth/react';
import NavigationItems from './NavigationItems';
import { MenuItem, NavigationProps } from './NavigationItems';

const UserNavigation = ({ activePathname }: NavigationProps) => {
  const { t } = useTranslation('common');
  const { data: session } = useSession();

  const menus: MenuItem[] = [
    {
      name: t('all-teams'),
      href: '/teams',
      icon: RectangleStackIcon,
      active: activePathname === '/teams',
    },
    {
      name: t('account'),
      href: '/settings/account',
      icon: UserCircleIcon,
      active: activePathname === '/settings/account',
    },
    {
      name: t('security'),
      href: '/settings/security',
      icon: ShieldCheckIcon,
      active: activePathname === '/settings/security',
    },
  ];

  if (session?.user?.isPlatformAdmin) {
    menus.push({
      name: 'لوحة تحكم المنصة',
      href: '/admin',
      icon: AdjustmentsHorizontalIcon,
      active:
        activePathname === '/admin' || activePathname?.startsWith('/admin/'),
    });
  }

  return <NavigationItems menus={menus} />;
};

export default UserNavigation;
