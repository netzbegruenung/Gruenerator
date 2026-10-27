// „Automatisch": smartcrop schlägt den interessantesten Ausschnitt vor; hier wird er zu Pan/Zoom.
// Ausschnitt und Zoom: immer der kleinste erlaubte Zoom, ungedreht, auf Deckung.

import { photoRectAround, type Rect, type Size } from '@ggraphic/editor/utils/coverFit';
import { CANVAS_ITEM_NAME } from '@ggraphic/editor/utils/deepSelect';
import { BACKGROUND_STRAIGHTEN_KEY, backgroundStraighten } from '@ggraphic/editor/utils/straighten';

import { backgroundCropConfig, userImageOf, type CropUpdate } from './cropTarget';
import { BACKGROUND_IMAGE_NODE_ID } from './printImageInfo';
import { coverFitSlot, resolveValue } from './resolveElementValue';
import { templatePositionUpdates } from './templateRotation';
import { USER_PHOTO_NODE_NAME, type UserImageInstance } from './userImageUtils';

import type { CanvasElementConfig, LayoutResult } from '../configs/types';
import type Konva from 'konva';

/** Ein Ausschnitt der Größe `view` (Foto-px) um die Mitte von `region`, im Foto gehalten. */
export function viewAround(natural: Size, view: Size, region: Rect): Rect {
  const width = Math.min(view.width, natural.width);
  const height = Math.min(view.height, natural.height);
  const place = (centre: number, size: number, total: number) =>
    Math.max(0, Math.min(total - size, centre - size / 2));
  return {
    x: place(region.x + region.width / 2, width, natural.width),
    y: place(region.y + region.height / 2, height, natural.height),
    width,
    height,
  };
}

const coverScale = (natural: Size, frame: Size) =>
  Math.max(frame.width / natural.width, frame.height / natural.height);

/** Eigenes Bild: was der Rahmen bei Zoom 1 vom Foto zeigt, in Foto-px. */
export function userImageSmartCropView(natural: Size, frame: Size): Size {
  const s = coverScale(natural, frame);
  return { width: frame.width / s, height: frame.height / s };
}

export function userImageSmartCropPatch(
  image: UserImageInstance,
  natural: Size,
  region: Rect
): Partial<UserImageInstance> {
  const frame = { width: image.width, height: image.height };
  const s = coverScale(natural, frame);
  const view = viewAround(natural, userImageSmartCropView(natural, frame), region);
  // Wie `panOfFramedPhoto`, aber eine Achse ohne Überstand (Rundungsrauschen) bleibt mittig.
  const share = (start: number, size: number, frameSize: number) => {
    const half = (size - frameSize) / 2;
    return half > 0.5 ? Math.max(-1, Math.min(1, 1 + start / half)) : 0;
  };
  return {
    fit: 'cover',
    panX: share(-view.x * s, natural.width * s, frame.width),
    panY: share(-view.y * s, natural.height * s, frame.height),
    cropZoom: 1,
    ...(image.cropRotation ? { cropRotation: 0 } : {}),
  };
}

// Kleinster Zoom: Fenster im Seitenformat, Maßstab 1, aber nie kleiner als der Platz.
function leastWindow(base: Size, slot: Rect): Size {
  const f = Math.max(1, slot.width / base.width, slot.height / base.height);
  return { width: base.width * f, height: base.height * f };
}

function leastPhotoScale(natural: Size, base: Size, slot: Rect): number {
  return photoRectAround(natural, { x: 0, y: 0, ...leastWindow(base, slot) }).width / natural.width;
}

/** Hintergrund: was der Platz beim kleinsten Zoom vom Foto zeigt, in Foto-px. */
export function backgroundSmartCropView(natural: Size, base: Size, slot: Rect): Size {
  const k = leastPhotoScale(natural, base, slot);
  return { width: slot.width / k, height: slot.height / k };
}

/** Hintergrund: das Fenster (Bühnen-px), das den Vorschlag im Platz zeigt. */
export function backgroundSmartCropWindow(
  natural: Size,
  base: Size,
  slot: Rect,
  region: Rect
): Rect {
  const size = leastWindow(base, slot);
  const photo = photoRectAround(natural, { x: 0, y: 0, ...size });
  const k = photo.width / natural.width;
  const view = viewAround(natural, backgroundSmartCropView(natural, base, slot), region);
  // Das Fenster sitzt mittig im Foto (`photoRectAround`), `photo.x/y` ist sein Versatz dazu.
  return {
    x: slot.x - view.x * k - photo.x,
    y: slot.y - view.y * k - photo.y,
    ...size,
  };
}

