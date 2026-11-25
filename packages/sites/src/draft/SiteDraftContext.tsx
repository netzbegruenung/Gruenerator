import { type SiteBlockOf, type SiteBlockType, type SiteDraft } from '@gruenerator/contracts';
import {
  addSiteBlock,
  addSiteItem,
  duplicateSiteBlock,
  moveSiteBlock,
  moveSiteItem,
  removeSiteBlock,
  removeSiteItem,
  setSiteBlockField,
  setSiteBlockHidden,
  setSiteField,
  updateSiteItem,
  type SiteBlockPatch,
  type SiteFieldKey,
  type SiteFieldValues,
  type SiteItemPatch,
} from '@gruenerator/contracts/site-ydoc';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { createDraftHistory, type DraftHistory, type DraftHistoryState } from './draftHistory';
import { createSiteDraftStore, type SiteDraftStore } from './draftStore';

import type * as Y from 'yjs';

/**
 * What the editor can do to the draft. Shared with the sidebar (a separate change); names and
 * signatures are agreed with it. Adds return the new id, or null when refused (a full page, a
 * type at its limit, the hero); the rest return whether they changed anything.
 */
export interface SiteDraftActions {
  setField: <K extends SiteFieldKey>(key: K, value: SiteFieldValues[K]) => void;
  addBlock(type: SiteBlockType, index: number): string | null;
  removeBlock(id: string): boolean;
  moveBlock(id: string, toIndex: number): boolean;
  duplicateBlock(id: string): string | null;
  setBlockHidden(id: string, hidden: boolean): boolean;
  setBlockField<T extends SiteBlockType>(id: string, type: T, patch: SiteBlockPatch<T>): boolean;
  addItem(blockId: string, index?: number): string | null;
  updateItem(blockId: string, itemId: string, patch: SiteItemPatch): boolean;
  removeItem(blockId: string, itemId: string): boolean;
  moveItem(blockId: string, itemId: string, toIndex: number): boolean;
}

interface SiteDraftContextValue {
  ydoc: Y.Doc;
  store: SiteDraftStore;
  history: DraftHistory;
  actions: SiteDraftActions;
}

const SiteDraftContext = createContext<SiteDraftContextValue | null>(null);

function bindActions(ydoc: Y.Doc): SiteDraftActions {
  return {
    setField: (key, value) => setSiteField(ydoc, key, value),
    addBlock: (type, index) => addSiteBlock(ydoc, type, index),
    removeBlock: (id) => removeSiteBlock(ydoc, id),
    moveBlock: (id, toIndex) => moveSiteBlock(ydoc, id, toIndex),
    duplicateBlock: (id) => duplicateSiteBlock(ydoc, id),
    setBlockHidden: (id, hidden) => setSiteBlockHidden(ydoc, id, hidden),
    setBlockField: (id, type, patch) => setSiteBlockField(ydoc, id, type, patch),
    addItem: (blockId, index) => addSiteItem(ydoc, blockId, index),
    updateItem: (blockId, itemId, patch) => updateSiteItem(ydoc, blockId, itemId, patch),
    removeItem: (blockId, itemId) => removeSiteItem(ydoc, blockId, itemId),
    moveItem: (blockId, itemId, toIndex) => moveSiteItem(ydoc, blockId, itemId, toIndex),
  };
}

export function SiteDraftProvider({ ydoc, children }: { ydoc: Y.Doc; children: ReactNode }) {
  const [owned, setOwned] = useState<{
    ydoc: Y.Doc;
    store: SiteDraftStore;
    history: DraftHistory;
  } | null>(null);
  // Store and history subscribe to the doc, so they are created and destroyed in one effect:
  // nothing in render can leak a listener when StrictMode discards a render or re-runs the effect.
  useEffect(() => {
    const store = createSiteDraftStore(ydoc);
    const history = createDraftHistory(ydoc);
    setOwned({ ydoc, store, history });
    return () => {
      store.destroy();
      history.destroy();
    };
  }, [ydoc]);
  const value = useMemo<SiteDraftContextValue | null>(
    () =>
      owned && owned.ydoc === ydoc
        ? { ydoc, store: owned.store, history: owned.history, actions: bindActions(ydoc) }
        : null,
    [ydoc, owned]
  );
  if (!value) return null;
  return <SiteDraftContext.Provider value={value}>{children}</SiteDraftContext.Provider>;
}

function useDraftContext(): SiteDraftContextValue {
  const ctx = useContext(SiteDraftContext);
  if (!ctx) throw new Error('useDraft must be used inside <SiteDraftProvider>');
  return ctx;
}

export function useDraft<T>(selector: (draft: SiteDraft) => T): T {
  const { store } = useDraftContext();
  return useStore(
    store,
    useShallow((state) => selector(state.draft))
  );
}

/** The block with `id` if it is of `type`, else null (removed meanwhile, or another type). */
export function useDraftBlock<T extends SiteBlockType>(id: string, type: T): SiteBlockOf<T> | null {
  return useDraft((draft) => {
    const block = draft.blocks.find((entry) => entry.id === id);
    return block?.type === type ? (block as SiteBlockOf<T>) : null;
  });
}

/** Reads the current draft at call time, for event handlers that must not re-render on edits. */
export function useDraftReader(): () => SiteDraft {
  const { store } = useDraftContext();
  return useCallback(() => store.getState().draft, [store]);
}

export function useDraftActions(): SiteDraftActions {
  return useDraftContext().actions;
}

/** Undo and redo over this person's edits to the draft. */
export function useDraftHistory(): DraftHistoryState & Pick<DraftHistory, 'undo' | 'redo'> {
  const { history } = useDraftContext();
  const state = useStore(
    history,
    useShallow((s) => s)
  );
  return { ...state, undo: history.undo, redo: history.redo };
}

export function useSiteYdoc(): Y.Doc {
  return useDraftContext().ydoc;
}
