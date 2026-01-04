/**
 * useCanvasStoreSetup - Canvas store registration and cleanup
 * Handles mounting/unmounting of canvas ref registry and store reset
 */

import { useEffect, type RefObject } from 'react';
import type { CanvasStageRef } from '../primitives/CanvasStage';
import { canvasRefRegistry } from '../../../../stores/canvasEditorRefs';
import { useCanvasEditorStore } from '../../../../stores/canvasEditorStore';

/**
 * Sets up canvas store registration on mount and cleanup on unmount
 * @param componentId - Unique identifier for the canvas component (e.g., 'zitat-pure', 'dreizeilen')
 * @param stageRef - Ref to the CanvasStage component
 */
export function useCanvasStoreSetup(
  componentId: string,
  stageRef: RefObject<CanvasStageRef | null>
): void {
  const { resetStore } = useCanvasEditorStore();

  useEffect(() => {
    canvasRefRegistry.setStageRef(componentId, () => stageRef.current?.getStage() ?? null);

    return () => {
      canvasRefRegistry.unregister(componentId);
      resetStore();
    };
  }, [componentId, stageRef, resetStore]);
}
