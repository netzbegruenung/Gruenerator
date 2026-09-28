import { useLayoutEffect, type RefObject } from 'react';

const FIT_GUTTER_PX = 24;

/**
 * Mobile: while a sheet is open, scale and shift the pages container so the
 * active page sits centered in the remaining canvas area — the motif stays
 * visible instead of disappearing under the sheet. Drives the
 * `--canvas-sheet-scale` / `--canvas-sheet-shift` variables that
 * canvas-editor.css composes with the user zoom.
 */
export function useMobileSheetFit({
  enabled,
  zoom,
  pagesContainerRef,
  activePageRef,
}: {
  enabled: boolean;
  zoom: number;
  pagesContainerRef: RefObject<HTMLDivElement | null>;
  activePageRef: RefObject<HTMLDivElement | null> | undefined;
}): void {
  useLayoutEffect(() => {
    const container = pagesContainerRef.current;
    const main = container?.closest<HTMLElement>('.canvas-editor-layout__main');
    if (!container || !main) return;

    const reset = () => {
      container.style.removeProperty('--canvas-sheet-scale');
      container.style.removeProperty('--canvas-sheet-shift');
    };
    if (!enabled) {
      reset();
      return;
    }

    let shift = 0;
    const fit = () => {
      const page = activePageRef?.current;
      if (!page || page.offsetHeight === 0 || container.offsetHeight === 0) return;
      const mainRect = main.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      // Offsets ignore transforms; rects include them. Their ratio is the scale
      // applied right now, which lets us recover the untransformed geometry.
      const currentScale = containerRect.height / container.offsetHeight;
      const pageTop = (page.getBoundingClientRect().top - containerRect.top) / currentScale;
      const containerTop = containerRect.top - shift;

      const available = Math.max(0, mainRect.height - FIT_GUTTER_PX * 2);
      const total = Math.min(zoom, available / page.offsetHeight);
      shift =
        mainRect.top +
        (mainRect.height - page.offsetHeight * total) / 2 -
        containerTop -
        pageTop * total;

      container.style.setProperty('--canvas-sheet-scale', String(total / zoom));
      container.style.setProperty('--canvas-sheet-shift', `${shift}px`);
    };

    main.scrollTop = 0;
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(main);
    return () => {
      observer.disconnect();
      reset();
    };
  }, [enabled, zoom, pagesContainerRef, activePageRef]);
}
