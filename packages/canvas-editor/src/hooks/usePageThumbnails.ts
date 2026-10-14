import Konva from 'konva';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { GenericCanvasRef } from '../components/GenericCanvas';
import type { HeterogeneousPage } from '../configs/types';

// A shot taken while an image is still loading lacks the photo, and its
// arrival does not change `page.state`: leave the page dirty so the next tick
// takes it again.
function markCaptured(
  captured: Map<string, unknown>,
  page: HeterogeneousPage,
  ref: GenericCanvasRef
): void {
  if (ref.imagesSettled()) captured.set(page.id, page.state);
}

interface UsePageThumbnailsOptions {
  pages: HeterogeneousPage[];
  canvasRefs: Array<React.RefObject<GenericCanvasRef | null>>;
  refreshIntervalMs?: number;
  pixelRatio?: number;
}

export function usePageThumbnails({
  pages,
  canvasRefs,
  refreshIntervalMs = 1500,
  pixelRatio = 0.25,
}: UsePageThumbnailsOptions): Map<string, string> {
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(() => new Map());
  const cacheRef = useRef<Map<string, string>>(new Map());
  // The page state each thumbnail was taken from: a changed state (an AI
  // proposal, its undo, a remote edit) is recaptured on the next tick.
  const capturedStateRef = useRef<Map<string, unknown>>(new Map());

  // Effects key on the page-ID SET, with live data read through refs —
  // `pages` gets a new identity on every edit, and re-keying the timers on it
  // would reset the refresh interval on each keystroke (so it never fires
  // while the user is actually editing).
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const canvasRefsRef = useRef(canvasRefs);
  canvasRefsRef.current = canvasRefs;
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
          markCaptured(capturedStateRef.current, page, ref);
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

  // Recapture only pages whose state changed since their last shot — local
  // edits, remote edits and AI proposals all arrive as a new state object
  // (useYjsPages keeps untouched pages' identity). Each capture is a
  // synchronous scene render + PNG encode, so it never runs mid-gesture and
  // waits for an idle slot instead of landing in the next frame.
  useEffect(() => {
    const capture = (index: number): boolean => {
      const page = pagesRef.current[index];
      const ref = canvasRefsRef.current[index]?.current;
      if (!page || !ref?.toDataURL) return false;
      const dataUrl = ref.toDataURL({ format: 'png', pixelRatio });
      if (!dataUrl) return false;
      markCaptured(capturedStateRef.current, page, ref);
      if (cacheRef.current.get(page.id) === dataUrl) return false;
      cacheRef.current.set(page.id, dataUrl);
      return true;
    };

    const captureChanged = () => {
      if (Konva.isDragging() || Konva.isTransforming()) return;
      let updated = false;
      pagesRef.current.forEach((page, index) => {
        if (capturedStateRef.current.get(page.id) !== page.state) {
          updated = capture(index) || updated;
        }
      });
      if (updated) setThumbnails(new Map(cacheRef.current));
    };

    let idleHandle: number | null = null;
    const interval = setInterval(() => {
      const dirty = pagesRef.current.some(
        (page) => capturedStateRef.current.get(page.id) !== page.state
      );
      if (!dirty || idleHandle !== null) return;
      if (typeof window.requestIdleCallback !== 'function') {
        captureChanged();
        return;
      }
      idleHandle = window.requestIdleCallback(
        () => {
          idleHandle = null;
          captureChanged();
        },
        { timeout: refreshIntervalMs }
      );
    }, refreshIntervalMs);

    return () => {
      clearInterval(interval);
      if (idleHandle !== null) window.cancelIdleCallback(idleHandle);
    };
  }, [pageIdsKey, refreshIntervalMs, pixelRatio]);

  useEffect(() => {
    const ids = new Set(pages.map((p) => p.id));
    let changed = false;
    for (const id of cacheRef.current.keys()) {
      if (!ids.has(id)) {
        cacheRef.current.delete(id);
        capturedStateRef.current.delete(id);
        changed = true;
      }
    }
    if (changed) {
      setThumbnails(new Map(cacheRef.current));
    }
  }, [pages]);

  return thumbnails;
}
