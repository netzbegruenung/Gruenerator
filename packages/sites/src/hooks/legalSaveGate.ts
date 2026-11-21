import { type SiteLegalDraft } from '@gruenerator/contracts';

const inflight = new Set<Promise<boolean>>();
const failed = new Set<string>();
const newest = new Map<string, SiteLegalDraft>();
let tail: Promise<unknown> = Promise.resolve();
let queued = 0;
let flusher: (() => void) | null = null;

/** Newest Impressum value of a site that the sites cache may not show yet. */
export function rememberLegal(siteId: string, legal: SiteLegalDraft): void {
  newest.set(siteId, legal);
}

export function rememberedLegal(siteId: string): SiteLegalDraft | null {
  return newest.get(siteId) ?? null;
}

export function forgetLegal(siteId: string, legal: SiteLegalDraft): void {
  if (newest.get(siteId) === legal) newest.delete(siteId);
}

export function hasFailedLegalSave(siteId: string): boolean {
  return failed.has(siteId);
}

/** One PUT at a time across all form instances, so a remount cannot overtake an earlier save. */
export function enqueueLegalSave(siteId: string, run: () => Promise<boolean>): Promise<boolean> {
  const result = queued === 0 ? run() : tail.then(run);
  queued += 1;
  tail = result;
  inflight.add(result);
  void result.then((ok) => {
    queued -= 1;
    if (ok) failed.delete(siteId);
    else failed.add(siteId);
    inflight.delete(result);
  });
  return result;
}

export function registerLegalFlusher(flush: () => void): () => void {
  flusher = flush;
  return () => {
    if (flusher === flush) flusher = null;
  };
}

/** Starts a save for unsent Impressum edits and waits for every save in flight. */
export async function settleLegalSave(siteId: string): Promise<{ pending: boolean; ok: boolean }> {
  flusher?.();
  const saves = [...inflight];
  await Promise.all(saves);
  return { pending: saves.length > 0, ok: !failed.has(siteId) };
}
