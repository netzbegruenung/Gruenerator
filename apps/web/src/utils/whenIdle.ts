/** Runs `task` when the browser is idle; returns a cancel function. */
export function whenIdle(task: () => void, timeout = 2_000): () => void {
  if (typeof window === 'undefined') return () => {};
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(task, { timeout });
    return () => window.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(task, 300);
  return () => window.clearTimeout(handle);
}
