import { type SiteDraft } from '@gruenerator/contracts';
import { decodeSiteDraft } from '@gruenerator/contracts/site-ydoc';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type * as Y from 'yjs';

export type SiteDraftStore = StoreApi<{ draft: SiteDraft }> & { destroy(): void };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// decodeSiteDraft builds every object anew; keep the previous reference wherever the content is
// equal, so a selector on an object slice only fires when that slice changed.
function share<T>(prev: unknown, next: T): T {
  if (Object.is(prev, next)) return next;
  if (Array.isArray(next) && Array.isArray(prev)) {
    const merged = next.map((item, index) => share(prev[index], item));
    const same = merged.length === prev.length && merged.every((item, i) => item === prev[i]);
    return (same ? prev : merged) as T;
  }
  if (isPlainObject(next) && isPlainObject(prev)) {
    const keys = Object.keys(next);
    const merged: Record<string, unknown> = {};
    for (const key of keys) merged[key] = share(prev[key], next[key]);
    const same =
      keys.length === Object.keys(prev).length && keys.every((key) => merged[key] === prev[key]);
    return (same ? prev : merged) as T;
  }
  return next;
}

export function createSiteDraftStore(ydoc: Y.Doc): SiteDraftStore {
  const store = createStore<{ draft: SiteDraft }>(() => ({ draft: decodeSiteDraft(ydoc) }));
  const onUpdate = () => {
    const draft = share(store.getState().draft, decodeSiteDraft(ydoc));
    if (draft !== store.getState().draft) store.setState({ draft });
  };
  ydoc.on('update', onUpdate);
  return Object.assign(store, {
    destroy() {
      ydoc.off('update', onUpdate);
    },
  });
}
