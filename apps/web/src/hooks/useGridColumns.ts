import { useLayoutEffect, useState } from 'react';

/**
 * Counts the resolved columns of a CSS grid, so "show N rows" stays correct at
 * any viewport width. Takes the element (wire it through a callback ref with
 * `useState`), not a ref object: a grid that mounts after a loading state would
 * otherwise never be measured. Returns 0 until the grid is in the DOM.
 */
export function useGridColumns(el: HTMLElement | null): number {
  const [columns, setColumns] = useState(0);

  useLayoutEffect(() => {
    if (!el) return;

    const measure = () => {
      // `none` (no grid layout, e.g. jsdom) counts as unknown, not as one column.
      const value = getComputedStyle(el).gridTemplateColumns;
      setColumns(value === 'none' ? 0 : value.split(' ').filter(Boolean).length);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  return columns;
}
