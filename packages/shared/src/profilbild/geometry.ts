export const PROFILBILD_SIZE = 1080;
export const DEFAULT_PERSON_SCALE = 0.85;

export interface Sized {
  width: number;
  height: number;
}

/** CSS convention: 0deg points up, 90deg right, 180deg down. */
export function gradientLine(angle: number, size: number) {
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

export function personRect(src: Sized, size: number, scale: number) {
  const { width, height } = personSize(src, size, scale);
  return { x: Math.round((size - width) / 2), y: size - height, width, height };
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
  const { x, y } = personRect(src, size, scale);
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
