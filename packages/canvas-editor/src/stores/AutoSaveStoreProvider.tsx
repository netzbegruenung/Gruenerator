/**
 * AutoSaveStoreProvider — Scoped Zustand auto-save store distribution.
 *
 * Mirrors {@link CanvasStoreProvider}: each Provider creates an independent
 * {@link AutoSaveStoreApi} via useRef so the context value is stable. Without
 * a Provider, hooks fall back to the default singleton store for backward
 * compatibility with code paths that haven't been migrated yet.
 */

import { createContext, useContext, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/shallow';

import { createAutoSaveStore, defaultAutoSaveStore } from './createAutoSaveStore';

import type { ReactNode } from 'react';
import type { AutoSaveStore, AutoSaveStoreApi } from './createAutoSaveStore';

const AutoSaveStoreContext = createContext<AutoSaveStoreApi | null>(null);

export function AutoSaveStoreProvider({
  children,
  initialShareToken,
}: {
  children: ReactNode;
  initialShareToken?: string | null;
}) {
  const storeRef = useRef<AutoSaveStoreApi | null>(null);
  if (!storeRef.current) {
    console.log('[AutoSave][Provider] mount', {
      initialShareTokenProp: initialShareToken,
      seededWith: initialShareToken ?? null,
    });
    storeRef.current = createAutoSaveStore({ initialShareToken });
  }
  return (
    <AutoSaveStoreContext.Provider value={storeRef.current}>
      {children}
    </AutoSaveStoreContext.Provider>
  );
}

/**
 * Get the raw store API (for getState/subscribe outside React render).
 * Returns the context-scoped store, or the default singleton if no Provider.
 */
export function useAutoSaveStoreApi(): AutoSaveStoreApi {
  const contextStore = useContext(AutoSaveStoreContext);
  return contextStore ?? defaultAutoSaveStore;
}

/**
 * Subscribe to a slice of the auto-save store via selector. Re-renders only
 * when the selected value changes (strict equality).
 */
export function useAutoSaveStore<T>(selector: (state: AutoSaveStore) => T): T {
  const store = useAutoSaveStoreApi();
  return useStore(store, selector);
}

/**
 * Subscribe to a derived object/array from the store via shallow comparison.
 */
export function useAutoSaveStoreShallow<T>(selector: (state: AutoSaveStore) => T): T {
  const store = useAutoSaveStoreApi();
  return useStore(store, useShallow(selector));
}