interface SmartCropInput {
  id: string;
  state: Record<string, unknown>;
  elements: readonly CanvasElementConfig[];
  layout: LayoutResult;
  natural: Size;
}

function backgroundGeometry({ id, state, elements, layout }: SmartCropInput) {
  const config = backgroundCropConfig(elements, id);
  if (!config) return null;
  const base = {
    width: resolveValue(config.width, state, layout),
    height: resolveValue(config.height, state, layout),
  };
  const slot = coverFitSlot(config, state, layout);
  if (!(base.width > 0 && base.height > 0 && slot.width > 0 && slot.height > 0)) return null;
  return { config, base, slot };
}

/** Wonach smartcrop suchen soll: die Größe des sichtbaren Ausschnitts, in Foto-px. */
export function smartCropView(input: SmartCropInput): Size | null {
  const background = backgroundGeometry(input);
  if (background) return backgroundSmartCropView(input.natural, background.base, background.slot);
  const image = userImageOf(input.state, input.id);
  if (!image || !(image.width > 0 && image.height > 0)) return null;
  return userImageSmartCropView(input.natural, image);
}

/** Was „Automatisch" schreibt; der Winkel geht dabei auf 0. */
export function smartCropUpdate(input: SmartCropInput, region: Rect): CropUpdate | null {
  const background = backgroundGeometry(input);
  if (background) {
    const { config, base, slot } = background;
    const window = backgroundSmartCropWindow(input.natural, base, slot, region);
    // Der Rückweg von `resolveImageElementBox` (ohne centerZoom: solche Plätze haben keinen Zuschneide-Modus).
    const patch: Record<string, unknown> = templatePositionUpdates(
      config,
      window.x,
      window.y,
      input.state,
      input.layout
    );
    if (config.scaleKey) patch[config.scaleKey] = window.width / base.width;
    if (config.sizeStateKey) patch[config.sizeStateKey] = { w: window.width, h: window.height };
    if (backgroundStraighten(input.state) !== null) patch[BACKGROUND_STRAIGHTEN_KEY] = 0;
    return { kind: 'template', patch };
  }
  const image = userImageOf(input.state, input.id);
  if (!image) return null;
  return { kind: 'user-image', patch: userImageSmartCropPatch(image, input.natural, region) };
}

/** Das geladene Foto des Elements auf der Bühne. */
export function smartCropSource(stage: Konva.Stage | null, id: string): HTMLImageElement | null {
  if (!stage) return null;
  const node =
    id === BACKGROUND_IMAGE_NODE_ID
      ? stage.findOne<Konva.Image>(`#${BACKGROUND_IMAGE_NODE_ID}`)
      : (
          stage.find(`.${CANVAS_ITEM_NAME}`).find((item) => item.getAttr('canvasItemId') === id) as
            Konva.Container | undefined
        )?.findOne<Konva.Image>(`.${USER_PHOTO_NODE_NAME}`);
  const image = node?.image() as HTMLImageElement | undefined;
  return image && image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null;
}

// smartcrop zeichnet sonst das Foto in voller Größe auf eine Leinwand.
const MAX_SIDE = 512;

/** smartcrops Vorschlag (Foto-px) für einen Ausschnitt der Größe `view`; wirft bei „tainted" Bildern. */
export async function suggestSmartCrop(image: HTMLImageElement, view: Size): Promise<Rect> {
  const natural = { width: image.naturalWidth, height: image.naturalHeight };
  const f = Math.min(1, MAX_SIDE / Math.max(natural.width, natural.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(natural.width * f));
  canvas.height = Math.max(1, Math.round(natural.height * f));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('smartcrop: no 2d context');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const fx = canvas.width / natural.width;
  const fy = canvas.height / natural.height;
  const width = view.width * fx;
  const height = view.height * fy;
  // Genau diese Größe suchen statt des größten Ausschnitts (Vorgabe von smartcrop).
  const share = Math.min(1, Math.max(width / canvas.width, height / canvas.height));
  const { default: smartcrop } = await import('smartcrop');
  const options: Parameters<typeof smartcrop.crop>[1] & { maxScale: number } = {
    width,
    height,
    minScale: share,
    maxScale: share,
  };
  const { topCrop } = await smartcrop.crop(canvas, options);
  if (!topCrop || !(topCrop.width > 0 && topCrop.height > 0)) {
    throw new Error('smartcrop: no crop');
  }
  return {
    x: topCrop.x / fx,
    y: topCrop.y / fy,
    width: topCrop.width / fx,
    height: topCrop.height / fy,
  };
}
