import { useEffect, useState } from 'react';

const TOUCH_QUERY = '(pointer: coarse)';

export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(TOUCH_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(TOUCH_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isTouch;
}
