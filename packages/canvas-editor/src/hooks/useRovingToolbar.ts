import { useCallback, useEffect, useRef, type FocusEvent, type KeyboardEvent } from 'react';

const DEFAULT_ITEM_SELECTOR = 'button:not(:disabled)';

/** Knöpfe plus die Eingaben einer Leiste (Regler, Zahlenfeld, Auswahl). */
export const TOOLBAR_ITEMS_WITH_INPUTS =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled)';

// Regler, Textfeld und Auswahl brauchen die Pfeile selbst; von dort geht es mit Tab weiter (WAI-ARIA Toolbar).
const ownsArrows = (el: HTMLElement) =>
  el instanceof HTMLInputElement || el instanceof HTMLSelectElement;

/**
 * Roving tabindex for a horizontal `role="toolbar"` / `role="tablist"`: one Tab
 * stop for the whole group, Left/Right/Home/End move between its items.
 *
 * Spread `{ ref, onKeyDown, onFocus }` onto the container. Items are found in
 * the DOM (so conditional children just work) and the stop is re-applied after
 * every render. The editor's global key handler leaves these keys alone on
 * toolbars and tabs (`keyboardOwnership.ts`).
 */
export function useRovingToolbar<T extends HTMLElement = HTMLDivElement>(
  itemSelector: string = DEFAULT_ITEM_SELECTOR
) {
  const ref = useRef<T>(null);
  const current = useRef<HTMLElement | null>(null);

  const getItems = useCallback(
    () => Array.from(ref.current?.querySelectorAll<HTMLElement>(itemSelector) ?? []),
    [itemSelector]
  );

  const applyStop = useCallback(() => {
    const items = getItems();
    if (items.length === 0) return;
    const stop =
      (current.current && items.includes(current.current) ? current.current : null) ??
      items.find((el) => el.getAttribute('aria-selected') === 'true') ??
      items[0];
    items.forEach((el) => {
      el.tabIndex = el === stop ? 0 : -1;
    });
  }, [getItems]);

  useEffect(() => {
    applyStop();
  });

  const onFocus = useCallback(
    (e: FocusEvent<T>) => {
      const target = e.target as HTMLElement;
      if (!getItems().includes(target)) return;
      current.current = target;
      applyStop();
    },
    [getItems, applyStop]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<T>) => {
      const items = getItems();
      const target = e.target as HTMLElement;
      const index = items.indexOf(target);
      if (index === -1) return;
      if (ownsArrows(target)) {
        if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
        // Am Rand der Leiste verlässt Tab sie wie gewohnt.
        const step = e.shiftKey ? index - 1 : index + 1;
        if (step < 0 || step >= items.length) return;
        e.preventDefault();
        items[step].focus();
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      let next: number;
      if (e.key === 'ArrowRight') next = (index + 1) % items.length;
      else if (e.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = items.length - 1;
      else return;
      e.preventDefault();
      items[next].focus();
    },
    [getItems]
  );

  return { ref, onKeyDown, onFocus };
}
