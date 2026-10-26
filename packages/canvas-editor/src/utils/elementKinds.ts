import type { CanvasItem } from './canvasLayerManager';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers';

type KindName = Exclude<CanvasItem['type'], 'element'>;

export interface ElementKindDef {
  kind: KindName;
  /** Where the kind lives in the canvas state; F0, stored in canvases and templates. */
  stateKey: string;
  /**
   * The action that deletes one by id. `null` for icons: their ids are listed
   * in `selectedIcons`, and deleting one switches it off (`toggleIcon`).
   */
  remove: Extract<keyof OptionalCanvasActions, `remove${string}`> | null;
}

/**
 * The element kinds a canvas holds, in the order they stack after the
 * config's own elements. A new kind is added here: `buildCanvasItems` and
 * `findElementRemover` follow, and a test holds `CARRIED_INSTANCE_KEYS` to
 * it, so a re-seed cannot drop the kind's state.
 */
export const ELEMENT_KINDS = [
  { kind: 'balken', stateKey: 'balkenInstances', remove: 'removeBalken' },
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

/** A kind's list in a state, or nothing when the state has none. */
export function kindList(state: object, stateKey: string): readonly unknown[] {
  const value = (state as Record<string, unknown>)[stateKey];
  return Array.isArray(value) ? value : [];
}
