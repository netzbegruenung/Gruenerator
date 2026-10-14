/**
 * Sticker effects on a 2D canvas: trim, die-cut outline, drop shadow, fit.
 * The geometry and alpha maths are pure functions so they run in node tests;
 * the canvas wrappers below only move pixels.
 */

export const STICKER_MAX_SIDE = 1024;
export const STICKER_MIN_SIDE = 64;
const ALPHA_THRESHOLD = 8;
/** Keeps antialiased edges off the canvas border even without effects. */
const SAFETY_PAD = 4;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OutlineOptions {
  /** In pixels of a {@link STICKER_MAX_SIDE} sticker. */
  width: number;
  color: string;
}

export interface ShadowOptions {
  blur: number;
  offsetY: number;
  opacity: number;
}

export interface StickerEffects {
  outline: OutlineOptions | null;
  shadow: ShadowOptions | null;
}

export class StickerImageError extends Error {}

/** Bounding box of every pixel with alpha above the threshold; null when all transparent. */
export function alphaBounds(
  data: ArrayLike<number>,
  width: number,
  height: number,
  threshold = ALPHA_THRESHOLD
): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if ((data[row + x * 4 + 3] ?? 0) > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** True when some pixel is noticeably see-through — a sticker PNG, not a flat photo. */
export function hasTransparency(data: ArrayLike<number>): boolean {
  for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 255) < 250) return true;
  return false;
}

/** Room an effect needs around the motif, at reference scale. */
export function effectPadding({ outline, shadow }: StickerEffects): number {
  const shadowPad = shadow ? shadow.blur + Math.abs(shadow.offsetY) : 0;
  return SAFETY_PAD + (outline?.width ?? 0) + shadowPad;
}

export interface StickerLayout {
  /** Scale applied to the trimmed motif. */
  scale: number;
  /** Factor from reference-scale effect sizes to output pixels. */
  effectScale: number;
  width: number;
  height: number;
  /** Where the scaled motif's top-left corner lands. */
  x: number;
  y: number;
}

/**
 * Places a trimmed motif on the output canvas: the longer output side never
 * exceeds `maxSide`, effects grow with the motif (they are given for a
 * full-size sticker), small motifs are not upscaled, and a short side below
 * `minSide` is padded with transparency so the API accepts it.
 */
export function stickerLayout(
  motif: { width: number; height: number },
  pad: number,
  maxSide = STICKER_MAX_SIDE,
  minSide = STICKER_MIN_SIDE
): StickerLayout {
  const longSide = Math.max(motif.width, motif.height);
  const room = maxSide - 2 * pad;
  const scale = Math.min(1, room / longSide);
  const effectScale = Math.min(1, (longSide * scale) / room);
  const p = Math.round(pad * effectScale);
  const w = Math.max(1, Math.round(motif.width * scale));
  const h = Math.max(1, Math.round(motif.height * scale));
  const width = Math.min(maxSide, Math.max(minSide, w + 2 * p));
  const height = Math.min(maxSide, Math.max(minSide, h + 2 * p));
  return {
    scale,
    effectScale,
    width,
    height,
    x: Math.round((width - w) / 2),
    y: Math.round((height - h) / 2),
  };
}

/** Clears alpha at or below the threshold so faint specks don't stamp outline blobs. */
export function thresholdAlpha<T extends { [i: number]: number; length: number }>(
  data: T,
  threshold = ALPHA_THRESHOLD
): T {
  for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) <= threshold) data[i] = 0;
  return data;
}

/** Largest stamping radius in work pixels; wider outlines are dilated at reduced resolution. */
const OUTLINE_WORK_RADIUS = 16;
const DISC_SPACING = 2;

/**
 * Resolution factor for dilating an outline of `radius` pixels: the disc is
 * stamped with at most {@link OUTLINE_WORK_RADIUS} pixels so the stamp count
 * stays bounded (about 230 at most) whatever the slider says.
 */
export function outlineWorkScale(radius: number): number {
  return radius > OUTLINE_WORK_RADIUS ? OUTLINE_WORK_RADIUS / radius : 1;
}

/**
 * Offsets filling a disc: the centre plus concentric rings at most
 * {@link DISC_SPACING} pixels apart, with stamps on each ring at most that far
 * apart too — so even a single speck dilates to a solid disc, not to rings.
 */
export function discOffsets(radius: number): { dx: number; dy: number }[] {
  if (radius <= 0) return [];
  const offsets = [{ dx: 0, dy: 0 }];
  const rings = Math.ceil(radius / DISC_SPACING);
  for (let k = 1; k <= rings; k++) {
    const r = (radius * k) / rings;
    const steps = Math.max(6, Math.ceil((2 * Math.PI * r) / DISC_SPACING));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * 2 * Math.PI;
      offsets.push({ dx: Math.cos(a) * r, dy: Math.sin(a) * r });
    }
  }
  return offsets;
}

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
