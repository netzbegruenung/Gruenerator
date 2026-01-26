import { useState, useEffect } from 'react';

export function useLoadingProgress(isLoading: boolean, estimatedDuration: number = 30000) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setProgress(0);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const rawProgress = (elapsed / estimatedDuration) * 100;

      const asymptotic = 95 * (1 - Math.exp(-rawProgress / 30));

      setProgress(Math.min(asymptotic, 95));
    }, 100);

    return () => clearInterval(interval);
  }, [isLoading, estimatedDuration]);

  useEffect(() => {
    if (!isLoading && progress > 0) {
      setProgress(100);
      const timeout = setTimeout(() => setProgress(0), 500);
      return () => clearTimeout(timeout);
    }
  }, [isLoading, progress]);

  return Math.round(progress);
}
