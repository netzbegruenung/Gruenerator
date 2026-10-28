// SPDX-License-Identifier: MPL-2.0
import type { AssetInstance } from './canvasAssets.js';
import type { AdditionalText, CanvasElementConfig } from '../configs/types.js';
import type { BalkenInstance } from '@ggraphic/editor/utils/balkenUtils';
import type { ChartInstance } from '@ggraphic/editor/utils/chartTypes';
import type { CircleBadgeInstance } from '@ggraphic/editor/utils/circleBadgeUtils';
import type { FrameInstance } from '@ggraphic/editor/utils/frameUtils';
import type { IllustrationInstance } from '@ggraphic/editor/utils/illustrations/types';
import type { PillBadgeInstance } from '@ggraphic/editor/utils/pillBadgeUtils';
import type { ShapeInstance } from '@ggraphic/editor/utils/shapes';
import type { UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';

/**
 * The element kinds a host adds to the core's. Empty in the core; a host
 * augments it (`declare module '@ggraphic/editor/utils/canvasItem'`) with one
 * entry per kind: where its list lives in the canvas state (`stateKey`), one
 * instance (`data`) and, when a tile or a drop can add one, the fields that
 * tile carries next to `kind` (`payload`). The runtime half, what the editor
 * does with the kind, is `registerElementKind` in `elementKinds.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HostElementKinds {}

/** The kinds a host registered; `never` without a host. */
export type HostElementKindName = Extract<keyof HostElementKinds, string>;

/** One instance of a host kind. */
export type HostElementData<K extends HostElementKindName> = HostElementKinds[K] extends {
  data: infer TData;
}
  ? TData
  : never;

/** Where a host kind's list lives in the canvas state. */
export type HostElementStateKey<K extends HostElementKindName> = HostElementKinds[K] extends {
  stateKey: infer TKey extends string;
}
  ? TKey
  : never;

/** The fields of a tile or drop that adds a host kind, next to its `kind`. */
export type HostElementPayload<K extends HostElementKindName> = HostElementKinds[K] extends {
  payload: infer TPayload extends object;
}
  ? TPayload
  : never;

/**
 * A host kind's list in the canvas state, by its `stateKey`. Spelled over
 * `keyof` directly: through the helpers above, an empty `HostElementKinds`
 * would map to a string index signature.
 */
export type HostElementState = {
  [
    K in keyof HostElementKinds as HostElementKinds[K] extends {
      stateKey: infer TKey extends string;
    }
      ? TKey
      : never
  ]: HostElementKinds[K] extends { data: infer TData } ? TData[] : never;
};

/** One placed instance of a host kind in the layer list. */
export type HostCanvasItem = {
  [K in HostElementKindName]: { id: string; type: K; data: HostElementData<K> };
}[HostElementKindName];

/**
 * One item of a page's layer list. Its own module so the element-kind
 * registry (`elementKinds.ts`) can name it without importing the layer
 * manager, which imports the registry.
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
  | { id: string; type: 'user-image'; data: UserImageInstance }
  | { id: string; type: 'chart'; data: ChartInstance }
  | HostCanvasItem;
