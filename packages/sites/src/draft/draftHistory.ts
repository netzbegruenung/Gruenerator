import { SITE_LOCAL_ORIGIN } from '@gruenerator/contracts/site-ydoc';
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
 * Undo over the whole draft for this person's editor actions (`SITE_LOCAL_ORIGIN`): fields,
 * blocks, cards, order. Not tracked: the seed, edits arriving from others, and the rich-text
 * fields. Their Yjs binding writes on its own when an editor mounts (it normalises the fragment),
 * so tracking its origin made "Rückgängig" active on a page nobody had touched, and pressing it
 * undid that normalisation. A rich-text field keeps its own ⌘Z while it has focus.
 */
export function createDraftHistory(ydoc: Y.Doc): DraftHistory {
  const manager = new Y.UndoManager(ydoc, {
    trackedOrigins: new Set<unknown>([SITE_LOCAL_ORIGIN]),
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
