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
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    // Polled faster than it is displayed so a restart cannot show the previous
    // run's figure for a visible moment. The interval is the only writer, which
    // keeps the reset out of the effect body.
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(id);
  }, [active]);

  return active ? elapsed : 0;
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
