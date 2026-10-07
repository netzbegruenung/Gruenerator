/**
 * useCanvasHistorySetup - Extended undo/redo setup with refs pattern
 * Wraps useCanvasUndoRedo and adds:
 * - Refs for stable callback access (saveToHistoryRef, collectStateRef)
 * - Initial history save on mount with proper timing
 */

import { useCallback, useRef, useEffect, type MutableRefObject } from 'react';
import { flushSync } from 'react-dom';

import { useCanvasUndoRedo } from './useCanvasUndoRedo';

export interface UseCanvasHistorySetupResult<T extends Record<string, unknown>> {
  saveToHistory: (state?: T) => void;
  debouncedSaveToHistory: (state?: T) => void;
  saveToHistoryRef: MutableRefObject<(state?: T) => void>;
  collectStateRef: MutableRefObject<() => T>;
  /** Runs `fn` so that every history save it triggers becomes ONE entry. */
  runHistoryBatch: (fn: () => void) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Sets up canvas history (undo/redo) with refs pattern for stable callbacks.
 * The generic `T` flows through both directions: `collectState` produces it,
 * `handleRestore` consumes it, and the returned `saveToHistory` /
 * `debouncedSaveToHistory` accept exactly that shape — so a forgotten field
 * surfaces as a TypeScript error at the call site rather than silently
 * desyncing save/restore.
 *
 * @param collectState - Function that collects current component state
 * @param handleRestore - Function that restores component state from history
 * @param debounceMs - Debounce delay for text input saves (default: 500)
 * @param shortcutsEnabled - Whether this canvas answers Cmd/Ctrl+Z/Y
 */
export function useCanvasHistorySetup<T extends Record<string, unknown>>(
  collectState: () => T,
  handleRestore: (state: T) => void,
  debounceMs = 500,
  shortcutsEnabled = true
): UseCanvasHistorySetupResult<T> {
  const initialHistorySavedRef = useRef(false);

  const {
    saveToHistory: saveNow,
    debouncedSaveToHistory: saveDebounced,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useCanvasUndoRedo<T>(debounceMs, handleRestore, shortcutsEnabled);

  // While a batch runs, saves only mark it dirty. The actions hand over their
  // render-time `getState()`, which misses the batch's earlier changes, so the
  // one entry is taken from the committed state after the batch instead.
  // A depth counter, so a nested batch does not end the outer one.
  const batchDepthRef = useRef(0);
  const batchDirtyRef = useRef(false);

  const saveToHistory = useCallback(
    (state?: T) => {
      if (batchDepthRef.current > 0) batchDirtyRef.current = true;
      else saveNow(state);
    },
    [saveNow]
  );
  const debouncedSaveToHistory = useCallback(
    (state?: T) => {
      if (batchDepthRef.current > 0) batchDirtyRef.current = true;
      else saveDebounced(state);
    },
    [saveDebounced]
  );

  // Refs for stable access in callbacks without causing re-renders
  const saveToHistoryRef = useRef(saveToHistory);
  saveToHistoryRef.current = saveToHistory;

  const collectStateRef = useRef(collectState);
  collectStateRef.current = collectState;

  const runHistoryBatch = useCallback(
    (fn: () => void) => {
      if (batchDepthRef.current > 0) {
        batchDepthRef.current++;
        try {
          fn();
        } finally {
          batchDepthRef.current--;
        }
        return;
      }
      // Pre-batch state as its own entry (also flushes pending typing), so
      // one undo lands exactly there.
      saveNow(collectStateRef.current());
      batchDepthRef.current = 1;
      batchDirtyRef.current = false;
      try {
        // Commit the batch now: the entry below reads the committed state, and
        // nothing is left pending for a later, unrelated commit.
        flushSync(fn);
      } finally {
        batchDepthRef.current = 0;
      }
      // Unchanged state is deduplicated by the store.
      if (batchDirtyRef.current) saveNow(collectStateRef.current());
    },
    [saveNow]
  );

  // Save initial state to history on mount (deferred to avoid render loop)
  useEffect(() => {
    if (!initialHistorySavedRef.current) {
      initialHistorySavedRef.current = true;
      const timer = setTimeout(() => {
        saveToHistoryRef.current(collectStateRef.current());
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  return {
    saveToHistory,
    debouncedSaveToHistory,
    saveToHistoryRef,
    collectStateRef,
    runHistoryBatch,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
