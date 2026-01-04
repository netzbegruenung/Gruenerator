/**
 * useCanvasHistorySetup - Extended undo/redo setup with refs pattern
 * Wraps useCanvasUndoRedo and adds:
 * - Refs for stable callback access (saveToHistoryRef, collectStateRef)
 * - Initial history save on mount with proper timing
 */

import { useRef, useEffect, type MutableRefObject } from 'react';
import { useCanvasUndoRedo } from './useCanvasUndoRedo';

export interface UseCanvasHistorySetupResult<T extends Record<string, unknown>> {
  saveToHistory: (state?: Record<string, unknown>) => void;
  debouncedSaveToHistory: (state?: Record<string, unknown>) => void;
  saveToHistoryRef: MutableRefObject<(state?: Record<string, unknown>) => void>;
  collectStateRef: MutableRefObject<() => T>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Sets up canvas history (undo/redo) with refs pattern for stable callbacks
 * @param collectState - Function that collects current component state
 * @param handleRestore - Function that restores component state from history
 * @param debounceMs - Debounce delay for text input saves (default: 500)
 */
export function useCanvasHistorySetup<T extends Record<string, unknown>>(
  collectState: () => T,
  handleRestore: (state: Record<string, unknown>) => void,
  debounceMs = 500
): UseCanvasHistorySetupResult<T> {
  const initialHistorySavedRef = useRef(false);

  const { saveToHistory, debouncedSaveToHistory, undo, redo, canUndo, canRedo } =
    useCanvasUndoRedo(debounceMs, handleRestore);

  // Refs for stable access in callbacks without causing re-renders
  const saveToHistoryRef = useRef(saveToHistory);
  saveToHistoryRef.current = saveToHistory;

  const collectStateRef = useRef(collectState);
  collectStateRef.current = collectState;

  // Save initial state to history on mount (deferred to avoid render loop)
  useEffect(() => {
    if (!initialHistorySavedRef.current) {
      initialHistorySavedRef.current = true;
      const timer = setTimeout(() => {
        saveToHistoryRef.current(collectStateRef.current());
      }, 0);
      return () => clearTimeout(timer);
    }
  }, []);

  return {
    saveToHistory,
    debouncedSaveToHistory,
    saveToHistoryRef,
    collectStateRef,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
