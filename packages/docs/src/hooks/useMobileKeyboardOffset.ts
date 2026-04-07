import { useEffect, useRef, type RefObject } from 'react';
import { useIsTouchDevice } from './useIsTouchDevice';

/**
 * Sets CSS custom property `--mobile-keyboard-offset` on the target element
 * to reflect the virtual keyboard height. Uses VirtualKeyboard API (Chrome/Edge)
 * with VisualViewport fallback (Safari/Firefox).
 *
 * Returns a ref to attach to the container element.
 */
export function useMobileKeyboardOffset<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const isTouchDevice = useIsTouchDevice();

  useEffect(() => {
    if (!isTouchDevice) return;

    const setOffset = (px: number) => {
      ref.current?.style.setProperty('--mobile-keyboard-offset', px > 0 ? `${px}px` : '0px');
    };

    // Prefer VirtualKeyboard API (Chrome/Edge 94+)
    const vk = (navigator as any).virtualKeyboard;
    if (vk) {
      vk.overlaysContent = true;
      const onGeometryChange = () => setOffset(vk.boundingRect.height);
      vk.addEventListener('geometrychange', onGeometryChange);
      return () => vk.removeEventListener('geometrychange', onGeometryChange);
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
    };
  }, [isTouchDevice]);

  return ref;
}
