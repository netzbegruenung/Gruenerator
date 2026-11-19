import { type SiteDraft } from '@gruenerator/contracts';
import {
  addSiteActionTile,
  addSiteThemeCard,
  moveSiteActionTile,
  moveSiteThemeCard,
  removeSiteActionTile,
  removeSiteThemeCard,
  setSiteField,
  updateSiteActionTile,
  updateSiteThemeCard,
  type SiteFieldKey,
  type SiteFieldValues,
} from '@gruenerator/contracts/site-ydoc';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type * as Y from 'yjs';

import { createSiteDraftStore, type SiteDraftStore } from './draftStore';

export interface SiteDraftActions {
  setField: <K extends SiteFieldKey>(key: K, value: SiteFieldValues[K]) => void;
  addTheme(): string | null;
  updateTheme(id: string, patch: Parameters<typeof updateSiteThemeCard>[2]): void;
  removeTheme(id: string): void;
  moveTheme(id: string, toIndex: number): void;
  addAction(): string | null;
  updateAction(id: string, patch: Parameters<typeof updateSiteActionTile>[2]): void;
  removeAction(id: string): void;
  moveAction(id: string, toIndex: number): void;
}

interface SiteDraftContextValue {
  ydoc: Y.Doc;
  store: SiteDraftStore;
  actions: SiteDraftActions;
}

const SiteDraftContext = createContext<SiteDraftContextValue | null>(null);

function bindActions(ydoc: Y.Doc): SiteDraftActions {
  return {
    setField: (key, value) => setSiteField(ydoc, key, value),
    addTheme: () => addSiteThemeCard(ydoc),
    updateTheme: (id, patch) => updateSiteThemeCard(ydoc, id, patch),
    removeTheme: (id) => removeSiteThemeCard(ydoc, id),
    moveTheme: (id, toIndex) => moveSiteThemeCard(ydoc, id, toIndex),
    addAction: () => addSiteActionTile(ydoc),
    updateAction: (id, patch) => updateSiteActionTile(ydoc, id, patch),
    removeAction: (id) => removeSiteActionTile(ydoc, id),
    moveAction: (id, toIndex) => moveSiteActionTile(ydoc, id, toIndex),
  };
}

export function SiteDraftProvider({ ydoc, children }: { ydoc: Y.Doc; children: ReactNode }) {
  const [owned, setOwned] = useState<{ ydoc: Y.Doc; store: SiteDraftStore } | null>(null);
  // The store subscribes to the doc, so it is created and destroyed in one effect: nothing in
  // render can leak a listener when StrictMode discards a render or re-runs the effect.
  useEffect(() => {
    const store = createSiteDraftStore(ydoc);
    setOwned({ ydoc, store });
    return () => store.destroy();
  }, [ydoc]);
  const value = useMemo<SiteDraftContextValue | null>(
    () =>
      owned && owned.ydoc === ydoc
        ? { ydoc, store: owned.store, actions: bindActions(ydoc) }
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

export function useDraftActions(): SiteDraftActions {
  return useDraftContext().actions;
}

export function useSiteYdoc(): Y.Doc {
  return useDraftContext().ydoc;
}
