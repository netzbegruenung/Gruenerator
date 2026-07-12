import { useEffect, useRef } from 'react';

import { isTourDone, type TourId } from './tourState';

// Auto-start a tour once when its surface is ready. The tour module loads
// lazily inside `start` so returning users never pay for driver.js. Small
// screens stay manual (popover layout + hidden sidebar).
export function useTourAutostart(id: TourId, enabled: boolean, start: () => void): void {
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });

  useEffect(() => {
    if (!enabled || isTourDone(id)) return;
    if (window.innerWidth < 768) return;

    const timer = setTimeout(() => startRef.current(), 1200);
    return () => clearTimeout(timer);
  }, [id, enabled]);
}
