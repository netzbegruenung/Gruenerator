// Reload channel for hosts outside the runtime (a Papierkorb restore puts a
// thread back; only the runtime can re-run list()). Its own module because the
// web entry calls requestThreadListReload() at boot, and living in
// GrueneratorThreadListAdapter.ts it pulled the adapter and assistant-stream
// into the entry's static closure (#5891).
const reloadListeners = new Set<() => void>();

export function subscribeThreadListReload(cb: () => void): () => void {
  reloadListeners.add(cb);
  return () => reloadListeners.delete(cb);
}

export function requestThreadListReload(): void {
  reloadListeners.forEach((l) => l());
}
