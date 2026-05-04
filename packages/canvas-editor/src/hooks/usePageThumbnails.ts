import { useEffect, useRef, useState } from 'react';

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

  useEffect(() => {
    const captureMissing = () => {
      let updated = false;
      pages.forEach((page, idx) => {
        if (cacheRef.current.has(page.id)) return;
        const ref = canvasRefs[idx]?.current;
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
  }, [pages, canvasRefs, pixelRatio]);

  useEffect(() => {
    const page = pages[currentPageIndex];
    if (!page) return undefined;

    const interval = setInterval(() => {
      const ref = canvasRefs[currentPageIndex]?.current;
      if (!ref?.toDataURL) return;
      const dataUrl = ref.toDataURL({ format: 'png', pixelRatio });
      if (!dataUrl) return;
      if (cacheRef.current.get(page.id) === dataUrl) return;
      cacheRef.current.set(page.id, dataUrl);
      setThumbnails(new Map(cacheRef.current));
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [pages, canvasRefs, currentPageIndex, refreshIntervalMs, pixelRatio]);

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
