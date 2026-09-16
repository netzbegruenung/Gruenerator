/**
 * useCanvasStoreSetup - Canvas store registration and cleanup
 * Handles mounting/unmounting of canvas ref registry and store reset
 */

import { useEffect, type RefObject } from 'react';

import { canvasRefRegistry } from '../stores/canvasRefRegistry';
import { useCanvasStore } from '../stores/CanvasStoreProvider';

import type { CanvasStageRef } from '../primitives/CanvasStage';

/**
 * Sets up canvas store registration on mount and cleanup on unmount
 * @param componentId - Unique identifier for the canvas component (e.g. 'zitat-pure',
 *   'dreizeilen'), or null to skip the registry entirely.
 *
 *   The registry is a module-level singleton keyed by this id, so two live
 *   canvases of the same template overwrite one another and the first to
 *   unmount unregisters the survivor. Offscreen previews pass null: they are
 *   captured through the imperative ref, never looked up by id, and would
 *   otherwise evict the studio's entry for the template they are previewing.
 * @param stageRef - Ref to the CanvasStage component
 */
export function useCanvasStoreSetup(
  componentId: string | null,
  stageRef: RefObject<CanvasStageRef | null>
): void {
  const store = useCanvasStore();

  useEffect(() => {
    if (componentId === null) {
      return () => {
        store.getState().resetStore();
      };
    }

    canvasRefRegistry.setStageRef(componentId, () => stageRef.current?.getStage() ?? null);

    return () => {
      canvasRefRegistry.unregister(componentId);
      store.getState().resetStore();
    };
  }, [componentId, stageRef, store]);
}
