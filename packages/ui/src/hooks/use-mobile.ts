import * as React from 'react';

// Komplement von Tailwinds `md:` (= `(width >= 48rem)`). In rem, damit die
// Grenze auch bei abweichender Browser-Grundschrift mit den `md:`-Klassen und
// mit der Regel in sidebar.css zusammenfällt.
const MOBILE_QUERY = '(width < 48rem)';

/**
 * Abonniert eine Media-Query. `useSyncExternalStore` statt useState+useEffect:
 * der erste Frame kennt die Breite schon, sonst rendert jeder Kaltstart erst
 * die Desktop-Verzweigung.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query]
  );
  const getSnapshot = React.useCallback(() => window.matchMedia(query).matches, [query]);
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useIsMobile() {
  return useMediaQuery(MOBILE_QUERY);
}
