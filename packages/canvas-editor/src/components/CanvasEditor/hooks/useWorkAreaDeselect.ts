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
      const pointerId = e.pointerId;
      let scrolled = false;
      const onScroll = () => {
        scrolled = true;
      };
      const stop = () => {
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointerdown', onDown, true);
        window.removeEventListener('pointercancel', stop, true);
        cleanupRef.current = null;
      };
      const onDown = (down: PointerEvent) => {
        if (down.pointerId !== pointerId) stop();
      };
      const onUp = (up: PointerEvent) => {
        if (up.pointerId !== pointerId) return;
        stop();
        const moved = Math.hypot(up.clientX - startX, up.clientY - startY);
        if (!scrolled && moved <= TOUCH_TAP_SLOP) onDeselect();
      };
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointerdown', onDown, true);
      window.addEventListener('pointercancel', stop, true);
      cleanupRef.current = stop;
    },
    [onDeselect]
  );
}
