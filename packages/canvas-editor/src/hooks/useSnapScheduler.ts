import { useCallback, useEffect, useRef } from 'react';

import type { SnapLine } from '../utils/snapping';

interface SnapCallbacks {
  onSnapChange: (snapH: boolean, snapV: boolean) => void;
  onSnapLinesChange: (snapLines: SnapLine[]) => void;
}

/**
 * RAF-throttled snap state updates during drag.
 *
 * Konva fires dragmove ~60x/sec. Without throttling, each call
 * triggers a React state update → re-render. This hook batches
 * snap updates via requestAnimationFrame so React only re-renders
 * once per frame.
 */
export function useSnapScheduler(callbacks: SnapCallbacks) {
  const { onSnapChange, onSnapLinesChange } = callbacks;
  const lastSnapRef = useRef({ snapH: false, snapV: false });
  const lastLinesCountRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(
    () => () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    },
    []
  );

  const scheduleSnap = useCallback(
    (snapH: boolean, snapV: boolean, snapLines: SnapLine[]) => {
      const snapChanged =
        lastSnapRef.current.snapH !== snapH || lastSnapRef.current.snapV !== snapV;
      const linesChanged = snapLines.length !== lastLinesCountRef.current;
      if (!snapChanged && !linesChanged) return;

      lastSnapRef.current = { snapH, snapV };
      lastLinesCountRef.current = snapLines.length;

      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        if (isDraggingRef.current) {
          onSnapChange(snapH, snapV);
          onSnapLinesChange(snapLines);
        }
      });
    },
    [onSnapChange, onSnapLinesChange]
  );

  const onDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const onDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    lastSnapRef.current = { snapH: false, snapV: false };
    lastLinesCountRef.current = 0;
    onSnapChange(false, false);
    onSnapLinesChange([]);
  }, [onSnapChange, onSnapLinesChange]);

  return { scheduleSnap, onDragStart, onDragEnd };
}
