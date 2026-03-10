/**
 * useLayerOrdering - Manage z-index ordering of canvas elements
 *
 * Extracted from DreizeilenCanvas refactoring (Phase 4)
 * Provides layer management with up/down/front/back operations
 */

import { useState, useMemo, useCallback } from 'react';

export interface CanvasItem {
  id: string;
  type: string;
  order?: number;
  [key: string]: unknown;
}

export interface UseLayerOrderingResult {
  /** Canvas items sorted by layer order */
  sortedRenderList: CanvasItem[];
  /** Current layer order array */
  layerOrder: string[];
  /** Move item up one layer */
  moveLayerUp: (itemId: string) => void;
  /** Move item down one layer */
  moveLayerDown: (itemId: string) => void;
  /** Bring item to front (top layer) */
  bringToFront: (itemId: string) => void;
  /** Send item to back (bottom layer) */
  sendToBack: (itemId: string) => void;
  /** Set complete layer order */
  setLayerOrder: (order: string[]) => void;
}

/**
 * Sort items by layer order
 */
function sortByLayerOrder(items: CanvasItem[], order: string[]): CanvasItem[] {
  return [...items].sort((a, b) => {
    const indexA = order.indexOf(a.id);
    const indexB = order.indexOf(b.id);

    // Items not in order list go to front
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;

    return indexA - indexB;
  });
}

/**
 * Move item within order array
 */
function moveInOrder(order: string[], itemId: string, direction: 'up' | 'down'): string[] {
  const index = order.indexOf(itemId);
  if (index === -1) return order;

  const newOrder = [...order];
  const targetIndex = direction === 'up' ? index + 1 : index - 1;

  // Bounds check
  if (targetIndex < 0 || targetIndex >= newOrder.length) {
    return order;
  }

  // Swap
  [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];

  return newOrder;
}

/**
 * Manages layer ordering for canvas elements
 *
 * @param canvasItems All canvas items to be rendered
 * @param initialOrder Initial layer order (default: [])
 * @returns Layer management functions and sorted render list
 *
 * @example
 * const {
 *   sortedRenderList,
 *   moveLayerUp,
 *   bringToFront
 * } = useLayerOrdering(items, ['background', 'sunflower', 'text']);
 */
export function useLayerOrdering(
  canvasItems: CanvasItem[],
  initialOrder: string[] = []
): UseLayerOrderingResult {
  const [layerOrder, setLayerOrder] = useState<string[]>(initialOrder);

  const sortedRenderList = useMemo(() => {
    return sortByLayerOrder(canvasItems, layerOrder);
  }, [canvasItems, layerOrder]);

  const moveLayerUp = useCallback((itemId: string) => {
    setLayerOrder((prev) => moveInOrder(prev, itemId, 'up'));
  }, []);

  const moveLayerDown = useCallback((itemId: string) => {
    setLayerOrder((prev) => moveInOrder(prev, itemId, 'down'));
  }, []);

  const bringToFront = useCallback((itemId: string) => {
    setLayerOrder((prev) => {
      const filtered = prev.filter((id) => id !== itemId);
      return [...filtered, itemId];
    });
  }, []);

  const sendToBack = useCallback((itemId: string) => {
    setLayerOrder((prev) => {
      const filtered = prev.filter((id) => id !== itemId);
      return [itemId, ...filtered];
    });
  }, []);

  return {
    sortedRenderList,
    layerOrder,
    moveLayerUp,
    moveLayerDown,
    bringToFront,
    sendToBack,
    setLayerOrder,
  };
}
