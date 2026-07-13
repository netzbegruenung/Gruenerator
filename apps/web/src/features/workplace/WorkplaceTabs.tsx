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

// Design "tabbar": fixed glass pill centered at the top — frosted container,
// active tab as a white pill with a soft shadow. The h-12 row matches
// PageLayout's sidebar-toggle row so pill and toggle share a centerline.
const WorkplaceTabs = memo(({ active }: { active: WorkplaceTab }) => (
  <nav
    aria-label="Workplace-Bereiche"
    className="pointer-events-none fixed left-0 right-0 top-0 z-40 flex h-12 items-center justify-center"
  >
    <div
      role="tablist"
      data-tour="workplace-tabs"
      className={cn(
        'pointer-events-auto inline-flex gap-0.5 rounded-full p-[3px]',
        'border border-white/50 bg-[rgba(246,246,244,.6)]',
        'backdrop-blur-[16px] backdrop-saturate-[1.6]',
        'shadow-[0_4px_20px_rgba(31,63,51,.10),inset_0_1px_0_rgba(255,255,255,.6)]',
        'dark:border-white/10 dark:bg-grey-900/60 dark:shadow-[0_4px_20px_rgba(0,0,0,.35)]'
      )}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            to={tab.path}
            replace
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'select-none rounded-full px-4 py-1 text-[13.5px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
              isActive
                ? 'bg-white font-semibold text-primary-800 shadow-[0_1px_2px_rgba(0,0,0,.10),0_1px_6px_rgba(0,0,0,.05)] dark:bg-grey-800 dark:text-primary-300'
                : 'text-grey-600 hover:text-foreground dark:text-grey-400 dark:hover:text-grey-200'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  </nav>
));
WorkplaceTabs.displayName = 'WorkplaceTabs';

export default WorkplaceTabs;
