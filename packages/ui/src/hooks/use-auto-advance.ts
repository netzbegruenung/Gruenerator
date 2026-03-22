import { useCallback, useEffect, useRef, useState } from 'react';

export function useAutoAdvance(length: number, intervalMs = 5000) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    setIdx(0);
  }, [length]);

  const advance = useCallback(() => {
    setIdx((prev) => (prev + 1) % length);
  }, [length]);

  useEffect(() => {
    if (paused || length <= 1) return;
    intervalRef.current = setInterval(advance, intervalMs);
    return () => clearInterval(intervalRef.current);
  }, [paused, advance, length, intervalMs]);

  return { idx, setIdx, paused, setPaused };
}
