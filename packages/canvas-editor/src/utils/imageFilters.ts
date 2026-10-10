/**
 * Image adjustment filters for user images (Konva.Filters "Multiple Filters"
 * pattern: cache() the node, then apply an array of filters that read node
 * attrs). See https://konvajs.org/api/Konva.Filters.html
 */

import Konva from 'konva';

import type { ImageAdjustments, UserImageInstance } from './userImageUtils';

type KonvaFilter = typeof Konva.Filters.Grayscale;

/**
 * Custom warm/cool filter (Konva has none): shifts red up / blue down for warm,
 * the inverse for cool. Reads the node's `temperature` attr (-100..100).
 */
export const TemperatureFilter: KonvaFilter = function (imageData) {
  const temp = (this.getAttr('temperature') || 0) / 100;
  if (!temp) return;
  const shift = temp * 50;
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.max(0, Math.min(255, d[i] + shift));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] - shift));
  }
};

/** The tint colour when an image has a strength but no colour of its own: DE Klee. */
export const DEFAULT_TINT = '#008939';

const hexRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Duotone ramp of one colour: luma 0 → a dark shade of it, 0.5 → the colour
 * itself, 1 → a pale tone of it. 256 RGB entries, indexed by luma.
 */
export function tintRamp(tint: string): Uint8ClampedArray {
  const mid = hexRgb(tint);
  const dark = mid.map((c) => c * 0.3);
  const light = mid.map((c) => c + (255 - c) * 0.8);
  const ramp = new Uint8ClampedArray(256 * 3);
  for (let l = 0; l < 256; l++) {
    const t = l / 255;
    for (let k = 0; k < 3; k++) {
      ramp[l * 3 + k] =
        t < 0.5
          ? dark[k]! + (mid[k]! - dark[k]!) * (t * 2)
          : mid[k]! + (light[k]! - mid[k]!) * (t * 2 - 1);
    }
  }
  return ramp;
}

/** Duotone in the node's `tint` colour, blended over the photo by `tintStrength` (0..1). */
export const TintFilter: KonvaFilter = function (imageData) {
  const strength = Math.max(0, Math.min(1, (this.getAttr('tintStrength') as number) || 0));
  if (!strength) return;
  const ramp = tintRamp((this.getAttr('tint') as string | undefined) || DEFAULT_TINT);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] += (ramp[l * 3]! - d[i]) * strength;
    d[i + 1] += (ramp[l * 3 + 1]! - d[i + 1]) * strength;
    d[i + 2] += (ramp[l * 3 + 2]! - d[i + 2]) * strength;
  }
};

/** Konva filter array for the image's currently-active adjustments. */
export function getActiveImageFilters(img: UserImageInstance): KonvaFilter[] {
  const filters: KonvaFilter[] = [];
  if (img.brightness) filters.push(Konva.Filters.Brighten);
  if (img.contrast) filters.push(Konva.Filters.Contrast);
  if ((img.saturation ?? 0) !== 0 || (img.hue ?? 0) !== 0) filters.push(Konva.Filters.HSL);
  if (img.blur) filters.push(Konva.Filters.Blur);
  if (img.temperature) filters.push(TemperatureFilter);
  if (img.grayscale) filters.push(Konva.Filters.Grayscale);
  if (img.sepia) filters.push(Konva.Filters.Sepia);
  if (img.invert) filters.push(Konva.Filters.Invert);
  if (img.tintStrength) filters.push(TintFilter);
  return filters;
}

export function hasActiveImageFilters(img: UserImageInstance): boolean {
  return getActiveImageFilters(img).length > 0;
}

/** Clears every adjustment field (for the "reset" button). */
export const EMPTY_ADJUSTMENTS: ImageAdjustments = {
  blur: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  grayscale: false,
  sepia: false,
  invert: false,
  tintStrength: 0,
};

export interface ImagePreset {
  id: string;
  label: string;
  values: ImageAdjustments;
}

/** One-click looks; each applies a full adjustment set on top of a clean base. */
export const IMAGE_PRESETS: ImagePreset[] = [
  { id: 'original', label: 'Original', values: { ...EMPTY_ADJUSTMENTS } },
  { id: 'gruen', label: 'Grün eingefärbt', values: { ...EMPTY_ADJUSTMENTS, tintStrength: 1 } },
  { id: 'grau', label: 'Graustufen', values: { ...EMPTY_ADJUSTMENTS, grayscale: true } },
  {
    id: 'vivid',
    label: 'Kräftig',
    values: { ...EMPTY_ADJUSTMENTS, saturation: 1.6, contrast: 18 },
  },
  { id: 'warm', label: 'Warm', values: { ...EMPTY_ADJUSTMENTS, temperature: 40, saturation: 0.6 } },
  { id: 'cool', label: 'Kühl', values: { ...EMPTY_ADJUSTMENTS, temperature: -40 } },
  { id: 'bw', label: 'S/W', values: { ...EMPTY_ADJUSTMENTS, grayscale: true, contrast: 12 } },
  {
    id: 'vintage',
    label: 'Vintage',
    values: { ...EMPTY_ADJUSTMENTS, sepia: true, contrast: -10, brightness: 0.05 },
  },
];
