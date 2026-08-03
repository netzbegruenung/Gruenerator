import * as React from 'react';

// Komplement von Tailwinds `md:` (= `(width >= 48rem)`). In rem, damit die
// Grenze auch bei abweichender Browser-Grundschrift mit den `md:`-Klassen und
// mit der Regel in sidebar.css zusammenfällt.
const MOBILE_QUERY = '(width < 48rem)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

export function useIsMobile() {
  // useSyncExternalStore statt useState+useEffect: der erste Frame kennt die
  // Breite schon, sonst rendert jeder Kaltstart erst die Desktop-Verzweigung.
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}
