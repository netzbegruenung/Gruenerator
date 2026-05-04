import type { AdditionalText, CanvasElementConfig, FullCanvasConfig } from '../configs/types';
import type { BalkenInstance } from '../primitives/BalkenGroup';
import type { CircleBadgeInstance } from '../utils/circleBadgeUtils';
import type { AssetInstance } from './canvasAssets';
import type { FrameInstance } from './frameUtils';
import type { IllustrationInstance } from './illustrations/types';
import type { PillBadgeInstance } from './pillBadgeUtils';
import type { ShapeInstance } from './shapes';
import type { UserImageInstance } from './userImageUtils';

/**
 * Canvas Layer Manager - Utilities for managing layer ordering
 *
 * Handles the construction and manipulation of canvas element layers.
 * Elements are rendered in order: config elements → balkens → icons → shapes → texts → illustrations
 */

export type CanvasItem =
  | { id: string; type: 'element'; data: CanvasElementConfig }
  | { id: string; type: 'balken'; data: BalkenInstance }
  | { id: string; type: 'icon' }
  | { id: string; type: 'shape'; data: ShapeInstance }
  | { id: string; type: 'frame'; data: FrameInstance }
  | { id: string; type: 'additional-text'; data: AdditionalText }
  | { id: string; type: 'illustration'; data: IllustrationInstance }
  | { id: string; type: 'asset'; data: AssetInstance }
  | { id: string; type: 'circle-badge'; data: CircleBadgeInstance }
  | { id: string; type: 'pill-badge'; data: PillBadgeInstance }
  | { id: string; type: 'user-image'; data: UserImageInstance };

interface StateWithFeatures {
  balkenInstances?: BalkenInstance[];
  selectedIcons?: string[];
  shapeInstances?: ShapeInstance[];
  additionalTexts?: AdditionalText[];
  illustrationInstances?: IllustrationInstance[];
  assetInstances?: AssetInstance[];
  frameInstances?: FrameInstance[];
  circleBadgeInstances?: CircleBadgeInstance[];
  pillBadgeInstances?: PillBadgeInstance[];
  userImageInstances?: UserImageInstance[];
}

/**
 * Build flat list of all canvas items in default order
 *
 * Default order:
 * 1. Config elements (sorted by their `order` property)
 * 2. Balkens
 * 3. Icons
 * 4. Shapes
 * 5. Additional texts
 * 6. Illustrations
 * 7. Assets (decorative elements like sunflowers, arrows)
 */
export function buildCanvasItems<
  TState extends StateWithFeatures = StateWithFeatures,
  TActions = Record<string, unknown>,
>(config: FullCanvasConfig<TState, TActions>, state: TState): CanvasItem[] {
  const items: CanvasItem[] = [];

  // 1. Config Elements (sorted by order property)
  const sortedConfigElements = [...config.elements].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  // Widen TState parameter for the union: CanvasElementConfig<TState> is invariant
  // in TState, but the consumer (memo'd GenericCanvasElement) re-infers TState from
  // the state prop, so widening here is safe.
  sortedConfigElements.forEach((el) =>
    items.push({ id: el.id, type: 'element', data: el as CanvasElementConfig })
  );

  // 2. Balkens
  if (state.balkenInstances) {
    state.balkenInstances.forEach((b) => items.push({ id: b.id, type: 'balken', data: b }));
  }

  // 3. Icons
  if (state.selectedIcons) {
    state.selectedIcons.forEach((id) => items.push({ id, type: 'icon' }));
  }

  // 4. Shapes
  if (state.shapeInstances) {
    state.shapeInstances.forEach((s) => items.push({ id: s.id, type: 'shape', data: s }));
  }

  // 4.5. Frames
  if (state.frameInstances) {
    state.frameInstances.forEach((f) => items.push({ id: f.id, type: 'frame', data: f }));
  }

  // 5. Additional Texts
  if (state.additionalTexts) {
    state.additionalTexts.forEach((t) =>
      items.push({ id: t.id, type: 'additional-text', data: t })
    );
  }

  // 6. Illustrations
  if (state.illustrationInstances) {
    state.illustrationInstances.forEach((i) =>
      items.push({ id: i.id, type: 'illustration', data: i })
    );
  }

  // 7. Assets (decorative elements)
  if (state.assetInstances) {
    state.assetInstances.forEach((a) => items.push({ id: a.id, type: 'asset', data: a }));
  }

  // 8. Circle Badges (e.g., date circles)
  if (state.circleBadgeInstances) {
    state.circleBadgeInstances.forEach((c) =>
      items.push({ id: c.id, type: 'circle-badge', data: c })
    );
  }

  // 9. Pill Badges (e.g., "Wusstest du?" labels)
  if (state.pillBadgeInstances) {
    state.pillBadgeInstances.forEach((p) =>
      items.push({ id: p.id, type: 'pill-badge', data: p })
    );
  }

  // 10. User-uploaded images
  if (state.userImageInstances) {
    state.userImageInstances.forEach((u) =>
      items.push({ id: u.id, type: 'user-image', data: u })
    );
  }

  return items;
}

/**
 * Sort items by layerOrder array
 *
 * Items in layerOrder are rendered in that order.
 * Items not in layerOrder are appended (newly added items).
 */
export function buildSortedRenderList(items: CanvasItem[], layerOrder: string[]): CanvasItem[] {
  const pendingItems = [...items];
  const result: CanvasItem[] = [];

  // 1. Add items that are in layerOrder, in that order
  layerOrder.forEach((id) => {
    const idx = pendingItems.findIndex((item) => item.id === id);
    if (idx !== -1) {
      result.push(pendingItems[idx]);
      pendingItems.splice(idx, 1);
    }
  });

  // 2. Append remaining items (newly added or not tracked yet)
  result.push(...pendingItems);

  return result;
}

/**
 * Move element up/down in layer order
 *
 * Returns new layer order array with element moved in specified direction.
 * "up" = later in array (drawn on top), "down" = earlier in array (drawn behind)
 */
export function moveLayer(
  currentOrder: string[],
  selectedId: string,
  direction: 'up' | 'down'
): string[] {
  const currentIndex = currentOrder.indexOf(selectedId);

  if (currentIndex === -1) {
    return currentOrder;
  }

  const newOrder = [...currentOrder];

  if (direction === 'up') {
    if (currentIndex < newOrder.length - 1) {
      [newOrder[currentIndex], newOrder[currentIndex + 1]] = [
        newOrder[currentIndex + 1],
        newOrder[currentIndex],
      ];
    }
  } else {
    if (currentIndex > 0) {
      [newOrder[currentIndex], newOrder[currentIndex - 1]] = [
        newOrder[currentIndex - 1],
        newOrder[currentIndex],
      ];
    }
  }

  return newOrder;
}

/**
 * Check if element can move in direction
 */
export function canMoveInDirection(
  items: CanvasItem[],
  selectedId: string,
  direction: 'up' | 'down'
): boolean {
  const idx = items.findIndex((i) => i.id === selectedId);

  if (idx === -1) {
    return false;
  }

  if (direction === 'up') {
    return idx < items.length - 1;
  } else {
    return idx > 0;
  }
}
