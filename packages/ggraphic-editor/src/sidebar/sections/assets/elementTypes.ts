// SPDX-License-Identifier: MPL-2.0
import {
  ELEMENT_DRAG_TYPE,
  MEDIA_DRAG_TYPE,
  type ElementDragPayload,
  type MediaDragPayload,
} from '@ggraphic/editor/utils/mediaDrop';

import type { BalkenMode } from '@ggraphic/editor/utils/balkenUtils';
import type { HostElementKindName, HostElementPayload } from '@ggraphic/editor/utils/canvasItem';
import type { ChartType } from '@ggraphic/editor/utils/chartUtils';
import type { FrameClipType } from '@ggraphic/editor/utils/frameUtils';
import type { KawaiiIllustrationType, SvgDef } from '@ggraphic/editor/utils/illustrations/types';
import type { ShapeType } from '@ggraphic/editor/utils/shapes';
import type { StickerRef } from '@ggraphic/schema';

/** What a tile does: an element add (icons toggle) or a photo placed as image. */
export type ElementAction = ElementDragPayload | ({ kind: 'media' } & MediaDragPayload);

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
  | { t: 'balken'; mode: BalkenMode }
  /** A host kind's tile, drawn by the host (`ElementPanelHost.HostThumb`). */
  | HostElementThumb;

/** The preview of a host kind's tile: its `kind` as `t`, and its payload. */
export type HostElementThumb = {
  [K in HostElementKindName]: { t: K } & HostElementPayload<K>;
}[HostElementKindName];

export interface ElementItem {
  /** Stable across sessions: the recent list and React keys use it. */
  key: string;
  label: string;
  keywords: readonly string[];
  action: ElementAction;
  thumb: ElementThumbSpec;
}

/** Drag type and JSON for a tile. */
export function dragDataFor(action: ElementAction): { type: string; data: string } {
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

/** A shared-gallery sticker as a tile, for the recent list and its drag. */
export function galleryStickerItem(ref: StickerRef): ElementItem {
  return {
    key: `sticker:${ref.id}`,
    label: 'Sticker',
    keywords: ['sticker'],
    action: { kind: 'sticker', ref },
    thumb: { t: 'share', src: ref.src },
  };
}
