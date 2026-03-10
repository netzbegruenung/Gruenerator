/**
 * useFontLoader - Non-blocking font loader with progressive enhancement
 *
 * NEW: Always renders immediately with fallback font, swaps to custom font when ready.
 * This eliminates the 1.5s blocking delay while maintaining proper font rendering.
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

export interface UseFontLoaderResult {
  /** Always true - rendering is never blocked */
  fontLoaded: boolean;
  /** True when custom font is available, false when using fallback */
  isFontAvailable: boolean;
}

/**
 * Loads a font asynchronously without blocking render
 *
 * @param options Font loading configuration (null to skip font loading)
 * @returns {fontLoaded: true, isFontAvailable: boolean}
 *
 * @example
 * const { fontLoaded, isFontAvailable } = useFontLoader({ fontFamily: 'ArvoGruen', fontSize: 60 });
 * // Component renders immediately with fallback font
 * // Re-renders with custom font when isFontAvailable becomes true
 *
 * @example
 * // Skip font loading
 * const { fontLoaded } = useFontLoader(null); // Both true immediately
 */
export function useFontLoader(options: UseFontLoaderOptions | null): UseFontLoaderResult {
  // Always true - never block rendering!
  const [fontLoaded] = useState(true);
  const [isFontAvailable, setIsFontAvailable] = useState(false);

  useEffect(() => {
    if (!options) {
      setIsFontAvailable(true);
      return;
    }

    let cancelled = false;
    const fontSpec = `${options.fontSize}px ${options.fontFamily}`;

    // Check if font is already loaded (synchronous check)
    if (document.fonts.check(fontSpec)) {
      setIsFontAvailable(true);
      return;
    }

    // Start non-blocking font load in background
    const loadFont = async () => {
      try {
        // Modern approach: Use Font Loading API
        await document.fonts.load(fontSpec, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
        await document.fonts.ready;

        if (!cancelled) {
          setIsFontAvailable(true);
        }
      } catch {
        // Fallback: Poll for font availability
        const maxAttempts = options.maxAttempts ?? 30;
        const pollInterval = options.pollInterval ?? 50;
        let attempts = 0;

        const poll = () => {
          if (cancelled) return;

          attempts++;

          if (document.fonts.check(fontSpec)) {
            setIsFontAvailable(true);
          } else if (attempts < maxAttempts) {
            setTimeout(poll, pollInterval);
          } else {
            // Timeout - use fallback font
            setIsFontAvailable(false);
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

  return { fontLoaded, isFontAvailable };
}
