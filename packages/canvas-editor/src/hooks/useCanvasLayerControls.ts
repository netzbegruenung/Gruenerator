import { useCallback, useMemo } from 'react';

import { moveLayer, canMoveInDirection } from '../utils/canvasLayerManager';

import type { CanvasItem } from '../utils/canvasLayerManager';

/**
 * Canvas Layer Controls - Layer ordering management
 *
 * Provides handlers for moving layers up/down and boolean flags
 * for whether movement is possible in each direction.
 */

export interface UseCanvasLayerControlsOptions<TState> {
  selectedElement: string | null;
  sortedRenderList: CanvasItem[];
  setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void;
  saveToHistory: (state: TState) => void;
  state: TState;
}

export interface UseCanvasLayerControlsResult {
  handleMoveLayer: (direction: 'up' | 'down') => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

/**
 * Hook to handle layer movement controls
 */
export function useCanvasLayerControls<TState>(
  options: UseCanvasLayerControlsOptions<TState>
): UseCanvasLayerControlsResult {
  const { selectedElement, sortedRenderList, setState, saveToHistory, state } = options;

  const handleMoveLayer = useCallback(
    (direction: 'up' | 'down') => {
      if (!selectedElement) return;

      setState((prev: TState) => {
        const existingOrder = (prev as Record<string, unknown>).layerOrder as string[] | undefined;
        // Use existing layerOrder only if it has items, otherwise initialize from render list
        const currentOrder =
          existingOrder && existingOrder.length > 0
            ? [...existingOrder]
            : sortedRenderList.map((i) => i.id);
        const newOrder = moveLayer(currentOrder, selectedElement, direction);

        return { ...prev, layerOrder: newOrder };
      });

      saveToHistory({ ...state, layerOrder: sortedRenderList.map((i) => i.id) });
    },
    [selectedElement, setState, sortedRenderList, saveToHistory, state]
  );

  const canMoveUp = useMemo(() => {
    if (!selectedElement) return false;
    return canMoveInDirection(sortedRenderList, selectedElement, 'up');
  }, [selectedElement, sortedRenderList]);

  const canMoveDown = useMemo(() => {
    if (!selectedElement) return false;
    return canMoveInDirection(sortedRenderList, selectedElement, 'down');
  }, [selectedElement, sortedRenderList]);

  return {
    handleMoveLayer,
    canMoveUp,
    canMoveDown,
  };
}
