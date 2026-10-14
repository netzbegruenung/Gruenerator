import {
  alphaBounds,
  coverRect,
  DEFAULT_PERSON_SCALE,
  gradientLine,
  personSize,
  PROFILBILD_SIZE,
  type Sized,
} from '@gruenerator/shared/profilbild';

type Drawable = CanvasImageSource & Sized;

/** A decoration drawn over the base: centre and width as fractions of the canvas. */
export interface ProfilbildOverlay {
  image: Drawable;
  x: number;
  y: number;
  width: number;
  opacity: number;
}

export type ProfilbildBaseBackground =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; stops: string[]; angle: number }
  /** Equal horizontal bands, top to bottom; drawn as vectors so they stay crisp. */
  | { kind: 'stripes'; colors: string[] }
  | { kind: 'image'; image: Drawable };

export type ProfilbildBackground =
  | ProfilbildBaseBackground
  | { kind: 'preset'; base: ProfilbildBaseBackground; overlays: ProfilbildOverlay[] };

/** A sticker in canvas pixels; x/y is its centre, rotation in degrees around it. */
export interface ProfilbildStickerPlacement {
  image: Drawable;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface ComposeProfilbildOptions {
  cutout: CanvasImageSource & Sized;
  background: ProfilbildBackground;
  scale?: number;
  /** Top-left of the person on the canvas. */
  position: { x: number; y: number };
  size?: number;
  canvas?: HTMLCanvasElement;
  /** Drawn above the person, in this order. */
  stickers?: ProfilbildStickerPlacement[];
}

export function drawProfilbildBackground(
  ctx: CanvasRenderingContext2D,
  background: ProfilbildBackground,
  size: number
) {
  if (background.kind === 'color') {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, size, size);
  } else if (background.kind === 'gradient') {
    const gradient = ctx.createLinearGradient(...gradientLine(background.angle, size));
    const last = Math.max(background.stops.length - 1, 1);
    background.stops.forEach((color, i) => gradient.addColorStop(i / last, color));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  } else if (background.kind === 'stripes') {
    const n = background.colors.length;
    background.colors.forEach((color, i) => {
      const top = Math.round((i * size) / n);
      ctx.fillStyle = color;
      ctx.fillRect(0, top, size, Math.round(((i + 1) * size) / n) - top);
    });
  } else if (background.kind === 'image') {
    const r = coverRect(background.image, size);
    ctx.drawImage(background.image, r.x, r.y, r.width, r.height);
  } else {
    drawProfilbildBackground(ctx, background.base, size);
    for (const o of background.overlays) {
      const width = o.width * size;
      const height = (width * o.image.height) / o.image.width;
      ctx.save();
      ctx.globalAlpha = o.opacity;
      ctx.drawImage(o.image, o.x * size - width / 2, o.y * size - height / 2, width, height);
      ctx.restore();
    }
  }
}

function drawSticker(ctx: CanvasRenderingContext2D, s: ProfilbildStickerPlacement) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate((s.rotation * Math.PI) / 180);
  ctx.drawImage(s.image, -s.width / 2, -s.height / 2, s.width, s.height);
  ctx.restore();
}

/** The background alone, for the editor's background layer. */
export function renderProfilbildBackground(
  background: ProfilbildBackground,
  size = PROFILBILD_SIZE
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) drawProfilbildBackground(ctx, background, size);
  return canvas;
}

export function composeProfilbild({
  cutout,
  background,
  scale = DEFAULT_PERSON_SCALE,
  position,
  size = PROFILBILD_SIZE,
  canvas = document.createElement('canvas'),
  stickers = [],
}: ComposeProfilbildOptions): HTMLCanvasElement {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas wird von diesem Browser nicht unterstützt.');

  ctx.clearRect(0, 0, size, size);
  drawProfilbildBackground(ctx, background, size);

  const p = { ...position, ...personSize(cutout, size, scale) };
  ctx.drawImage(cutout, p.x, p.y, p.width, p.height);
  for (const s of stickers) drawSticker(ctx, s);
  return canvas;
}

export interface TrimmedCutout {
  image: CanvasImageSource & Sized;
  dataUrl: string | null;
}

/** Longest edge the trim scans and outputs; keeps canvases within iOS limits. */
export const TRIM_MAX_EDGE = 2160;

/**
 * Crops transparent margins and caps the long edge at TRIM_MAX_EDGE; returns the
 * input unchanged when nothing can be trimmed or the canvas fails.
 */
export function trimCutout(image: HTMLImageElement): TrimmedCutout {
  const untouched = { image, dataUrl: null };
  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;
  try {
    const k = Math.min(1, TRIM_MAX_EDGE / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * k));
    const h = Math.max(1, Math.round(srcH * k));
    const scan = document.createElement('canvas');
    scan.width = w;
    scan.height = h;
    const scanCtx = scan.getContext('2d', { willReadFrequently: true });
    if (!scanCtx) return untouched;
    scanCtx.drawImage(image, 0, 0, w, h);
    const b = alphaBounds(scanCtx.getImageData(0, 0, w, h).data, w, h);
    if (!b) return untouched;
    if (b.width === w && b.height === h && k === 1) return untouched;

    const out = document.createElement('canvas');
    out.width = b.width;
    out.height = b.height;
    const outCtx = out.getContext('2d');
    if (!outCtx) return untouched;
    outCtx.drawImage(scan, b.x, b.y, b.width, b.height, 0, 0, b.width, b.height);
    return { image: out, dataUrl: out.toDataURL('image/png') };
  } catch (cause) {
    console.warn('trimCutout failed, using the untrimmed cutout', cause);
    return untouched;
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
    img.src = src;
  });
}
