import type { ComponentType } from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon?: ComponentType<{ className?: string }>;
  description?: string;
}

/**
 * DashWind-style stat card built on the daisyUI `stats` component.
 * Colors come from daisyUI theme tokens (corporate / black), matching the
 * shell's gray/dark convention instead of hardcoded palettes.
 */
const StatCard = ({ title, value, icon: Icon, description }: StatCardProps) => {
  return (
    <div className="stats w-full border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-black">
      <div className="stat">
        {Icon && (
          <div className="stat-figure text-primary dark:text-primary">
            <Icon className="h-8 w-8" />
          </div>
        )}
        <div className="stat-title text-gray-500 dark:text-gray-400">
          {title}
        </div>
        <div className="stat-value text-gray-900 dark:text-gray-100">
          {value}
        </div>
        {description && (
          <div className="stat-desc text-gray-500 dark:text-gray-400">
            {description}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
