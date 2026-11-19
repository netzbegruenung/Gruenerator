const inflight = new Set<Promise<boolean>>();
let flusher: (() => void) | null = null;

export function trackLegalSave(save: Promise<boolean>): Promise<boolean> {
  inflight.add(save);
  void save.finally(() => inflight.delete(save));
  return save;
}

export function registerLegalFlusher(flush: () => void): () => void {
  flusher = flush;
  return () => {
    if (flusher === flush) flusher = null;
  };
}

/** Starts a save for unsent Impressum edits and waits for every save in flight. */
export async function settleLegalSave(): Promise<{ pending: boolean; ok: boolean }> {
  flusher?.();
  const saves = [...inflight];
  const results = await Promise.all(saves);
  return { pending: saves.length > 0, ok: results.every(Boolean) };
}
