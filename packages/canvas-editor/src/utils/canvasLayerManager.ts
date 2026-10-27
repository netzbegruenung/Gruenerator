import { ELEMENT_KINDS, kindItem, kindList } from './elementKinds';

import type { AssetInstance } from './canvasAssets';
import type { CanvasItem } from './canvasItem';
import type { FrameInstance } from './frameUtils';
import type { IllustrationInstance } from './illustrations/types';
import type { PillBadgeInstance } from './pillBadgeUtils';
import type { ShapeInstance } from './shapes';
import type { UserImageInstance } from './userImageUtils';
import type { AdditionalText, CanvasElementConfig, FullCanvasConfig } from '../configs/types';
import type { BalkenInstance } from '../primitives/BalkenGroup';
import type { CircleBadgeInstance } from '../utils/circleBadgeUtils';
import type { ChartInstance } from '@ggraphic/editor/utils/chartTypes';

/**
 * Canvas Layer Manager - Utilities for managing layer ordering
 *
 * Handles the construction and manipulation of canvas element layers.
 * Elements are rendered in order: config elements, then the kinds of `ELEMENT_KINDS`.
 */

export type { CanvasItem };

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
  chartInstances?: ChartInstance[];
}

/**
 * Build flat list of all canvas items in default order
 *
 * Default order: the config elements (sorted by their `order` property), then
 * every kind in the order of `ELEMENT_KINDS`.
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

  // 2. Every element kind, in the order `ELEMENT_KINDS` lists them.
  for (const { kind, stateKey } of ELEMENT_KINDS) {
    for (const entry of kindList(state, stateKey)) items.push(kindItem(kind, entry));
  }

  return items;
}

/**
 * A config element that declares a negative `order` is a background plane: the
 * solid colour, the photo over it, the contrast scrim. It says "behind
 * everything" in the only vocabulary the config has.
 */
function isBackgroundPlane(item: CanvasItem): boolean {
  return item.type === 'element' && (item.data.order ?? 0) < 0;
}

/**
 * Sort items by layerOrder array
 *
 * Items in layerOrder are rendered in that order.
 * Items not in layerOrder keep their default position: user-added ones are
 * appended on top, background planes go to the back.
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

  // 2. What is left is untracked, and there are two reasons for that. A shape
  //    the user just added belongs on top — appending is right. A background
  //    plane the template gained AFTER this layerOrder was saved does not:
  //    appending would paint a full-bleed rect over the finished sharepic and
  //    the document would open as a solid colour. So those go to the front, in
  //    their declared order, and everything else keeps appending.
  const behind = pendingItems.filter(isBackgroundPlane);
  behind.sort((a, b) => {
    const ao = a.type === 'element' ? (a.data.order ?? 0) : 0;
    const bo = b.type === 'element' ? (b.data.order ?? 0) : 0;
    return ao - bo;
  });
  const onTop = pendingItems.filter((item) => !isBackgroundPlane(item));

  return [...behind, ...result, ...onTop];
}

export type LayerStep = 'front' | 'forward' | 'backward' | 'back';

/**
 * Wohin `id` mit diesem Schritt in der Zeichenfolge rückt (hinten → vorn).
 * Unter die Hintergrund-Ebenen am Anfang der Liste geht es nicht: dort
 * verschwand ein Element bisher hinter der vollflächigen Farbe.
 */
function layerTarget(ids: readonly string[], id: string, step: LayerStep, floor: number) {
  const from = ids.indexOf(id);
  if (from === -1) return null;
  const min = Math.min(floor, from);
  const max = ids.length - 1;
  const to =
    step === 'front'
      ? max
      : step === 'back'
        ? min
        : step === 'forward'
          ? Math.min(from + 1, max)
          : Math.max(from - 1, min);
  return { from, to };
}

/** Wie viele Hintergrund-Ebenen zuunterst liegen. */
export function backgroundFloor(items: readonly CanvasItem[]): number {
  let floor = 0;
  while (floor < items.length && isBackgroundPlane(items[floor]!)) floor++;
  return floor;
}

/** Die Zeichenfolge nach dem Schritt; unverändert, wenn er nichts bewegt. */
export function moveLayerTo(items: readonly CanvasItem[], id: string, step: LayerStep): string[] {
  const ids = items.map((item) => item.id);
  const target = layerTarget(ids, id, step, backgroundFloor(items));
  if (!target || target.from === target.to) return ids;
  ids.splice(target.from, 1);
  ids.splice(target.to, 0, id);
  return ids;
}

export function canMoveLayer(items: readonly CanvasItem[], id: string, step: LayerStep): boolean {
  const target = layerTarget(
    items.map((item) => item.id),
    id,
    step,
    backgroundFloor(items)
  );
  return target !== null && target.from !== target.to;
}
