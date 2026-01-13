import type { FullCanvasConfig } from '../configs/types';

/**
 * Canvas Layer Manager - Utilities for managing layer ordering
 *
 * Handles the construction and manipulation of canvas element layers.
 * Elements are rendered in order: config elements → balkens → icons → shapes → texts → illustrations
 */

export interface CanvasItem {
    id: string;
    type: 'element' | 'balken' | 'icon' | 'shape' | 'additional-text' | 'illustration';
    data?: Record<string, unknown>;
}

interface StateWithFeatures {
    balkenInstances?: Array<Record<string, unknown>>;
    selectedIcons?: string[];
    shapeInstances?: Array<Record<string, unknown>>;
    additionalTexts?: Array<Record<string, unknown>>;
    illustrationInstances?: Array<Record<string, unknown>>;
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
 */
export function buildCanvasItems<TState extends StateWithFeatures = StateWithFeatures, TActions = Record<string, unknown>>(
    config: FullCanvasConfig<TState, TActions>,
    state: TState
): CanvasItem[] {
    const items: CanvasItem[] = [];

    // 1. Config Elements (sorted by order property)
    const sortedConfigElements = [...config.elements].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    sortedConfigElements.forEach((el) => items.push({ id: el.id, type: 'element', data: el as Record<string, unknown> }));

    // 2. Balkens
    if (state.balkenInstances) {
        state.balkenInstances.forEach((b) => items.push({ id: String(b.id), type: 'balken', data: b }));
    }

    // 3. Icons
    if (state.selectedIcons) {
        state.selectedIcons.forEach((id: string) => items.push({ id, type: 'icon' }));
    }

    // 4. Shapes
    if (state.shapeInstances) {
        state.shapeInstances.forEach((s) => items.push({ id: String(s.id), type: 'shape', data: s }));
    }

    // 5. Additional Texts
    if (state.additionalTexts) {
        state.additionalTexts.forEach((t) => items.push({ id: String(t.id), type: 'additional-text', data: t }));
    }

    // 6. Illustrations
    if (state.illustrationInstances) {
        state.illustrationInstances.forEach((i) => items.push({ id: String(i.id), type: 'illustration', data: i }));
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
