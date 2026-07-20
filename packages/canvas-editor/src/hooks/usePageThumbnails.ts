import { useEffect, useMemo, useRef, useState } from 'react';

import type { GenericCanvasRef } from '../components/GenericCanvas';
import type { HeterogeneousPage } from '../configs/types';

interface UsePageThumbnailsOptions {
  pages: HeterogeneousPage[];
  canvasRefs: Array<React.RefObject<GenericCanvasRef | null>>;
  currentPageIndex: number;
  refreshIntervalMs?: number;
  pixelRatio?: number;
}

export function usePageThumbnails({
  pages,
  canvasRefs,
  currentPageIndex,
  refreshIntervalMs = 1500,
  pixelRatio = 0.25,
}: UsePageThumbnailsOptions): Map<string, string> {
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(() => new Map());
  const cacheRef = useRef<Map<string, string>>(new Map());

  // Effects key on the page-ID SET, with live data read through refs —
  // `pages` gets a new identity on every edit, and re-keying the timers on it
  // would reset the refresh interval on each keystroke (so it never fires
  // while the user is actually editing).
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const canvasRefsRef = useRef(canvasRefs);
  canvasRefsRef.current = canvasRefs;
  const currentPageIndexRef = useRef(currentPageIndex);
  currentPageIndexRef.current = currentPageIndex;
  const pageIdsKey = useMemo(() => pages.map((p) => p.id).join('|'), [pages]);

  useEffect(() => {
    const captureMissing = () => {
      let updated = false;
      pagesRef.current.forEach((page, idx) => {
        if (cacheRef.current.has(page.id)) return;
        const ref = canvasRefsRef.current[idx]?.current;
        if (!ref?.toDataURL) return;
        const dataUrl = ref.toDataURL({ format: 'png', pixelRatio });
        if (dataUrl) {
          cacheRef.current.set(page.id, dataUrl);
          updated = true;
        }
      });
      if (updated) {
        setThumbnails(new Map(cacheRef.current));
      }
    };

    const t1 = setTimeout(captureMissing, 200);
    const t2 = setTimeout(captureMissing, 800);
    const t3 = setTimeout(captureMissing, 1800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [pageIdsKey, pixelRatio]);

  // Refresh the active page every tick plus ONE non-active page on a rotating
  // cursor — remote/off-screen edits eventually reach every thumbnail without
  // re-snapshotting the whole deck at once.
  const rotationRef = useRef(0);
  useEffect(() => {
    const capture = (index: number): boolean => {
      const page = pagesRef.current[index];
      const ref = canvasRefsRef.current[index]?.current;
      if (!page || !ref?.toDataURL) return false;
      const dataUrl = ref.toDataURL({ format: 'png', pixelRatio });
      if (!dataUrl || cacheRef.current.get(page.id) === dataUrl) return false;
      cacheRef.current.set(page.id, dataUrl);
      return true;
    };

    const interval = setInterval(() => {
      const activeIndex = currentPageIndexRef.current;
      const pageCount = pagesRef.current.length;
      let updated = capture(activeIndex);
      if (pageCount > 1) {
        rotationRef.current = (rotationRef.current + 1) % pageCount;
        if (rotationRef.current === activeIndex) {
          rotationRef.current = (rotationRef.current + 1) % pageCount;
        }
        updated = capture(rotationRef.current) || updated;
      }
      if (updated) setThumbnails(new Map(cacheRef.current));
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [pageIdsKey, refreshIntervalMs, pixelRatio]);

  useEffect(() => {
    const ids = new Set(pages.map((p) => p.id));
    let changed = false;
    for (const id of cacheRef.current.keys()) {
      if (!ids.has(id)) {
        cacheRef.current.delete(id);
        changed = true;
      }
    }
    if (changed) {
      setThumbnails(new Map(cacheRef.current));
    }
  }, [pages]);

  return thumbnails;
}
