/** Runs `fn` once the browser is idle (at the latest after 4 s); returns the cancel. */
export function whenIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(fn, { timeout: 4000 });
    return () => cancelIdleCallback(handle);
  }
  const timer = setTimeout(fn, 2000);
  return () => clearTimeout(timer);
}
