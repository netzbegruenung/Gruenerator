import { useMediaQuery } from '@gruenerator/shared/hooks';

/** Mirrors `--breakpoint-canvas-mobile` (900px) — the `max-canvas-mobile:` variant in JS. */
export const CANVAS_MOBILE_QUERY = '(max-width: 899px)';

export function useIsCanvasMobile(): boolean {
  return useMediaQuery(CANVAS_MOBILE_QUERY);
}
