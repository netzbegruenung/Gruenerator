import { useEffect, useRef } from 'react';
import { useIsTouchDevice } from './useIsTouchDevice';

import type { RefObject } from 'react';

interface MobileKeyboardOffsetOptions {
  /** Called (debounced 100ms) when the keyboard offset changes. */
  onOffsetChange?: () => void;
}

/**
 * Sets CSS custom property `--mobile-keyboard-offset` on both the referenced
 * element AND `:root` so ancestors/siblings can add bottom padding to their
 * scroll containers. Uses VirtualKeyboard API (Chrome/Edge) with VisualViewport
 * fallback (Safari/Firefox).
 */
export function useMobileKeyboardOffset<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options?: MobileKeyboardOffsetOptions
): void {
  const isTouchDevice = useIsTouchDevice();
  const callbackRef = useRef(options?.onOffsetChange);
  callbackRef.current = options?.onOffsetChange;

  useEffect(() => {
    if (!isTouchDevice) return;

    let debounceTimer: ReturnType<typeof setTimeout>;

    const setOffset = (px: number) => {
      const value = px > 0 ? `${px}px` : '0px';
      ref.current?.style.setProperty('--mobile-keyboard-offset', value);
      document.documentElement.style.setProperty('--mobile-keyboard-offset', value);
      if (callbackRef.current) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => callbackRef.current?.(), 100);
      }
    };

    const clearRootVar = () =>
      document.documentElement.style.removeProperty('--mobile-keyboard-offset');

    // Prefer VirtualKeyboard API (Chrome/Edge 94+)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vk = (navigator as any).virtualKeyboard;
    if (vk) {
      vk.overlaysContent = true;
      const onGeometryChange = () => setOffset(vk.boundingRect.height);
      vk.addEventListener('geometrychange', onGeometryChange);
      return () => {
        vk.removeEventListener('geometrychange', onGeometryChange);
        clearTimeout(debounceTimer);
        clearRootVar();
      };
    }

    // Fallback: Visual Viewport API (Safari, older browsers)
    const vp = window.visualViewport;
    if (!vp) return;

    let lastKnownKeyboardHeight = 0;

    const update = () => {
      const layoutHeight = document.documentElement.clientHeight;
      const keyboardHeight = layoutHeight - vp.height - vp.offsetTop;
      if (keyboardHeight > 50) lastKnownKeyboardHeight = keyboardHeight;
      setOffset(keyboardHeight);
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        if (lastKnownKeyboardHeight > 0) {
          setOffset(lastKnownKeyboardHeight);
        }
      }
    };

    const onFocusOut = () => setOffset(0);

    vp.addEventListener('resize', update);
    vp.addEventListener('scroll', update);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      vp.removeEventListener('resize', update);
      vp.removeEventListener('scroll', update);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      clearTimeout(debounceTimer);
      clearRootVar();
    };
  }, [isTouchDevice, ref]);
}
