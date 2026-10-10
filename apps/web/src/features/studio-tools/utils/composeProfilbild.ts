export const PROFILBILD_SIZE = 1080;
export const DEFAULT_PERSON_SCALE = 0.85;

interface Sized {
  width: number;
  height: number;
}

export type ProfilbildBackground =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; stops: string[]; angle: number }
  | { kind: 'image'; image: CanvasImageSource & Sized };

export interface ComposeProfilbildOptions {
  cutout: CanvasImageSource & Sized;
  background: ProfilbildBackground;
  scale?: number;
  /** Pixels added to the bottom-anchored y; negative lifts the person. */
  offsetY?: number;
  /** Explicit top-left of the person; overrides the centred, bottom-anchored default. */
  position?: { x: number; y: number };
  size?: number;
  canvas?: HTMLCanvasElement;
}

/** CSS convention: 0deg points up, 90deg right, 180deg down. */
function gradientLine(angle: number, size: number) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const half = (size / 2) * (Math.abs(dx) + Math.abs(dy));
  const c = size / 2;
  return [c - dx * half, c - dy * half, c + dx * half, c + dy * half] as const;
}

export function coverRect(src: Sized, size: number) {
  const s = Math.max(size / src.width, size / src.height);
  const width = src.width * s;
  const height = src.height * s;
  return { x: (size - width) / 2, y: (size - height) / 2, width, height };
}

export function personSize(src: Sized, size: number, scale: number) {
  const aspect = src.width / src.height;
  if (aspect > 1) {
    const width = Math.round(size * scale);
    return { width, height: Math.round(width / aspect) };
  }
  const height = Math.round(size * scale);
  return { width: Math.round(height * aspect), height };
}

export function personRect(src: Sized, size: number, scale: number, offsetY: number) {
  const { width, height } = personSize(src, size, scale);
  return { x: Math.round((size - width) / 2), y: size - height + offsetY, width, height };
}

export interface PersonPlacement {
  x: number;
  y: number;
  scale: number;
}

export function defaultPlacement(
  src: Sized,
  size = PROFILBILD_SIZE,
  scale = DEFAULT_PERSON_SCALE
): PersonPlacement {
  const { x, y } = personRect(src, size, scale, 0);
  return { x, y, scale };
}

export function placementRect(src: Sized, p: PersonPlacement, size = PROFILBILD_SIZE) {
  return { x: p.x, y: p.y, ...personSize(src, size, p.scale) };
}

/** Rescales around the person's horizontal centre and bottom edge. */
export function rescalePlacement(
  src: Sized,
  p: PersonPlacement,
  scale: number,
  size = PROFILBILD_SIZE
): PersonPlacement {
  const before = personSize(src, size, p.scale);
  const after = personSize(src, size, scale);
  return {
    x: Math.round(p.x + (before.width - after.width) / 2),
    y: p.y + before.height - after.height,
    scale,
  };
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
  } else {
    const r = coverRect(background.image, size);
    ctx.drawImage(background.image, r.x, r.y, r.width, r.height);
  }
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
  offsetY = 0,
  position,
  size = PROFILBILD_SIZE,
  canvas = document.createElement('canvas'),
}: ComposeProfilbildOptions): HTMLCanvasElement {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas wird von diesem Browser nicht unterstützt.');

  ctx.clearRect(0, 0, size, size);
  drawProfilbildBackground(ctx, background, size);

  const p = position
    ? { ...position, ...personSize(cutout, size, scale) }
    : personRect(cutout, size, scale, offsetY);
  ctx.drawImage(cutout, p.x, p.y, p.width, p.height);
  return canvas;
}

export interface AlphaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ALPHA_THRESHOLD = 8;

export function alphaBounds(
  data: ArrayLike<number>,
  width: number,
  height: number,
  threshold = ALPHA_THRESHOLD
): AlphaBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export interface TrimmedCutout {
  image: CanvasImageSource & Sized;
  dataUrl: string | null;
}

/** Crops transparent margins; returns the input unchanged when nothing can be trimmed. */
export function trimCutout(image: HTMLImageElement): TrimmedCutout {
  const untouched = { image, dataUrl: null };
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  try {
    const scan = document.createElement('canvas');
    scan.width = w;
    scan.height = h;
    const scanCtx = scan.getContext('2d', { willReadFrequently: true });
    if (!scanCtx) return untouched;
    scanCtx.drawImage(image, 0, 0);
    const b = alphaBounds(scanCtx.getImageData(0, 0, w, h).data, w, h);
    if (!b || (b.width === w && b.height === h)) return untouched;

    const out = document.createElement('canvas');
    out.width = b.width;
    out.height = b.height;
    const outCtx = out.getContext('2d');
    if (!outCtx) return untouched;
    outCtx.drawImage(scan, b.x, b.y, b.width, b.height, 0, 0, b.width, b.height);
    return { image: out, dataUrl: out.toDataURL('image/png') };
  } catch {
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
