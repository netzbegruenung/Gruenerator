import { memo } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/utils/cn';

export interface GlassTab<Id extends string = string> {
  id: Id;
  label: string;
  path: string;
}

interface GlassTabBarProps<Id extends string> {
  tabs: ReadonlyArray<GlassTab<Id>>;
  active: Id;
  ariaLabel: string;
  dataTour?: string;
}

// Segmented switch centred at the top, modelled on chatgpt.com's „Chat | Work":
// a barely-there grey track, equal 112 px segments, the current one a white pill
// with a hairline and a soft shadow that slides across (instantly with reduced
// motion). The track is slightly opaque and blurred, because content scrolls
// under the fixed bar. The h-12 row matches PageLayout's sidebar-toggle row so
// switch and toggle share a centerline. Every tab is a link to its own path: a
// switch is a history entry, so Back, reload and bookmarks keep the tab.
// Navigation links, not ARIA tabs — the current one carries `aria-current`
// (WAI-ARIA APG).
function GlassTabBarInner<Id extends string>({
  tabs,
  active,
  ariaLabel,
  dataTour,
}: GlassTabBarProps<Id>) {
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === active)
  );
  return (
    <nav
      aria-label={ariaLabel}
      className="pointer-events-none fixed left-0 right-0 top-0 z-40 flex h-12 items-center justify-center"
    >
      <div
        data-tour={dataTour}
        className={cn(
          'pointer-events-auto relative grid h-9 auto-cols-fr grid-flow-col rounded-full',
          'bg-[rgba(243,243,243,.85)] backdrop-blur-md dark:bg-[rgba(255,255,255,.07)]'
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 left-0 rounded-full bg-white',
            'border-[0.5px] border-black/10 shadow-[0_1px_6px_rgba(0,0,0,.05)]',
            'transition-transform duration-200 ease-out motion-reduce:transition-none',
            'dark:border-white/10 dark:bg-grey-800'
          )}
          style={{
            width: `${100 / tabs.length}%`,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <Link
              key={tab.id}
              to={tab.path}
              // The current tab again is no new step in the history.
              replace={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative z-10 flex min-w-28 select-none items-center justify-center rounded-full px-4',
                'text-sm font-medium no-underline transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
                isActive
                  ? 'text-[#0d0d0d] dark:text-grey-100'
                  : 'text-[#5d5d5d] hover:text-[#0d0d0d] dark:text-grey-400 dark:hover:text-grey-100'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

const GlassTabBar = memo(GlassTabBarInner) as typeof GlassTabBarInner;

export default GlassTabBar;
