import { motion, useReducedMotion } from 'motion/react';
import { memo, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/utils/cn';

export type WorkplaceTab = 'chat' | 'arbeiten' | 'wissen';

const TABS: Array<{ id: WorkplaceTab; label: string; path: string }> = [
  { id: 'chat', label: 'Chat', path: '/workplace' },
  { id: 'arbeiten', label: 'Arbeiten', path: '/workplace/arbeiten' },
  { id: 'wissen', label: 'Wissen', path: '/workplace/wissen' },
];

// The active pill + label echo each section's palette: chat neutral, arbeiten a
// soft green, wissen magenta — a subtle cue that stays quiet.
const PILL_TINT: Record<WorkplaceTab, string> = {
  chat: 'bg-white dark:bg-grey-800',
  arbeiten: 'bg-[#E9F4EC] dark:bg-[#16301F]',
  wissen: 'bg-[#FBE4F0] dark:bg-[#3A1E2C]',
};

const ACTIVE_TEXT: Record<WorkplaceTab, string> = {
  chat: 'text-grey-900 dark:text-grey-100',
  arbeiten: 'text-primary-700 dark:text-primary-300',
  wissen: 'text-[#C4006A] dark:text-[#F2A9CE]',
};

export function workplaceTabFromPathname(pathname: string): WorkplaceTab {
  if (pathname.startsWith('/workplace/arbeiten')) return 'arbeiten';
  if (pathname.startsWith('/workplace/wissen')) return 'wissen';
  return 'chat';
}

interface PillRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Each /workplace path is its own route, so switching tabs remounts the whole
// page — a shared-layout `layoutId` pill can't persist across that. Instead we
// remember the previous tab in module scope and, on mount, start the pill at
// that tab's slot and animate it to the active one: a real slide that survives
// the remount (and still animates in-place if the bar ever stays mounted).
let previousTab: WorkplaceTab | null = null;

// Design "tabbar": fixed glass pill centered at the top — frosted container, the
// active tab a soft-shadowed pill that slides between tabs and tints per section.
// The h-12 row matches PageLayout's sidebar-toggle row so pill and toggle share a
// centerline.
const WorkplaceTabs = memo(({ active }: { active: WorkplaceTab }) => {
  const reduceMotion = useReducedMotion();
  const tabRefs = useRef<Partial<Record<WorkplaceTab, HTMLAnchorElement | null>>>({});
  const initialised = useRef(false);
  const [rect, setRect] = useState<PillRect | null>(null);

  useLayoutEffect(() => {
    const measure = (id: WorkplaceTab): PillRect | null => {
      const el = tabRefs.current[id];
      return el
        ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight }
        : null;
    };

    const target = measure(active);
    if (!target) return;

    // First mount after a tab switch: seed at the previous tab, then animate to
    // the active one on the next frame so the pill visibly slides across.
    if (!initialised.current) {
      initialised.current = true;
      const from = previousTab && previousTab !== active ? measure(previousTab) : null;
      previousTab = active;
      if (from && !reduceMotion) {
        setRect(from);
        const raf = requestAnimationFrame(() => setRect(target));
        return () => cancelAnimationFrame(raf);
      }
    }

    previousTab = active;
    setRect(target);
  }, [active, reduceMotion]);

  return (
    <nav
      aria-label="Workplace-Bereiche"
      className="pointer-events-none fixed left-0 right-0 top-0 z-40 flex h-12 items-center justify-center"
    >
      <div
        role="tablist"
        data-tour="workplace-tabs"
        className={cn(
          'pointer-events-auto relative inline-flex gap-0.5 rounded-full p-[3px]',
          'border border-white/50 bg-[rgba(246,246,244,.6)]',
          'backdrop-blur-[16px] backdrop-saturate-[1.6]',
          'shadow-[0_4px_20px_rgba(31,63,51,.10),inset_0_1px_0_rgba(255,255,255,.6)]',
          'dark:border-white/10 dark:bg-grey-900/60 dark:shadow-[0_4px_20px_rgba(0,0,0,.35)]'
        )}
      >
        {rect && (
          <motion.span
            aria-hidden
            className={cn(
              'absolute z-0 rounded-full shadow-[0_1px_2px_rgba(0,0,0,.10),0_1px_6px_rgba(0,0,0,.05)]',
              PILL_TINT[active]
            )}
            initial={false}
            animate={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
            transition={
              reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }
            }
          />
        )}
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <Link
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              to={tab.path}
              replace
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative z-10 select-none rounded-full px-4 py-1 text-[13.5px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
                isActive
                  ? cn('font-semibold', ACTIVE_TEXT[tab.id])
                  : 'text-grey-600 hover:text-foreground dark:text-grey-400 dark:hover:text-grey-200'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
});
WorkplaceTabs.displayName = 'WorkplaceTabs';

export default WorkplaceTabs;
