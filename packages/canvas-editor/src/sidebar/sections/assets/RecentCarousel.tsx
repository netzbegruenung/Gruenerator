import { useCallback, useEffect, useRef, useState } from 'react';
import { PiCaretRightBold } from 'react-icons/pi';

import { cn } from '../../../utils/cn';
import { scrollBehavior } from '../../../utils/scrollBehavior';
import { HIDDEN_SCROLLBAR } from '../../sidebarStyles';

import { ElementTile } from './ElementTile';

import type { ElementItem } from './elementTypes';

/** One "page" of the carousel: two 88px tiles and their gaps. */
const SCROLL_STEP = 192;

export function RecentCarousel({
  items,
  onActivate,
  enterIndexOf,
  canDrag,
}: {
  items: readonly ElementItem[];
  onActivate: (item: ElementItem) => void;
  enterIndexOf: (index: number) => number | null;
  canDrag: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [canScroll, setCanScroll] = useState(false);

  // Measured at most once per frame; the arrow hides when the row ends.
  const measure = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const row = rowRef.current;
      if (row) setCanScroll(row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
    });
  }, []);

  useEffect(() => {
    measure();
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [measure, items.length]);

  return (
    <div className="relative">
      <div
        ref={rowRef}
        onScroll={measure}
        className={cn(
          'flex gap-2 overflow-x-auto scroll-smooth motion-reduce:scroll-auto',
          HIDDEN_SCROLLBAR
        )}
      >
        {items.map((item, i) => (
          <ElementTile
            key={item.key}
            item={item}
            variant="recent"
            onActivate={onActivate}
            enterIndex={enterIndexOf(i)}
            canDrag={canDrag}
            eager
          />
        ))}
      </div>
      <div
        className={cn(
          'absolute right-0 inset-y-0 w-[52px] flex items-center justify-end pointer-events-none',
          'bg-[linear-gradient(90deg,transparent,var(--editor-surface)_70%)]',
          'transition-opacity duration-200',
          canScroll ? 'opacity-100' : 'opacity-0'
        )}
      >
        <button
          type="button"
          aria-label="Weitere zuletzt verwendete Elemente"
          tabIndex={canScroll ? 0 : -1}
          onClick={() =>
            rowRef.current?.scrollBy({ left: SCROLL_STEP, behavior: scrollBehavior() })
          }
          className={cn(
            'size-8 rounded-full grid place-items-center border-none cursor-pointer',
            'bg-[var(--editor-surface)] text-[var(--editor-text)] shadow-md',
            'transition-transform duration-150 hover:scale-[1.08]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]',
            canScroll && 'pointer-events-auto'
          )}
        >
          <PiCaretRightBold size={16} />
        </button>
      </div>
    </div>
  );
}
