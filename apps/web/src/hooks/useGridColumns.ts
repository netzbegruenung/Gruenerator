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
      const template = getComputedStyle(el).gridTemplateColumns;
      // `none` = not laid out as a grid (yet): unmeasured, not one column.
      const tracks = template === 'none' ? 0 : template.split(' ').filter(Boolean).length;
      setColumns(tracks);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  return columns;
}
