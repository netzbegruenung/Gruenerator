import * as React from 'react';

// SSR-Fallback: unter Node gibt es kein Layout zu messen, und useLayoutEffect
// warnt dort. Unter Vite/CSR greift immer der Layout-Effekt.
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

/**
 * Meldet, ob die eigene Box schmaler als `threshold` Pixel ist.
 *
 * Gegenstück zu `useIsMobile()`: das misst das Fenster, dies die eigene Box.
 * Nötig überall dort, wo dieselbe Oberfläche einmal seitenfüllend und einmal
 * in einem schmalen Panel steckt — dort ist die Fensterbreite die Antwort auf
 * eine Frage, die niemand gestellt hat.
 */
export function useIsNarrowerThan(
  ref: React.RefObject<HTMLElement | null>,
  threshold: number
): boolean {
  const [narrow, setNarrow] = React.useState(false);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => setNarrow(el.clientWidth < threshold);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold]);

  return narrow;
}
