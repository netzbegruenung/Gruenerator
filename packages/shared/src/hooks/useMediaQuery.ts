import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Reactive media query hook using useSyncExternalStore.
 * Only fires when the query result changes (not on every resize pixel).
 *
 * @example
 * const isMobile = useMediaQuery('(max-width: 899px)');
 * const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
 */
export function useMediaQuery(query: string): boolean {
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

type BreakpointMode = 'min' | 'max';

/**
 * Convenience wrapper for viewport breakpoint checks.
 *
 * @example
 * const isMobile = useIsBreakpoint('max', 900);  // true when width < 900
 * const isDesktop = useIsBreakpoint('min', 900);  // true when width >= 900
 */
export function useIsBreakpoint(mode: BreakpointMode = 'max', breakpoint = 768): boolean {
  const query = useMemo(
    () => (mode === 'min' ? `(min-width: ${breakpoint}px)` : `(max-width: ${breakpoint - 1}px)`),
    [mode, breakpoint]
  );
  return useMediaQuery(query);
}
