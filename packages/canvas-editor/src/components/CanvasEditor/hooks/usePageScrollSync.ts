import React, { useEffect, useRef } from 'react';

interface UsePageScrollSyncParams {
  pagesLength: number;
  currentPageIndex: number;
  setCurrentPageIndex: (index: number) => void;
  pageDomRefsRef: React.MutableRefObject<React.RefObject<HTMLDivElement | null>[]>;
  ignoreScrollSyncUntilRef: React.MutableRefObject<number>;
}

/**
 * Keeps the active page in sync with scroll position and vice versa:
 * - An IntersectionObserver mirrors the most-visible page as the active page
 *   (so the thumbnail strip highlight follows the user's scroll).
 * - When a page is added/duplicated (page count AND active index change in the
 *   same render) the new page is smooth-scrolled into view.
 *
 * During programmatic smooth-scrolls the observer is briefly suppressed via
 * `ignoreScrollSyncUntilRef` so the destination page stays selected.
 */
export function usePageScrollSync({
  pagesLength,
  currentPageIndex,
  setCurrentPageIndex,
  pageDomRefsRef,
  ignoreScrollSyncUntilRef,
}: UsePageScrollSyncParams): void {
  // Track which page is most-visible in the viewport and mirror that as the
  // active page (so the thumbnail strip's highlight follows the user's scroll).
  useEffect(() => {
    if (pagesLength < 2) return undefined;
    const refs = pageDomRefsRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < ignoreScrollSyncUntilRef.current) return;
        let bestIdx = -1;
        let bestRatio = 0;
        entries.forEach((entry) => {
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            const idxAttr = (entry.target as HTMLElement).dataset.pageIndex;
            if (idxAttr != null) bestIdx = Number(idxAttr);
          }
        });
        if (bestIdx !== -1) {
          setCurrentPageIndex(bestIdx);
        }
      },
      { root: null, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    refs.forEach((r) => {
      if (r.current) observer.observe(r.current);
    });
    return () => observer.disconnect();
  }, [pagesLength, setCurrentPageIndex, pageDomRefsRef, ignoreScrollSyncUntilRef]);

  // Auto-scroll to a newly added page so the user sees the result of
  // "Seite duplizieren" / "Seite hinzufügen" without manually scrolling.
  // We only scroll when BOTH the page count AND the active index changed in
  // the same render — that's the signature of an add/duplicate, not a plain
  // scroll-driven IntersectionObserver update.
  const prevPagesSignatureRef = useRef({
    length: pagesLength,
    index: currentPageIndex,
  });
  useEffect(() => {
    const prev = prevPagesSignatureRef.current;
    const lengthIncreased = pagesLength > prev.length;
    const indexChanged = currentPageIndex !== prev.index;
    if (lengthIncreased && indexChanged) {
      const target = pageDomRefsRef.current[currentPageIndex];
      ignoreScrollSyncUntilRef.current = Date.now() + 800;
      const t = setTimeout(() => {
        target?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
      prevPagesSignatureRef.current = { length: pagesLength, index: currentPageIndex };
      return () => clearTimeout(t);
    }
    prevPagesSignatureRef.current = { length: pagesLength, index: currentPageIndex };
    return undefined;
  }, [pagesLength, currentPageIndex, pageDomRefsRef, ignoreScrollSyncUntilRef]);
}
