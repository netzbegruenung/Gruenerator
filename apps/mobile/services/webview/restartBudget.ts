/**
 * Caps how often a WebView may be restarted after its web process died.
 * A page that is killed on every load would otherwise remount forever.
 */
export function createRestartBudget(max: number, windowMs: number, now: () => number = Date.now) {
  let stamps: number[] = [];
  return function tryRestart(): boolean {
    const t = now();
    stamps = stamps.filter((s) => t - s < windowMs);
    if (stamps.length >= max) return false;
    stamps.push(t);
    return true;
  };
}
