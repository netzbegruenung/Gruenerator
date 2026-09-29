import { useEffect, useRef } from 'react';

import type React from 'react';

interface UseScrollToAddedPageParams {
  pagesLength: number;
  currentPageIndex: number;
  pageDomRefsRef: React.MutableRefObject<React.RefObject<HTMLDivElement | null>[]>;
}

/**
 * Smooth-scrolls a newly added/duplicated page into view (page count AND
 * active index change in the same render).
 *
 * Scrolling deliberately never changes the active page: an
 * IntersectionObserver used to do that, and each switch swapped the context
 * toolbar, shifted every Stage under the pointer and threw off a running drag.
 * The active page now changes on interaction only (PageWrapper, thumbnails).
 */
export function useScrollToAddedPage({
  pagesLength,
  currentPageIndex,
  pageDomRefsRef,
}: UseScrollToAddedPageParams): void {
  const prevPagesSignatureRef = useRef({
    length: pagesLength,
    index: currentPageIndex,
  });
  useEffect(() => {
    const prev = prevPagesSignatureRef.current;
    const lengthIncreased = pagesLength > prev.length;
    const indexChanged = currentPageIndex !== prev.index;
    prevPagesSignatureRef.current = { length: pagesLength, index: currentPageIndex };
    if (!lengthIncreased || !indexChanged) return undefined;
    const target = pageDomRefsRef.current[currentPageIndex];
    const t = setTimeout(() => {
      target?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    return () => clearTimeout(t);
  }, [pagesLength, currentPageIndex, pageDomRefsRef]);
}
