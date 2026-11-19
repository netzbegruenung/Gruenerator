import { type SiteDraft } from '@gruenerator/contracts';
import { decodeSiteDraft } from '@gruenerator/contracts/site-ydoc';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type * as Y from 'yjs';

export type SiteDraftStore = StoreApi<{ draft: SiteDraft }> & { destroy(): void };

export function createSiteDraftStore(ydoc: Y.Doc): SiteDraftStore {
  const store = createStore<{ draft: SiteDraft }>(() => ({ draft: decodeSiteDraft(ydoc) }));
  const onUpdate = () => store.setState({ draft: decodeSiteDraft(ydoc) });
  ydoc.on('update', onUpdate);
  return Object.assign(store, {
    destroy() {
      ydoc.off('update', onUpdate);
    },
  });
}
