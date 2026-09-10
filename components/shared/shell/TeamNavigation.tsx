import { Cog6ToothIcon, HomeIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'next-i18next';
import NavigationItems from './NavigationItems';
import { NavigationProps, MenuItem } from './NavigationItems';

interface NavigationItemsProps extends NavigationProps {
  slug: string;
}

const TeamNavigation = ({ slug, activePathname }: NavigationItemsProps) => {
  const { t } = useTranslation('common');

  const teamRoot = `/teams/${slug}`;

  const menus: MenuItem[] = [
    {
      name: t('dashboard'),
      href: `${teamRoot}/dashboard`,
      icon: HomeIcon,
      active: activePathname === `${teamRoot}/dashboard`,
    },
    {
      name: t('settings'),
      href: `${teamRoot}/settings`,
      icon: Cog6ToothIcon,
      active:
        activePathname?.startsWith(teamRoot) &&
        !activePathname.startsWith(`${teamRoot}/dashboard`),
    },
  ];

  return <NavigationItems menus={menus} />;
};

export default TeamNavigation;
