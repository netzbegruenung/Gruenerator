/**
 * Sticker effects on a 2D canvas: trim, die-cut outline, drop shadow, fit.
 * The geometry and alpha maths live in @gruenerator/shared/stickers, shared
 * with the mobile creator; these wrappers only move pixels.
 */
import { alphaBounds } from '@gruenerator/shared/profilbild';
import {
  discOffsets,
  effectPadding,
  hasTransparency,
  outlineWorkScale,
  stickerLayout,
  thresholdAlpha,
  type OutlineOptions,
  type ShadowOptions,
  type StickerEffects,
} from '@gruenerator/shared/stickers';

export class StickerImageError extends Error {}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new StickerImageError('Das Bild konnte nicht verarbeitet werden.');
  return ctx;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new StickerImageError('Das Bild konnte nicht gelesen werden.'));
    img.src = src;
  });
}

export function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = createCanvas(img.naturalWidth, img.naturalHeight);
  context(canvas).drawImage(img, 0, 0);
  return canvas;
}

/** Crops to the visible motif; throws when nothing is visible. */
export function trimTransparent(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const { data } = context(canvas).getImageData(0, 0, canvas.width, canvas.height);
  const box = alphaBounds(data, canvas.width, canvas.height);
  if (!box) throw new StickerImageError('Auf dem Bild ist nichts zu sehen.');
  const out = createCanvas(box.width, box.height);
  context(out).drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  return out;
}

export function canvasHasTransparency(canvas: HTMLCanvasElement): boolean {
  return hasTransparency(context(canvas).getImageData(0, 0, canvas.width, canvas.height).data);
}

/**
 * Die-cut contour: the thresholded silhouette, tinted, is stamped over a filled
 * disc (a dilation) at reduced resolution for wide outlines, scaled back up
 * under the image. The image itself stays at full resolution on top.
 */
export function addOutline(canvas: HTMLCanvasElement, { width, color }: OutlineOptions) {
  const k = outlineWorkScale(width);
  const w = Math.max(1, Math.round(canvas.width * k));
  const h = Math.max(1, Math.round(canvas.height * k));
  const silhouette = createCanvas(w, h);
  const sctx = context(silhouette);
  sctx.drawImage(canvas, 0, 0, w, h);
  const pixels = sctx.getImageData(0, 0, w, h);
  thresholdAlpha(pixels.data);
  sctx.putImageData(pixels, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = color;
  sctx.fillRect(0, 0, w, h);

  const dilated = createCanvas(w, h);
  const dctx = context(dilated);
  for (const { dx, dy } of discOffsets(width * k)) dctx.drawImage(silhouette, dx, dy);

  const out = createCanvas(canvas.width, canvas.height);
  const ctx = context(out);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(dilated, 0, 0, canvas.width, canvas.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

export function addShadow(canvas: HTMLCanvasElement, { blur, offsetY, opacity }: ShadowOptions) {
  const out = createCanvas(canvas.width, canvas.height);
  const ctx = context(out);
  ctx.shadowColor = `rgba(0, 0, 0, ${opacity})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = offsetY;
  ctx.drawImage(canvas, 0, 0);
  return out;
}

/** Trimmed motif → fitted, padded, outlined and shadowed sticker canvas. */
export function renderSticker(
  motif: HTMLCanvasElement,
  effects: StickerEffects
): HTMLCanvasElement {
  const layout = stickerLayout(motif, effectPadding(effects));
  let canvas = createCanvas(layout.width, layout.height);
  const ctx = context(canvas);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    motif,
    layout.x,
    layout.y,
    Math.round(motif.width * layout.scale),
    Math.round(motif.height * layout.scale)
  );
  const k = layout.effectScale;
  if (effects.outline) {
    canvas = addOutline(canvas, { ...effects.outline, width: effects.outline.width * k });
  }
  if (effects.shadow) {
    const { blur, offsetY, opacity } = effects.shadow;
    canvas = addShadow(canvas, { blur: blur * k, offsetY: offsetY * k, opacity });
  }
  return canvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new StickerImageError('Der Sticker konnte nicht erstellt werden.')),
      'image/png'
    )
  );
}
