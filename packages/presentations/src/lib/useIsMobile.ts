import { useCallback, useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)';

/**
 * Phone-width check. Mirrors `useIsBreakpoint('max', 768)` from
 * `@gruenerator/shared/hooks`; kept local so this package stays free of a
 * dependency on shared (it currently depends on nothing but contracts).
 */
export function useIsMobile(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const mql = window.matchMedia(QUERY);
    mql.addEventListener('change', onStoreChange);
    return () => mql.removeEventListener('change', onStoreChange);
  }, []);

  const getSnapshot = useCallback(() => window.matchMedia(QUERY).matches, []);
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
