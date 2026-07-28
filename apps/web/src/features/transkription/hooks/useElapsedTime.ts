import { useEffect, useState } from 'react';

/**
 * Seconds elapsed since `active` last became true, resetting on each restart.
 *
 * Transcription is a single blocking provider call with no server-side progress
 * to report, so an indeterminate spinner is all the backend can honestly offer.
 * A running clock at least distinguishes "still working" from "hung", which is
 * the question people actually have while they wait.
 */
export function useElapsedTime(active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return seconds;
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
