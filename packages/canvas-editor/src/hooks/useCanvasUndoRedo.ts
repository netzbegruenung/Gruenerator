import { useEffect, useCallback, useRef } from 'react';

import { useStore } from 'zustand';

import { useCanvasStore } from '../stores/CanvasStoreProvider';

import type { CanvasEditorStoreState } from '../stores/createCanvasEditorStore';

interface UseCanvasUndoRedoReturn<
  TComponentState extends Record<string, unknown> = Record<string, unknown>,
> {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveToHistory: (componentState?: TComponentState) => void;
  debouncedSaveToHistory: (componentState?: TComponentState) => void;
}

// Stable selectors defined outside component
const selectCanUndo = (s: CanvasEditorStoreState) => s.historyIndex > 0;
const selectCanRedo = (s: CanvasEditorStoreState) => s.historyIndex < s.history.length - 1;

/**
 * Hook for canvas undo/redo functionality
 * - Provides keyboard shortcuts (Ctrl/Cmd+Z for undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z for redo)
 * - Returns store actions and history state
 * - Includes debounced save for text input scenarios
 * - Uses getState() for stable store access without re-renders
 * - Accepts optional onRestore callback to restore component-level state
 *
 * The generic `TComponentState` parameter ties the saved state shape to the
 * restoration callback shape so per-config templates get end-to-end typing
 * (`saveToHistory(getState())` is checked against `onRestore`'s parameter).
 */
export function useCanvasUndoRedo<
  TComponentState extends Record<string, unknown> = Record<string, unknown>,
>(
  debounceMs = 500,
  onRestore?: (state: TComponentState) => void
): UseCanvasUndoRedoReturn<TComponentState> {
  const store = useCanvasStore();
  // Use individual selectors to avoid subscribing to entire store
  const canUndo = useStore(store, selectCanUndo);
  const canRedo = useStore(store, selectCanRedo);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // Use getState() for stable access to store actions without subscription
  const getStore = store.getState;

  // Register restoration callback on mount (using ref for stable callback).
  // Variance bridge: the provider store is typed at the default
  // `Record<string, unknown>`, while this hook is parameterised in
  // `TComponentState extends Record<string, unknown>`. Function-parameter
  // contravariance prevents direct assignment, but at runtime the values
  // are interchangeable — the typed callback only ever receives state that
  // the same template's `getState()` produced.
  useEffect(() => {
    if (onRestoreRef.current) {
      const callback = (state: TComponentState) => {
        onRestoreRef.current?.(state);
      };
      getStore().setStateRestorationCallback(callback as (state: Record<string, unknown>) => void);
      return () => {
        getStore().setStateRestorationCallback(null);
      };
    }
    return undefined;
  }, []);

  // Stable undo function - uses getState() which is stable
  const undo = useCallback(() => {
    getStore().undo();
  }, []);

  // Stable redo function
  const redo = useCallback(() => {
    getStore().redo();
  }, []);

  // Stable saveToHistory function - accepts optional component state.
  // `TComponentState extends Record<string, unknown>` means the value is
  // structurally compatible with the default-typed store's parameter.
  const saveToHistory = useCallback((componentState?: TComponentState) => {
    getStore().saveToHistory(componentState);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isMac = navigator.platform.toLowerCase().includes('mac');
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Undo: Ctrl/Cmd + Z (without Shift)
      if (modKey && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        const store = getStore();
        if (store.canUndo()) {
          store.undo();
        }
      }

      // Redo: Ctrl/Cmd + Y OR Ctrl/Cmd + Shift + Z
      if (
        (modKey && e.key.toLowerCase() === 'y') ||
        (modKey && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        const store = getStore();
        if (store.canRedo()) {
          store.redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Ref to store latest componentState for debounced save
  const pendingComponentStateRef = useRef<TComponentState | undefined>(undefined);

  // Debounced save for text input scenarios - stable reference
  const debouncedSaveToHistory = useCallback(
    (componentState?: TComponentState) => {
      pendingComponentStateRef.current = componentState;
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => {
        getStore().saveToHistory(pendingComponentStateRef.current);
        pendingComponentStateRef.current = undefined;
      }, debounceMs);
    },
    [debounceMs]
  );

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    saveToHistory,
    debouncedSaveToHistory,
  };
}
