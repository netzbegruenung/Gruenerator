/**
 * useCanvasHistory - Undo/redo history management for canvas state
 * Maintains a stack of canvas states with configurable max size
 */

import { useState, useCallback, useRef } from 'react';
import type { Layer, CanvasHistoryEntry } from '../types';

export interface UseCanvasHistoryOptions {
  maxHistorySize?: number;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}

export interface UseCanvasHistoryReturn {
  saveState: (layers: Layer[], selectedIds?: string[]) => void;
  undo: () => CanvasHistoryEntry | null;
  redo: () => CanvasHistoryEntry | null;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
  historyLength: number;
  currentIndex: number;
  getCurrentState: () => CanvasHistoryEntry | null;
}

export function useCanvasHistory(options: UseCanvasHistoryOptions = {}): UseCanvasHistoryReturn {
  const { maxHistorySize = 50, onHistoryChange } = options;

  const [history, setHistory] = useState<CanvasHistoryEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const isUndoRedoRef = useRef(false);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  const saveState = useCallback((layers: Layer[], selectedIds: string[] = []) => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }

    const entry: CanvasHistoryEntry = {
      layers: JSON.parse(JSON.stringify(layers)),
      selectedLayerIds: [...selectedIds],
      timestamp: Date.now(),
    };

    setHistory(prev => {
      const truncated = prev.slice(0, currentIndex + 1);
      const updated = [...truncated, entry];

      if (updated.length > maxHistorySize) {
        updated.shift();
        setCurrentIndex(maxHistorySize - 1);
      } else {
        setCurrentIndex(updated.length - 1);
      }

      return updated;
    });

    onHistoryChange?.(true, false);
  }, [currentIndex, maxHistorySize, onHistoryChange]);

  const undo = useCallback((): CanvasHistoryEntry | null => {
    if (!canUndo) return null;

    isUndoRedoRef.current = true;
    const newIndex = currentIndex - 1;
    setCurrentIndex(newIndex);
    onHistoryChange?.(newIndex > 0, true);

    return history[newIndex] || null;
  }, [canUndo, currentIndex, history, onHistoryChange]);

  const redo = useCallback((): CanvasHistoryEntry | null => {
    if (!canRedo) return null;

    isUndoRedoRef.current = true;
    const newIndex = currentIndex + 1;
    setCurrentIndex(newIndex);
    onHistoryChange?.(true, newIndex < history.length - 1);

    return history[newIndex] || null;
  }, [canRedo, currentIndex, history, onHistoryChange]);

  const clear = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
    onHistoryChange?.(false, false);
  }, [onHistoryChange]);

  const getCurrentState = useCallback((): CanvasHistoryEntry | null => {
    if (currentIndex < 0 || currentIndex >= history.length) return null;
    return history[currentIndex];
  }, [currentIndex, history]);

  return {
    saveState,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
    historyLength: history.length,
    currentIndex,
    getCurrentState,
  };
}
