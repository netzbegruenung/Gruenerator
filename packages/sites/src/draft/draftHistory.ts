import { SITE_LOCAL_ORIGIN } from '@gruenerator/contracts/site-ydoc';
import { PluginKey } from '@tiptap/pm/state';
import * as Y from 'yjs';
import { createStore, type StoreApi } from 'zustand/vanilla';

export interface DraftHistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export type DraftHistory = StoreApi<DraftHistoryState> & {
  undo(): void;
  redo(): void;
  destroy(): void;
};

/**
 * Undo over the whole draft, this person's edits only. Scoped to the doc, so the rich-text
 * fragments (own roots, created per block) are covered without tracking them one by one.
 * Tracked: the draft actions (`SITE_LOCAL_ORIGIN`) and the text editors, whose Yjs binding writes
 * with a ProseMirror `PluginKey` as origin. Not tracked: the seed, and edits arriving from others.
 */
export function createDraftHistory(ydoc: Y.Doc): DraftHistory {
  const manager = new Y.UndoManager(ydoc, {
    trackedOrigins: new Set<unknown>([SITE_LOCAL_ORIGIN, PluginKey]),
  });
  const read = (): DraftHistoryState => ({
    canUndo: manager.canUndo(),
    canRedo: manager.canRedo(),
  });
  const store = createStore<DraftHistoryState>(read);
  const sync = () => {
    const next = read();
    const prev = store.getState();
    if (next.canUndo !== prev.canUndo || next.canRedo !== prev.canRedo) store.setState(next);
  };
  manager.on('stack-item-added', sync);
  manager.on('stack-item-popped', sync);
  manager.on('stack-cleared', sync);
  return Object.assign(store, {
    undo: () => void manager.undo(),
    redo: () => void manager.redo(),
    destroy: () => manager.destroy(),
  });
}
