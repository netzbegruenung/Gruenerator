import { useEffect, useCallback, useRef } from 'react';

import { useCanvasEditorStore } from '../../../../stores/canvasEditorStore';

interface UseCanvasUndoRedoReturn {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveToHistory: (componentState?: Record<string, unknown>) => void;
  debouncedSaveToHistory: (componentState?: Record<string, unknown>) => void;
}

// Stable selectors defined outside component
const selectCanUndo = (s: ReturnType<typeof useCanvasEditorStore.getState>) => s.historyIndex > 0;
const selectCanRedo = (s: ReturnType<typeof useCanvasEditorStore.getState>) =>
  s.historyIndex < s.history.length - 1;

/**
 * Hook for canvas undo/redo functionality
 * - Provides keyboard shortcuts (Ctrl/Cmd+Z for undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z for redo)
 * - Returns store actions and history state
 * - Includes debounced save for text input scenarios
 * - Uses getState() for stable store access without re-renders
 * - Accepts optional onRestore callback to restore component-level state
 */
export function useCanvasUndoRedo(
  debounceMs = 500,
  onRestore?: (state: Record<string, unknown>) => void
): UseCanvasUndoRedoReturn {
  // Use individual selectors to avoid subscribing to entire store
  const canUndo = useCanvasEditorStore(selectCanUndo);
  const canRedo = useCanvasEditorStore(selectCanRedo);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // Use getState() for stable access to store actions without subscription
  // This avoids re-renders when store state changes
  const getStore = useCanvasEditorStore.getState;

  // Register restoration callback on mount (using ref for stable callback)
  useEffect(() => {
    if (onRestoreRef.current) {
      const callback = (state: Record<string, unknown>) => {
        onRestoreRef.current?.(state);
      };
      getStore().setStateRestorationCallback(callback);
      return () => {
        getStore().setStateRestorationCallback(null);
      };
    }
  }, []);

  // Stable undo function - uses getState() which is stable
  const undo = useCallback(() => {
    getStore().undo();
  }, []);

  // Stable redo function
  const redo = useCallback(() => {
    getStore().redo();
  }, []);

  // Stable saveToHistory function - accepts optional component state
  const saveToHistory = useCallback((componentState?: Record<string, unknown>) => {
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
  const pendingComponentStateRef = useRef<Record<string, unknown> | undefined>(undefined);

  // Debounced save for text input scenarios - stable reference
  const debouncedSaveToHistory = useCallback(
    (componentState?: Record<string, unknown>) => {
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
