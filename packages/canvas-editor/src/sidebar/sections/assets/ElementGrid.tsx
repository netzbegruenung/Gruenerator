import { useEffect, useRef, useState } from 'react';

import { ElementTile } from './ElementTile';

import type { ElementItem } from './elementTypes';

const PAGE_SIZE = 48;

/**
 * The three-column tile grid of a category or a search. Long sets (illustrations,
 * icons, emoji) grow page by page as the sentinel nears the viewport; tiles off
 * screen skip layout and paint through `content-visibility`.
 */
export function ElementGrid({
  items,
  onActivate,
  enterIndexOf,
  canDrag,
  isSelected,
  isDisabled,
}: {
  items: readonly ElementItem[];
  onActivate: (item: ElementItem) => void;
  enterIndexOf: (index: number) => number | null;
  canDrag: boolean;
  isSelected?: (item: ElementItem) => boolean;
  isDisabled?: (item: ElementItem) => boolean;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = items.length > limit;

  // A new list (search, other category) starts at the first page again.
  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setLimit(PAGE_SIZE);
  }

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!hasMore || !sentinel) return;
    const root = sentinel.closest<HTMLElement>('.sidebar-panel__content');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setLimit((l) => l + PAGE_SIZE);
      },
      { root, rootMargin: '400px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, limit]);

  return (
    <>
      <div className="grid grid-cols-3 gap-2.5 w-full">
        {items.slice(0, limit).map((item, i) => (
          <div
            key={item.key}
            className="min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_124px]"
          >
            <ElementTile
              item={item}
              variant="grid"
              onActivate={onActivate}
              enterIndex={enterIndexOf(i)}
              canDrag={canDrag}
              selected={isSelected?.(item) ?? false}
              disabled={isDisabled?.(item) ?? false}
            />
          </div>
        ))}
      </div>
      {hasMore && <div ref={sentinelRef} aria-hidden className="h-px w-full" />}
    </>
  );
}
