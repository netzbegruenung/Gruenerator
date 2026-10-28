// SPDX-License-Identifier: MPL-2.0
import type { StockImageAttribution } from '../common/imageSourceTypes.js';
import type { BalkenMode } from '../utils/balkenUtils.js';
import type { ChartType } from '@ggraphic/editor/utils/chartTypes';
import type { FrameClipType } from '@ggraphic/editor/utils/frameUtils';
import type { ShapeType } from '@ggraphic/editor/utils/shapes';
import type { StickerRef } from '@ggraphic/schema';
import type Konva from 'konva';

/** Drag type of an upload or photo tile; the payload is `MediaDragPayload` as JSON. */
export const MEDIA_DRAG_TYPE = 'application/x-ggraphic-media';

export interface MediaDragPayload {
  /** A durable URL (`CanvasImageUrlService.placementUrl`, a stock URL), never a `blob:`. */
  url: string;
  name: string;
  /** Stock credit of a catalogue photo, kept on the placed image. */
  attribution?: StockImageAttribution;
}

/** Drag type of an Elemente tile; the payload is `ElementDragPayload` as JSON. */
export const ELEMENT_DRAG_TYPE = 'application/x-ggraphic-element';

export type ElementDragPayload =
  | { kind: 'asset'; assetId: string }
  | { kind: 'sticker'; ref: StickerRef }
  | { kind: 'shape'; shapeType: ShapeType; color?: string }
  | { kind: 'illustration'; id: string }
  | { kind: 'chart'; chartType: ChartType }
  | { kind: 'frame'; clipType: FrameClipType }
  | { kind: 'balken'; mode: BalkenMode }
  | { kind: 'icon'; iconId: string }
  /** A host block: composed for the page it lands on, then dropped as its parts. */
  | { kind: 'block'; blockId: string };

const ELEMENT_KINDS = new Set<ElementDragPayload['kind']>([
  'asset',
  'sticker',
  'shape',
  'illustration',
  'chart',
  'frame',
  'balken',
  'icon',
  'block',
]);

export function isElementDrag(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && Array.from(dataTransfer.types).includes(ELEMENT_DRAG_TYPE);
}

/** Shape check only; the drop target's action decides whether the id exists. */
export function readElementDrag(dataTransfer: DataTransfer | null): ElementDragPayload | null {
  const raw = dataTransfer?.getData(ELEMENT_DRAG_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { kind?: unknown };
    return typeof parsed.kind === 'string' &&
      ELEMENT_KINDS.has(parsed.kind as ElementDragPayload['kind'])
      ? (parsed as ElementDragPayload)
      : null;
  } catch {
    return null;
  }
}

// `dragend.dropEffect` repeats the last dragover's answer even when the drop
// placed nothing, so the page that handled the drop says whether it did.
let dropPlaced = false;

export function markDropPlaced(): void {
  dropPlaced = true;
}

/** Whether the drop placed something; reading it resets it for the next drag. */
export function takeDropPlaced(): boolean {
  const placed = dropPlaced;
  dropPlaced = false;
  return placed;
}

/** Drag type of a Vorlagen tile; the payload is the Vorlage id. */
export const VORLAGE_DRAG_TYPE = 'application/x-ggraphic-vorlage';

export function isVorlageDrag(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && Array.from(dataTransfer.types).includes(VORLAGE_DRAG_TYPE);
}

export function readVorlageDrag(dataTransfer: DataTransfer | null): string | null {
  return dataTransfer?.getData(VORLAGE_DRAG_TYPE) || null;
}

export function isMediaDrag(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && Array.from(dataTransfer.types).includes(MEDIA_DRAG_TYPE);
}

export function readMediaDrag(dataTransfer: DataTransfer | null): MediaDragPayload | null {
  const raw = dataTransfer?.getData(MEDIA_DRAG_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MediaDragPayload>;
    return typeof parsed.url === 'string' && parsed.url && !parsed.url.startsWith('blob:')
      ? {
          url: parsed.url,
          name: typeof parsed.name === 'string' ? parsed.name : 'bild',
          ...(parsed.attribution ? { attribution: parsed.attribution } : {}),
        }
      : null;
  } catch {
    return null;
  }
}

/**
 * Where a DOM drop lands on a page: the point in the template's reference space
 * (instances live there, inside the logical-scale Group) and the frame under it,
 * if any. Konva undoes the CSS zoom itself; `logicalScale` is format width over
 * reference width (CanvasStage's Group).
 */
export function locateDrop(
  stage: Konva.Stage,
  evt: { clientX: number; clientY: number },
  logicalScale: number
): { point: { x: number; y: number }; frameId: string | null } | null {
  stage.setPointersPositions(evt as unknown as Event);
  const pointer = stage.getPointerPosition();
  const relative = stage.getRelativePointerPosition();
  if (!pointer || !relative) return null;
  const hit = stage.getIntersection(pointer);
  const frame = hit?.findAncestor((n: Konva.Node) => n.name().startsWith('frame-'), true);
  return {
    point: { x: relative.x / logicalScale, y: relative.y / logicalScale },
    frameId: frame ? frame.name().slice('frame-'.length) : null,
  };
}
