import { motion, useReducedMotion } from 'motion/react';
import { memo, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/utils/cn';

/** The two tints the design knows: neutral (Chat) and soft green (Arbeiten). */
export type GlassTabTone = 'neutral' | 'green';

export interface GlassTab<Id extends string = string> {
  id: Id;
  label: string;
  /** Route of the tab. Ignored when the bar gets `onSelect`. */
  path?: string;
  tone: GlassTabTone;
}

/** Element ids that tie a button tab to its `role="tabpanel"`. */
export const glassTabIds = (layoutId: string, id: string) => ({
  tab: `${layoutId}-tab-${id}`,
  panel: `${layoutId}-panel-${id}`,
});

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
  /** Distinct per bar, so two bars never animate one shared pill. */
  layoutId: string;
  dataTour?: string;
  /**
   * Tabs of one page: the bar renders buttons with roving focus (←/→) and the
   * page owns the panels (ids from `glassTabIds`). Without it every tab is a
   * link to its own route.
   */
  onSelect?: (id: Id) => void;
}

// Design "tabbar": fixed glass pill centered at the top — frosted container, the
// active tab a soft-shadowed pill that tints per section. The pill only slides
// when the bar survives the switch, i.e. with `onSelect`; link tabs that are
// separate routes remount the bar and the pill just appears. The h-12 row matches
// PageLayout's sidebar-toggle row so pill and toggle share a centerline.
function GlassTabBarInner<Id extends string>({
  tabs,
  active,
  ariaLabel,
  layoutId,
  dataTour,
  onSelect,
}: GlassTabBarProps<Id>) {
  const reduceMotion = useReducedMotion();

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!onSelect || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : -1;
    const index = tabs.findIndex((tab) => tab.id === active);
    const next = tabs[(index + step + tabs.length) % tabs.length];
    onSelect(next.id);
    document.getElementById(glassTabIds(layoutId, next.id).tab)?.focus();
  };

  return (
    <nav
      aria-label={ariaLabel}
      className="pointer-events-none fixed left-0 right-0 top-0 z-40 flex h-12 items-center justify-center"
    >
      <div
        role="tablist"
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
          const content: ReactNode = (
            <>
              {isActive && (
                <motion.span
                  layoutId={layoutId}
                  aria-hidden
                  className={cn(
                    'absolute inset-0 z-0 rounded-full shadow-[0_1px_2px_rgba(0,0,0,.10),0_1px_6px_rgba(0,0,0,.05)]',
                    PILL_TINT[tab.tone]
                  )}
                  transition={
                    reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }
                  }
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </>
          );
          if (onSelect) {
            const ids = glassTabIds(layoutId, tab.id);
            return (
              <button
                key={tab.id}
                id={ids.tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={ids.panel}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onSelect(tab.id)}
                onKeyDown={onKeyDown}
                className={className}
              >
                {content}
              </button>
            );
          }
          return (
            <Link
              key={tab.id}
              to={tab.path ?? '.'}
              replace
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={className}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

const GlassTabBar = memo(GlassTabBarInner) as typeof GlassTabBarInner;

export default GlassTabBar;
