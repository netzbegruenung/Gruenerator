import { useEffect, useRef } from 'react';

import { getFontRequirements } from '../utils/fontPreload';

export function useFontPreload(type: string | null): void {
  const preloadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!type || preloadedRef.current === type) return;

    const fontReqs = getFontRequirements(type);
    if (!fontReqs) return;

    const { fontFamily, fontSize } = fontReqs;
    const fontSpec = `${fontSize}px ${fontFamily}`;

    if (document.fonts.check(fontSpec)) {
      preloadedRef.current = type;
      return;
    }

    document.fonts
      .load(fontSpec, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')
      .then(() => document.fonts.ready)
      .then(() => {
        preloadedRef.current = type;
      })
      .catch(() => {
        // Non-critical - canvas will fallback to its own loading
      });
  }, [type]);
}
