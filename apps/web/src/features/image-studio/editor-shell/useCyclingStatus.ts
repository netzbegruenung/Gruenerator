import { useEffect, useState } from 'react';

const INTERVAL_MS = 5000;

/** While `active`, steps through `texts` every few seconds, starting from the first. */
export function useCyclingStatus(texts: readonly string[], active: boolean): string | null {
  const [index, setIndex] = useState(0);
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    setIndex(0);
  }
  useEffect(() => {
    if (!active || texts.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % texts.length), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, texts.length]);
  return active ? (texts[index % texts.length] ?? null) : null;
}
