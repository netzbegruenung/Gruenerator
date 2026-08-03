import {
  useCallback,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';

/** Below this editor width the rail + side panel do not fit next to a usable
 * canvas, so the navigator becomes a filmstrip and panels become sheets. */
const COMPACT_WIDTH = 760;
/** Below this the 300px design rail would leave the canvas too narrow to edit
 * in, so it opens as a sheet instead. */
const DESIGN_RAIL_WIDTH = 1024;

export interface Size {
  width: number;
  height: number;
}

/**
 * Size of the editor's own box, not the window's.
 *
 * The deck editor shares the page with a chat panel and its own design rail, so
 * the window size says nothing about how much room the canvas actually has — at
 * a 1024px window with both open the canvas is left with ~150px. Measuring the
 * element is what makes the layout switch honest.
 *
 * Both values are 0 until the first measurement; callers must treat that as "not
 * yet known" rather than "tiny", so the layout never flashes compact on mount.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize((prev) =>
        prev.width === el.clientWidth && prev.height === el.clientHeight
          ? prev
          : { width: el.clientWidth, height: el.clientHeight }
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}

const COARSE_QUERY = '(pointer: coarse)';

/**
 * Whether the primary pointer is a finger.
 *
 * Kept separate from the width breakpoints on purpose: the canvas is rendered
 * through a CSS transform, and `contentEditable` inside one has unusable carets
 * and selection handles on iOS Safari. That is a property of the *input*, not of
 * the window — a tablet is wide enough for the desktop layout and still must
 * edit through the focus sheet, and a narrow desktop window is the reverse.
 */
export function useIsCoarsePointer(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const mql = window.matchMedia(COARSE_QUERY);
    mql.addEventListener('change', onStoreChange);
    return () => mql.removeEventListener('change', onStoreChange);
  }, []);
  const getSnapshot = useCallback(() => window.matchMedia(COARSE_QUERY).matches, []);
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export interface EditorLayout {
  /** Restack: filmstrip instead of the rail, sheets instead of side panels. */
  compact: boolean;
  /** The design panel fits as a right rail rather than a bottom sheet. */
  designAsRail: boolean;
}

/** Layout decisions derived from the editor's measured box. */
export function getEditorLayout({ width, height }: Size): EditorLayout {
  // Unmeasured (0) reads as "roomy" so the first paint is the desktop layout
  // rather than a compact flash.
  if (!width || !height) return { compact: false, designAsRail: true };
  return {
    // The rail costs 190px of width and buys a vertical overview — a trade that
    // only pays off when width is the abundant axis. In portrait it is not: a
    // 16:9 canvas can never spend the spare height, so the filmstrip goes along
    // the bottom edge instead and the slide gets the full width.
    compact: width < COMPACT_WIDTH || height > width,
    designAsRail: width >= DESIGN_RAIL_WIDTH,
  };
}
