import { useState, useEffect, useCallback, useRef } from 'react';

const KEYBOARD_THRESHOLD = 0.75;
const DEBOUNCE_MS = 150;

const useKeyboardFocus = (options = {}) => {
  const {
    enabled = true,
    mobileOnly = true,
    mobileBreakpoint = 768,
    onKeyboardOpen,
    onKeyboardClose
  } = options;

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const timeoutRef = useRef(null);
  const initialHeightRef = useRef(null);

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
    setIsFocusMode(prev => !prev);
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
    enterFocusMode
  };
};

export default useKeyboardFocus;
