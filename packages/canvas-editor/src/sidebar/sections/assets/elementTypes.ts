import {
  ELEMENT_DRAG_TYPE,
  MEDIA_DRAG_TYPE,
  type ElementDragPayload,
  type MediaDragPayload,
} from '../../../utils/mediaDrop';

import type { BalkenMode } from '../../../primitives/BalkenGroup';
import type { ChartType } from '../../../utils/chartUtils';
import type { FrameClipType } from '../../../utils/frameUtils';
import type { KawaiiIllustrationType, SvgDef } from '../../../utils/illustrations/types';
import type { ShapeType } from '../../../utils/shapes';

/** What a tile does: an element add, a photo placed as image, or an icon toggle. */
export type ElementAction =
  ElementDragPayload | ({ kind: 'media' } & MediaDragPayload) | { kind: 'icon'; iconId: string };

/**
 * How a tile previews its element. Plain data, so a recent tile can be stored
 * and drawn again without the catalogue that produced it.
 */
export type ElementThumbSpec =
  | { t: 'img'; src: string; inverse?: boolean }
  | { t: 'share'; src: string }
  | { t: 'photo'; src: string }
  | { t: 'shape'; shapeType: ShapeType }
  | { t: 'chart'; chartType: ChartType }
  | { t: 'frame'; clipType: FrameClipType }
  | { t: 'kawaii'; id: KawaiiIllustrationType }
  | { t: 'svg'; def: SvgDef }
  | { t: 'icon'; iconId: string }
  | { t: 'balken'; mode: BalkenMode };

export interface ElementItem {
  /** Stable across sessions: the recent list and React keys use it. */
  key: string;
  label: string;
  keywords: readonly string[];
  action: ElementAction;
  thumb: ElementThumbSpec;
}

/** Drag type and JSON for a tile; null when the action has no place on a page (icons). */
export function dragDataFor(action: ElementAction): { type: string; data: string } | null {
  if (action.kind === 'icon') return null;
  if (action.kind === 'media') {
    const payload: MediaDragPayload = {
      url: action.url,
      name: action.name,
      ...(action.attribution ? { attribution: action.attribution } : {}),
    };
    return { type: MEDIA_DRAG_TYPE, data: JSON.stringify(payload) };
  }
  return { type: ELEMENT_DRAG_TYPE, data: JSON.stringify(action) };
}
