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

export function personRect(src: Sized, size: number, scale: number, offsetY: number) {
  const aspect = src.width / src.height;
  let width: number;
  let height: number;
  if (aspect > 1) {
    width = Math.round(size * scale);
    height = Math.round(width / aspect);
  } else {
    height = Math.round(size * scale);
    width = Math.round(height * aspect);
  }
  return { x: Math.round((size - width) / 2), y: size - height + offsetY, width, height };
}

export function composeProfilbild({
  cutout,
  background,
  scale = DEFAULT_PERSON_SCALE,
  offsetY = 0,
  size = PROFILBILD_SIZE,
  canvas = document.createElement('canvas'),
}: ComposeProfilbildOptions): HTMLCanvasElement {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas wird von diesem Browser nicht unterstützt.');

  ctx.clearRect(0, 0, size, size);
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

  const p = personRect(cutout, size, scale, offsetY);
  ctx.drawImage(cutout, p.x, p.y, p.width, p.height);
  return canvas;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
    img.src = src;
  });
}
