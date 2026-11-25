import { useEffect, useRef } from 'react';

/**
 * Focus for whatever shows a running generation: it takes the focus while it runs, hands it back
 * to the control that started the run afterwards, and Escape cancels.
 */
export function useGenerationFocus<T extends HTMLElement>(onCancel?: () => void) {
  const ref = useRef<T>(null);
  // Read during the first render, while the control that started the run still has the focus.
  const returnFocusTo = useRef<Element | null>(document.activeElement);

  useEffect(() => {
    ref.current?.focus();
    const target = returnFocusTo.current;
    return () => {
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    };
  }, []);

  useEffect(() => {
    if (!onCancel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return ref;
}
