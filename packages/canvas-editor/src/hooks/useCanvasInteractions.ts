/**
 * useCanvasInteractions - Shared canvas interaction handlers
 *
 * NOTE: This hook does NOT subscribe to selectedElement reactively.
 * Selection state is in the Zustand store — read via store.getState().selectedElement
 * at call time in event handlers. Components that need reactive selection
 * should use useCanvasStoreSelector((s) => s.selectedElement) directly.
 */

import { useCallback } from 'react';

import { useCanvasStore } from '../stores/CanvasStoreProvider';

import type { SnapTarget } from '../utils/snapping';
import type Konva from 'konva';

export interface UseCanvasInteractionsOptions {
  stageRef: React.RefObject<import('../primitives/CanvasStage').CanvasStageRef | null>;
}

export interface UseCanvasInteractionsResult {
  setSelectedElement: (element: string | null) => void;
  handleStageClick: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  handleSnapChange: (h: boolean, v: boolean) => void;
  handlePositionChange: (id: string, x: number, y: number, width: number, height: number) => void;
  getSnapTargets: (excludeId: string) => SnapTarget[];
}

export function useCanvasInteractions({
  stageRef: _stageRef,
}: UseCanvasInteractionsOptions): UseCanvasInteractionsResult {
  const store = useCanvasStore();
  const { setSelectedElement, setSnapGuides, updateElementPosition } = store.getState();

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (e.target === e.target.getStage()) {
        setSelectedElement(null);
        setSnapGuides(false, false);
      }
    },
    [setSelectedElement, setSnapGuides]
  );

  const handleSnapChange = useCallback(
    (h: boolean, v: boolean) => {
      setSnapGuides(h, v);
    },
    [setSnapGuides]
  );

  const handlePositionChange = useCallback(
    (id: string, x: number, y: number, width: number, height: number) => {
      updateElementPosition(id, x, y, width, height);
    },
    [updateElementPosition]
  );

  const getSnapTargets = useCallback(
    (excludeId: string) => {
      const positions = store.getState().elementPositions;
      return Object.values(positions).filter((t) => t.id !== excludeId);
    },
    [store]
  );

  return {
    setSelectedElement,
    handleStageClick,
    handleSnapChange,
    handlePositionChange,
    getSnapTargets,
  };
}
