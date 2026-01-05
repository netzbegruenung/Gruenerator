/**
 * useCanvasInteractions - Shared canvas interaction handlers
 * Extracts common event handlers used across all canvas components
 */

import { useState, useCallback, type RefObject } from 'react';
import type Konva from 'konva';
import type { CanvasStageRef } from '../primitives/CanvasStage';
import type { SnapTarget } from '../utils/snapping';
import {
  useCanvasEditorStore,
  useElementPositions,
} from '../../../../stores/canvasEditorStore';

export interface UseCanvasInteractionsOptions {
  stageRef: RefObject<CanvasStageRef | null>;
  onExport: (base64: string) => void;
  onSave?: (base64: string) => void;
}

export interface UseCanvasInteractionsResult<T extends string | null> {
  selectedElement: T;
  setSelectedElement: (element: T) => void;
  handleStageClick: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  handleSnapChange: (h: boolean, v: boolean) => void;
  handlePositionChange: (id: string, x: number, y: number, width: number, height: number) => void;
  handleExport: () => void;
  handleSave: () => void;
  getSnapTargets: (excludeId: string) => SnapTarget[];
}

export function useCanvasInteractions<T extends string | null = string | null>({
  stageRef,
  onExport,
  onSave,
}: UseCanvasInteractionsOptions): UseCanvasInteractionsResult<T> {
  const [selectedElement, setSelectedElement] = useState<T>(null as T);

  const elementPositions = useElementPositions();
  const { setSnapGuides, updateElementPosition } = useCanvasEditorStore();

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (e.target === e.target.getStage()) {
        setSelectedElement(null as T);
        setSnapGuides(false, false);
      }
    },
    [setSnapGuides]
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

  const handleExport = useCallback(() => {
    setSelectedElement(null as T);
    setTimeout(() => {
      const dataUrl = stageRef.current?.toDataURL({ format: 'png' });
      if (dataUrl) {
        onExport(dataUrl);
      }
    }, 50);
  }, [stageRef, onExport]);

  const handleSave = useCallback(() => {
    if (!onSave) return;
    setSelectedElement(null as T);
    setTimeout(() => {
      const dataUrl = stageRef.current?.toDataURL({ format: 'png' });
      if (dataUrl) {
        onSave(dataUrl);
      }
    }, 50);
  }, [stageRef, onSave]);

  const getSnapTargets = useCallback(
    (excludeId: string) => Object.values(elementPositions).filter((t) => t.id !== excludeId),
    [elementPositions]
  );

  return {
    selectedElement,
    setSelectedElement,
    handleStageClick,
    handleSnapChange,
    handlePositionChange,
    handleExport,
    handleSave,
    getSnapTargets,
  };
}
