import { useState, useEffect, useRef } from 'react';

interface UseMobileSheetOptions {
  isOpen: boolean;
  onClose: () => void;
  threshold?: number; // Swipe threshold to trigger close (in pixels)
  velocityThreshold?: number; // Velocity threshold (px/ms)
}

interface UseMobileSheetReturn {
  handleRef: React.RefObject<HTMLDivElement | null>;
  sheetRef: React.RefObject<HTMLElement | null>;
  isDragging: boolean;
}

const SNAP_BACK_TRANSITION = 'transform 200ms cubic-bezier(.2,.8,.2,1)';

/**
 * Swipe-down-to-close for the mobile sheet. The drag writes the transform
 * straight onto `sheetRef` — a React render per touchmove drops frames on a
 * sheet full of tiles. Listeners sit on the handle only and are passive; the
 * handle needs `touch-action: none` so the browser does not pan instead.
 */
export function useMobileSheet({
  isOpen,
  onClose,
  threshold = 100,
  velocityThreshold = 0.5,
}: UseMobileSheetOptions): UseMobileSheetReturn {
  const handleRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!isOpen || !handle) return;

    let dragging = false;
    let startY = 0;
    let deltaY = 0;
    let startTime = 0;

    const onTouchStart = (e: TouchEvent) => {
      dragging = true;
      startY = e.touches[0].clientY;
      deltaY = 0;
      startTime = Date.now();
      const sheet = sheetRef.current;
      if (sheet) {
        sheet.style.transition = 'none';
        sheet.style.willChange = 'transform';
      }
      setIsDragging(true);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragging) return;
      // Only allow dragging down
      deltaY = Math.max(0, e.touches[0].clientY - startY);
      if (sheetRef.current) sheetRef.current.style.transform = `translateY(${deltaY}px)`;
    };

    const onTouchEnd = () => {
      if (!dragging) return;
      dragging = false;
      setIsDragging(false);

      const velocity = deltaY / Math.max(1, Date.now() - startTime);
      const shouldClose = deltaY > threshold || velocity > velocityThreshold;
      const sheet = sheetRef.current;
      if (sheet) {
        sheet.style.transition = shouldClose ? '' : SNAP_BACK_TRANSITION;
        sheet.style.transform = '';
        sheet.style.willChange = '';
      }
      // Close if dragged far enough or swiped fast enough
      if (shouldClose) onCloseRef.current();
    };

    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('touchmove', onTouchMove, { passive: true });
    handle.addEventListener('touchend', onTouchEnd);
    handle.addEventListener('touchcancel', onTouchEnd);

    return () => {
      handle.removeEventListener('touchstart', onTouchStart);
      handle.removeEventListener('touchmove', onTouchMove);
      handle.removeEventListener('touchend', onTouchEnd);
      handle.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isOpen, threshold, velocityThreshold]);

  return {
    handleRef,
    sheetRef,
    isDragging,
  };
}
