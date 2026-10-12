import { memo } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/utils/cn';

/** The two tints the design knows: neutral (Chat) and soft green (Arbeiten). */
export type GlassTabTone = 'neutral' | 'green';

export interface GlassTab<Id extends string = string> {
  id: Id;
  label: string;
  path: string;
  tone: GlassTabTone;
}

// The active pill + label echo each section's palette — a subtle cue that stays quiet.
const PILL_TINT: Record<GlassTabTone, string> = {
  neutral: 'bg-white dark:bg-grey-800',
  green: 'bg-[#E9F4EC] dark:bg-[#16301F]',
};

const ACTIVE_TEXT: Record<GlassTabTone, string> = {
  neutral: 'text-grey-900 dark:text-grey-100',
  green: 'text-primary-700 dark:text-primary-300',
};

interface GlassTabBarProps<Id extends string> {
  tabs: ReadonlyArray<GlassTab<Id>>;
  active: Id;
  ariaLabel: string;
  dataTour?: string;
}

// Design "tabbar": fixed glass pill centered at the top — frosted container, the
// active tab a soft-shadowed pill that tints per section. The pill switches in
// place without sliding — a switch should feel calm, not travel. The h-12 row
// matches PageLayout's sidebar-toggle row so pill and toggle share a centerline.
// Every tab is a link to its own path: a switch is a history entry, so Back,
// reload and bookmarks keep the tab. Navigation links, not ARIA tabs — the
// current one carries `aria-current` (WAI-ARIA APG).
function GlassTabBarInner<Id extends string>({
  tabs,
  active,
  ariaLabel,
  dataTour,
}: GlassTabBarProps<Id>) {
  return (
    <nav
      aria-label={ariaLabel}
      className="pointer-events-none fixed left-0 right-0 top-0 z-40 flex h-12 items-center justify-center"
    >
      <div
        data-tour={dataTour}
        className={cn(
          'pointer-events-auto inline-flex gap-0.5 rounded-full p-1',
          'border border-white/50 bg-[rgba(246,246,244,.6)]',
          'backdrop-blur-[16px] backdrop-saturate-[1.6]',
          'shadow-[0_4px_20px_rgba(31,63,51,.10),inset_0_1px_0_rgba(255,255,255,.6)]',
          'dark:border-white/10 dark:bg-grey-900/60 dark:shadow-[0_4px_20px_rgba(0,0,0,.35)]'
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          const className = cn(
            'relative select-none rounded-full px-8 py-[5px] text-[15px] font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
            isActive
              ? cn('font-semibold', ACTIVE_TEXT[tab.tone])
              : 'text-grey-600 hover:text-foreground dark:text-grey-400 dark:hover:text-grey-200'
          );
          return (
            <Link
              key={tab.id}
              to={tab.path}
              // The current tab again is no new step in the history.
              replace={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={className}
            >
              {isActive && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-0 z-0 rounded-full shadow-[0_1px_2px_rgba(0,0,0,.10),0_1px_6px_rgba(0,0,0,.05)]',
                    PILL_TINT[tab.tone]
                  )}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

const GlassTabBar = memo(GlassTabBarInner) as typeof GlassTabBarInner;

export default GlassTabBar;
