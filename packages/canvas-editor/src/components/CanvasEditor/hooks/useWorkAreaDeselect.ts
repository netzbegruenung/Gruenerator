import { useCallback, useEffect, useRef } from 'react';

import { TOUCH_TAP_SLOP } from '../../../utils/touchInput';

export function useWorkAreaDeselect(onDeselect: () => void) {
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  return useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.pointerType !== 'touch') {
        onDeselect();
        return;
      }
      if (!e.isPrimary) return;

      cleanupRef.current?.();
      const startX = e.clientX;
      const startY = e.clientY;
      let scrolled = false;
      const onScroll = () => {
        scrolled = true;
      };
      const stop = () => {
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', stop, true);
        cleanupRef.current = null;
      };
      const onUp = (up: PointerEvent) => {
        stop();
        const moved = Math.hypot(up.clientX - startX, up.clientY - startY);
        if (!scrolled && moved <= TOUCH_TAP_SLOP) onDeselect();
      };
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', stop, true);
      cleanupRef.current = stop;
    },
    [onDeselect]
  );
}
