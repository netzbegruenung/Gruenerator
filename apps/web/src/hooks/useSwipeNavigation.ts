import { useState, useCallback, useRef } from 'react';

interface SwipeNavigationOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  enabled?: boolean;
}

const SWIPE_THRESHOLD = 50;

const useSwipeNavigation = ({ onSwipeLeft, onSwipeRight, threshold = SWIPE_THRESHOLD, enabled = true }: SwipeNavigationOptions) => {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isHorizontalSwipe = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    touchStartY.current = e.targetTouches[0].clientY;
    isHorizontalSwipe.current = false;
  }, [enabled]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled || touchStart === null) return;

    const currentX = e.targetTouches[0].clientX;
    const currentY = e.targetTouches[0].clientY;

    if (!isHorizontalSwipe.current) {
      const deltaX = Math.abs(currentX - touchStart);
      const deltaY = Math.abs(currentY - (touchStartY.current ?? 0));

      if (deltaX > 10 || deltaY > 10) {
        isHorizontalSwipe.current = deltaX > deltaY;
      }
    }

    if (isHorizontalSwipe.current) {
      setTouchEnd(currentX);
    }
  }, [enabled, touchStart]);

  const onTouchEnd = useCallback(() => {
    if (!enabled || !touchStart || !touchEnd || !isHorizontalSwipe.current) {
      setTouchStart(null);
      setTouchEnd(null);
      return;
    }

    const distance = touchStart - touchEnd;

    if (distance > threshold) {
      onSwipeLeft?.();
    } else if (distance < -threshold) {
      onSwipeRight?.();
    }

    setTouchStart(null);
    setTouchEnd(null);
    isHorizontalSwipe.current = false;
  }, [enabled, touchStart, touchEnd, threshold, onSwipeLeft, onSwipeRight]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd
  };
};

export default useSwipeNavigation;
