import { useState, useEffect, useCallback, useRef } from 'react';

const KEYBOARD_THRESHOLD = 0.75;
const DEBOUNCE_MS = 150;

interface UseKeyboardFocusOptions {
  enabled?: boolean;
  mobileOnly?: boolean;
  mobileBreakpoint?: number;
  onKeyboardOpen?: (keyboardHeight: number) => void;
  onKeyboardClose?: () => void;
}

interface UseKeyboardFocusReturn {
  isKeyboardOpen: boolean;
  isFocusMode: boolean;
  keyboardHeight: number;
  toggleFocusMode: () => void;
  exitFocusMode: () => void;
  enterFocusMode: () => void;
}

const useKeyboardFocus = (options: UseKeyboardFocusOptions = {}): UseKeyboardFocusReturn => {
  const {
    enabled = true,
    mobileOnly = true,
    mobileBreakpoint = 768,
    onKeyboardOpen,
    onKeyboardClose,
  } = options;

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialHeightRef = useRef<number | null>(null);

  const isMobile = useCallback(() => {
    if (typeof window === 'undefined') return false;
    if (!mobileOnly) return true;
    return window.innerWidth <= mobileBreakpoint;
  }, [mobileOnly, mobileBreakpoint]);

  const handleViewportResize = useCallback(() => {
    if (!enabled || !isMobile()) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const viewport = window.visualViewport;
      if (!viewport) return;

      if (initialHeightRef.current === null) {
        initialHeightRef.current = viewport.height;
      }

      const currentHeight = viewport.height;
      const initialHeight = initialHeightRef.current;
      const heightRatio = currentHeight / initialHeight;

      const keyboardNowOpen = heightRatio < KEYBOARD_THRESHOLD;
      const estimatedKeyboardHeight = keyboardNowOpen
        ? Math.round(initialHeight - currentHeight)
        : 0;

      setKeyboardHeight(estimatedKeyboardHeight);

      if (keyboardNowOpen !== isKeyboardOpen) {
        setIsKeyboardOpen(keyboardNowOpen);
        setIsFocusMode(keyboardNowOpen);

        if (keyboardNowOpen) {
          onKeyboardOpen?.(estimatedKeyboardHeight);
        } else {
          onKeyboardClose?.();
        }
      }
    }, DEBOUNCE_MS);
  }, [enabled, isMobile, isKeyboardOpen, onKeyboardOpen, onKeyboardClose]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const viewport = window.visualViewport;
    if (!viewport) return;

    initialHeightRef.current = viewport.height;

    viewport.addEventListener('resize', handleViewportResize);

    return () => {
      viewport.removeEventListener('resize', handleViewportResize);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, handleViewportResize]);

  const toggleFocusMode = useCallback(() => {
    setIsFocusMode((prev) => !prev);
  }, []);

  const exitFocusMode = useCallback(() => {
    setIsFocusMode(false);
  }, []);

  const enterFocusMode = useCallback(() => {
    setIsFocusMode(true);
  }, []);

  return {
    isKeyboardOpen,
    isFocusMode,
    keyboardHeight,
    toggleFocusMode,
    exitFocusMode,
    enterFocusMode,
  };
};

export default useKeyboardFocus;
