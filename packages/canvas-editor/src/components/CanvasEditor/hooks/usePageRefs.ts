import React, { useMemo, useRef } from 'react';

import type { GenericCanvasRef } from '../../GenericCanvas';

export interface PageRefs {
  /** One GenericCanvas ref per page (imperative handle). */
  canvasRefsRef: React.MutableRefObject<React.RefObject<GenericCanvasRef | null>[]>;
  /** One DOM ref per PageWrapper root — for IntersectionObserver + scroll-into-view. */
  pageDomRefsRef: React.MutableRefObject<React.RefObject<HTMLDivElement | null>[]>;
  /** The scroll container wrapping all pages. */
  pagesContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Timestamp until which IntersectionObserver scroll-sync should be ignored. */
  ignoreScrollSyncUntilRef: React.MutableRefObject<number>;
  /** Stable slice of canvas refs sized to the current page count. */
  canvasRefs: React.RefObject<GenericCanvasRef | null>[];
}

/**
 * Owns the imperative ref arrays for the canvas editor. The arrays are grown
 * synchronously (before render) so refs are available during the first render
 * pass — avoiding race conditions where a ref is read before an effect runs.
 */
export function usePageRefs(pagesLength: number): PageRefs {
  // Create refs array for all canvas instances
  const canvasRefsRef = useRef<React.RefObject<GenericCanvasRef | null>[]>([]);

  // Ensure refs array has entries for all pages (synchronous, before render)
  // This must be synchronous to avoid race conditions where refs are accessed
  // during render before useEffect would run
  while (canvasRefsRef.current.length < pagesLength) {
    canvasRefsRef.current.push(React.createRef<GenericCanvasRef>());
  }
  canvasRefsRef.current.length = pagesLength;

  // DOM refs to each PageWrapper root — used for IntersectionObserver scroll tracking
  // and scroll-into-view from the thumbnail strip.
  const pageDomRefsRef = useRef<React.RefObject<HTMLDivElement | null>[]>([]);
  while (pageDomRefsRef.current.length < pagesLength) {
    pageDomRefsRef.current.push(React.createRef<HTMLDivElement>());
  }
  pageDomRefsRef.current.length = pagesLength;

  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const ignoreScrollSyncUntilRef = useRef(0);

  // Get stable refs array for the hook
  const canvasRefs = useMemo(() => {
    return canvasRefsRef.current.slice(0, pagesLength);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagesLength]);

  return {
    canvasRefsRef,
    pageDomRefsRef,
    pagesContainerRef,
    ignoreScrollSyncUntilRef,
    canvasRefs,
  };
}
