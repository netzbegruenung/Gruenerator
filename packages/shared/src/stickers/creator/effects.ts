/**
 * Sticker effect maths shared by the web (2D canvas) and mobile (Skia)
 * creators: fit, padding, alpha threshold and the outline's dilation disc.
 */

export const STICKER_MAX_SIDE = 1024;
export const STICKER_MIN_SIDE = 64;
const ALPHA_THRESHOLD = 8;
/** Keeps antialiased edges off the canvas border even without effects. */
const SAFETY_PAD = 4;

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

/** Outline strength slider, at reference scale. */
export const STICKER_OUTLINE = { min: 8, max: 48, step: 2, initial: 24 } as const;
export const STICKER_SHADOW: ShadowOptions = { blur: 24, offsetY: 12, opacity: 0.35 };

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

/** Largest dilation radius in work pixels; wider outlines are dilated at reduced resolution. */
const OUTLINE_WORK_RADIUS = 16;
const DISC_SPACING = 2;

/**
 * Resolution factor for dilating an outline of `radius` pixels: the disc is
 * at most {@link OUTLINE_WORK_RADIUS} pixels wide in work space, so the cost
 * stays bounded (about 230 stamps on web) whatever the slider says.
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
