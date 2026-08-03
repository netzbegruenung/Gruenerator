import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

const SWIPE_THRESHOLD = 50;
/** Below this ratio the gesture is treated as a vertical scroll, not a swipe. */
const HORIZONTAL_BIAS = 1.4;

export interface SwipeHandlers {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: () => void;
}

/**
 * Horizontal swipe to move between slides. Pointer events only — no extra
 * dependency — and it defers to vertical scrolling, so the surrounding page
 * still scrolls normally under the same finger.
 */
export function useSwipeNavigation(
  onPrev: () => void,
  onNext: () => void,
  enabled = true
): SwipeHandlers {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onPointerDown: (e) => {
      // Mouse drags are for text selection; only touch/pen should swipe.
      if (!enabled || e.pointerType === 'mouse') return;
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e) => {
      const from = start.current;
      start.current = null;
      if (!from) return;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;
      if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_BIAS) return;
      if (dx < 0) onNext();
      else onPrev();
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}
