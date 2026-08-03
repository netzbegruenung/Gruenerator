/**
 * The keyboard behaviour a modal owes its users, for the two export dialogs.
 *
 * They are hand-rolled rather than Radix because the surrounding actions menu
 * is a hand-rolled portal (see DocsEditorPage) — but `role="dialog"` plus
 * `aria-modal` is a promise, not a decoration: without a focus trap, Escape and
 * focus return, a keyboard or screen-reader user lands behind the overlay with
 * no way back. This supplies exactly that, and nothing else.
 */

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const container = ref.current;
    // Remember who opened us so focus can go back there on close — otherwise it
    // falls to <body> and keyboard users restart from the top of the page.
    const opener = document.activeElement as HTMLElement | null;

    const focusable = (): HTMLElement[] =>
      container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];

    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;

      // Wrap around instead of letting focus escape to the page behind.
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      opener?.focus?.();
    };
  }, [onClose]);

  return ref;
}
