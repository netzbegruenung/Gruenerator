import { memo } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/utils/cn';

export type WorkplaceTab = 'chat' | 'arbeiten' | 'wissen';

const TABS: Array<{ id: WorkplaceTab; label: string; path: string }> = [
  { id: 'chat', label: 'Chat', path: '/workplace' },
  { id: 'arbeiten', label: 'Arbeiten', path: '/workplace/arbeiten' },
  { id: 'wissen', label: 'Wissen', path: '/workplace/wissen' },
];

export function workplaceTabFromPathname(pathname: string): WorkplaceTab {
  if (pathname.startsWith('/workplace/arbeiten')) return 'arbeiten';
  if (pathname.startsWith('/workplace/wissen')) return 'wissen';
  return 'chat';
}

const WorkplaceTabs = memo(
  ({ active, className }: { active: WorkplaceTab; className?: string }) => (
    <nav
      aria-label="Workplace-Bereiche"
      className={cn('flex items-center justify-center gap-1.5 pt-4', className)}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            to={tab.path}
            replace
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-semibold transition-colors select-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
              isActive
                ? 'bg-primary-50 text-primary-800 dark:bg-primary-500/10 dark:text-primary-300'
                : 'text-grey-600 hover:bg-grey-100 hover:text-foreground dark:text-grey-400 dark:hover:bg-grey-800'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  )
);
WorkplaceTabs.displayName = 'WorkplaceTabs';

export default WorkplaceTabs;
