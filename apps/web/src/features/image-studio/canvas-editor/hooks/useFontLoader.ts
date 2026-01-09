/**
 * useFontLoader - Ensure font is loaded before rendering
 *
 * Extracted from DreizeilenCanvas refactoring (Phase 4)
 * Handles font loading with polling fallback for browsers that don't support document.fonts
 */

import { useState, useEffect } from 'react';

export interface UseFontLoaderOptions {
  /** Font family to load (e.g., 'ArvoGruen') */
  fontFamily: string;
  /** Font size for verification */
  fontSize: number;
  /** Maximum attempts for polling fallback */
  maxAttempts?: number;
  /** Polling interval in ms */
  pollInterval?: number;
}

/**
 * Loads a font and returns loading state
 *
 * @param options Font loading configuration (null to skip font loading)
 * @returns true when font is ready to use (or immediately if options is null)
 *
 * @example
 * const fontLoaded = useFontLoader({ fontFamily: 'ArvoGruen', fontSize: 60 });
 * if (!fontLoaded) return <LoadingSpinner />;
 *
 * @example
 * // Skip font loading
 * const fontLoaded = useFontLoader(null); // Returns true immediately
 */
export function useFontLoader(
  options: UseFontLoaderOptions | null
): boolean {
  const [fontLoaded, setFontLoaded] = useState(!options);

  useEffect(() => {
    if (!options) {
      setFontLoaded(true);
      return;
    }

    let cancelled = false;

    const loadFont = async () => {
      try {
        // Modern approach: Use Font Loading API
        const fontSpec = `${options.fontSize}px ${options.fontFamily}`;
        await document.fonts.load(fontSpec, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
        await document.fonts.ready;

        if (!cancelled) {
          setFontLoaded(true);
        }
      } catch (error) {
        // Fallback: Poll for font availability
        const fontSpec = `${options.fontSize}px ${options.fontFamily}`;
        const maxAttempts = options.maxAttempts ?? 30;
        const pollInterval = options.pollInterval ?? 50;
        let attempts = 0;

        const poll = () => {
          if (cancelled) return;

          attempts++;

          if (document.fonts.check(fontSpec) || attempts >= maxAttempts) {
            setFontLoaded(true);
          } else {
            setTimeout(poll, pollInterval);
          }
        };

        poll();
      }
    };

    loadFont();

    return () => {
      cancelled = true;
    };
  }, [options?.fontFamily, options?.fontSize, options?.maxAttempts, options?.pollInterval]);

  return fontLoaded;
}
