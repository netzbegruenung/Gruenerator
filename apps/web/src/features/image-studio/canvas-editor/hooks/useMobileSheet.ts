import { useState, useEffect, useRef, useCallback } from 'react';

interface UseMobileSheetOptions {
  isOpen: boolean;
  onClose: () => void;
  threshold?: number; // Swipe threshold to trigger close (in pixels)
  velocityThreshold?: number; // Velocity threshold (px/ms)
}

interface UseMobileSheetReturn {
  handleRef: React.RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  translateY: number;
}

export function useMobileSheet({
  isOpen,
  onClose,
  threshold = 100,
  velocityThreshold = 0.5,
}: UseMobileSheetOptions): UseMobileSheetReturn {
  const handleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [translateY, setTranslateY] = useState(0);

  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const startTimeRef = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!handleRef.current?.contains(e.target as Node)) return;

    setIsDragging(true);
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = e.touches[0].clientY;
    startTimeRef.current = Date.now();
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging) return;

    currentYRef.current = e.touches[0].clientY;
    const deltaY = currentYRef.current - startYRef.current;

    // Only allow dragging down
    if (deltaY > 0) {
      setTranslateY(deltaY);
      e.preventDefault();
    }
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);

    const deltaY = currentYRef.current - startYRef.current;
    const deltaTime = Date.now() - startTimeRef.current;
    const velocity = deltaY / deltaTime;

    // Close if dragged far enough or swiped fast enough
    if (deltaY > threshold || velocity > velocityThreshold) {
      onClose();
    }

    setTranslateY(0);
  }, [isDragging, threshold, velocityThreshold, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setTranslateY(0);
      return;
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isOpen, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    handleRef,
    isDragging,
    translateY,
  };
}

