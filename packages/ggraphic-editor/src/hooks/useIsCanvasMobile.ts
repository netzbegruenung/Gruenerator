// SPDX-License-Identifier: MPL-2.0
import { useCallback, useSyncExternalStore } from 'react';

/** Mirrors `--breakpoint-canvas-mobile` (900px) — the `max-canvas-mobile:` variant in JS. */
export const CANVAS_MOBILE_QUERY = '(max-width: 899px)';

// A `useMediaQuery` of the editor's own, so it needs no UI package. Fires only when the result changes.
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    [query]
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useIsCanvasMobile(): boolean {
  return useMediaQuery(CANVAS_MOBILE_QUERY);
}
