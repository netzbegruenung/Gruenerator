/**
 * CanvasStoreProvider — Scoped Zustand store distribution via React Context
 *
 * Each CanvasStoreProvider creates an independent store instance.
 * The store reference is stable (useRef), so the context value never changes —
 * this means zero context-triggered re-renders in the entire subtree.
 *
 * Components subscribe to state via useCanvasStoreSelector/useCanvasStoreShallow,
 * which use Zustand's useStore() with selectors for granular re-render control.
 *
 * Without a provider, hooks fall back to the default singleton store
 * for backward compatibility.
 */

import { createContext, useContext, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/shallow';

import {
  createCanvasEditorStore,
  defaultCanvasEditorStore,
} from './createCanvasEditorStore';

import type { ReactNode } from 'react';
import type {
  CanvasEditorStoreApi,
  CanvasEditorStoreState,
} from './createCanvasEditorStore';

// =============================================================================
// CONTEXT
// =============================================================================

const CanvasStoreContext = createContext<CanvasEditorStoreApi | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

export function CanvasStoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<CanvasEditorStoreApi | null>(null);
  if (!storeRef.current) {
    storeRef.current = createCanvasEditorStore();
  }
  return (
    <CanvasStoreContext.Provider value={storeRef.current}>
      {children}
    </CanvasStoreContext.Provider>
  );
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Get the store API instance (for getState/setState outside React).
 * Returns context-scoped store, or default singleton if no provider.
 */
export function useCanvasStore(): CanvasEditorStoreApi {
  const contextStore = useContext(CanvasStoreContext);
  return contextStore ?? defaultCanvasEditorStore;
}

/**
 * Subscribe to a single value from the store via selector.
 * Only re-renders when the selected value changes (strict equality).
 *
 * Use for primitive values: `useCanvasStoreSelector((s) => s.renderVersion)`
 */
export function useCanvasStoreSelector<T>(
  selector: (state: CanvasEditorStoreState) => T
): T {
  const store = useCanvasStore();
  return useStore(store, selector);
}

/**
 * Subscribe to a derived object/array from the store via shallow comparison.
 * Only re-renders when any top-level property of the selected object changes.
 *
 * Use for objects/arrays: `useCanvasStoreShallow((s) => ({ a: s.a, b: s.b }))`
 */
export function useCanvasStoreShallow<T>(
  selector: (state: CanvasEditorStoreState) => T
): T {
  const store = useCanvasStore();
  return useStore(store, useShallow(selector));
}

/**
 * Returns true if the given element is the currently selected canvas element.
 * Uses strict equality on a boolean — only re-renders when selected status flips.
 */
export function useIsElementSelected(id: string): boolean {
  return useCanvasStoreSelector((s) => s.selectedElement === id);
}
