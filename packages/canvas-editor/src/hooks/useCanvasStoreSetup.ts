/**
 * useCanvasStoreSetup - Canvas store registration and cleanup
 * Handles mounting/unmounting of canvas ref registry and store reset
 */

import { useEffect, type RefObject } from 'react';

import { canvasRefRegistry } from '../stores/canvasEditorRefs';
import { useCanvasStore } from '../stores/CanvasStoreProvider';

import type { CanvasStageRef } from '../primitives/CanvasStage';

/**
 * Sets up canvas store registration on mount and cleanup on unmount
 * @param componentId - Unique identifier for the canvas component (e.g., 'zitat-pure', 'dreizeilen')
 * @param stageRef - Ref to the CanvasStage component
 */
export function useCanvasStoreSetup(
  componentId: string,
  stageRef: RefObject<CanvasStageRef | null>
): void {
  const store = useCanvasStore();

  useEffect(() => {
    canvasRefRegistry.setStageRef(componentId, () => stageRef.current?.getStage() ?? null);

    return () => {
      canvasRefRegistry.unregister(componentId);
      store.getState().resetStore();
    };
  }, [componentId, stageRef, store]);
}
