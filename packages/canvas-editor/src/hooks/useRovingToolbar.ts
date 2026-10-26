import { useCallback, useEffect, useRef, type FocusEvent, type KeyboardEvent } from 'react';

const DEFAULT_ITEM_SELECTOR = 'button:not(:disabled)';

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
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const items = getItems();
      const index = items.indexOf(e.target as HTMLElement);
      if (index === -1) return;
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
