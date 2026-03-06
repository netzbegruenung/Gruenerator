import { useState, useEffect, useRef } from 'react';

export function useLoadingProgress(isLoading: boolean, estimatedDuration: number = 30000) {
  const [progress, setProgress] = useState(0);
  const wasLoading = useRef(false);

  useEffect(() => {
    if (isLoading) {
      wasLoading.current = true;
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = (elapsed / estimatedDuration) * 100;
        const asymptotic = 95 * (1 - Math.exp(-pct / 30));
        setProgress(Math.min(asymptotic, 95));
      }, 100);

      return () => clearInterval(interval);
    }

    // Loading just finished — animate to 100 then reset
    if (wasLoading.current) {
      wasLoading.current = false;
      // Use rAF to avoid synchronous setState in effect body
      const raf = requestAnimationFrame(() => {
        setProgress(100);
      });
      const timeout = setTimeout(() => setProgress(0), 500);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timeout);
      };
    }
  }, [isLoading, estimatedDuration]);

  return Math.round(progress);
}
