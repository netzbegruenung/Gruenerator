// SPDX-License-Identifier: MPL-2.0
import type { CanvasItem } from './canvasItem';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers';

/** The element kinds a canvas holds beside the config's own elements. */
export type ElementKindName = Exclude<CanvasItem['type'], 'element'>;
type KindName = ElementKindName;

/** One placed instance of a kind, as the render list carries it. */
export type KindItem = Exclude<CanvasItem, { type: 'element' }>;

export interface ElementKindDef {
  kind: KindName;
  /** Where the kind lives in the canvas state; F0, stored in canvases and templates. */
  stateKey: string;
  /**
   * The action that deletes one by id. `null` for icons: their ids are listed
   * in `selectedIcons`, and deleting one switches it off (`toggleIcon`).
   */
  remove: Extract<keyof OptionalCanvasActions, `remove${string}`> | null;
  /**
   * The host draws the kind: the editor holds its state, stacks, selects and
   * removes it, but its renderer comes from `registerKindRenderers`. Without
   * one, the kind draws nothing.
   */
  hostRendered?: true;
}

/**
 * The element kinds a canvas holds, in the order they stack after the
 * config's own elements. A new kind is added here: `buildCanvasItems`,
 * `findElementRemover` and `findKindItem` follow, the per-kind tables
 * (`KIND_RENDERERS`, the floating modules, the orientation doors, the
 * duplicate specs) fail to compile until they name it, and a test holds
 * `CARRIED_INSTANCE_KEYS` to it, so a re-seed cannot drop the kind's state.
 */
export const ELEMENT_KINDS = [
  { kind: 'balken', stateKey: 'balkenInstances', remove: 'removeBalken', hostRendered: true },
  { kind: 'icon', stateKey: 'selectedIcons', remove: null },
  { kind: 'shape', stateKey: 'shapeInstances', remove: 'removeShape' },
  { kind: 'frame', stateKey: 'frameInstances', remove: 'removeFrame' },
  { kind: 'additional-text', stateKey: 'additionalTexts', remove: 'removeAdditionalText' },
  { kind: 'illustration', stateKey: 'illustrationInstances', remove: 'removeIllustration' },
  { kind: 'asset', stateKey: 'assetInstances', remove: 'removeAsset' },
  { kind: 'circle-badge', stateKey: 'circleBadgeInstances', remove: 'removeCircleBadge' },
  { kind: 'pill-badge', stateKey: 'pillBadgeInstances', remove: 'removePillBadge' },
  { kind: 'user-image', stateKey: 'userImageInstances', remove: 'removeUserImage' },
  { kind: 'chart', stateKey: 'chartInstances', remove: 'removeChart' },
] as const satisfies readonly ElementKindDef[];

/** The kinds whose renderer the host registers (`hostRendered`). */
export type HostRenderedKindName = Extract<
  (typeof ELEMENT_KINDS)[number],
  { hostRendered: true }
>['kind'];

/** A kind's list in a state, or nothing when the state has none. */
export function kindList(state: object, stateKey: string): readonly unknown[] {
  const value = (state as Record<string, unknown>)[stateKey];
  return Array.isArray(value) ? value : [];
}

/**
 * A list entry of a kind as a render-list item. Icons are the exception: their
 * list holds bare ids, and their state lives apart in `iconStates`.
 */
export function kindItem(kind: KindName, entry: unknown): KindItem {
  // Boundary: the kind tells the payload type the registry cannot spell.
  return kind === 'icon'
    ? { id: entry as string, type: 'icon' }
    : ({ id: (entry as { id: string }).id, type: kind, data: entry } as KindItem);
}

/** Which kind `id` is and its instance, in the order of `ELEMENT_KINDS`; `null` if none. */
export function findKindItem(state: object, id: string): KindItem | null {
  for (const { kind, stateKey } of ELEMENT_KINDS) {
    const entry = kindList(state, stateKey).find((e) =>
      kind === 'icon' ? e === id : (e as { id?: unknown } | null)?.id === id
    );
    if (entry !== undefined) return kindItem(kind, entry);
  }
  return null;
}
