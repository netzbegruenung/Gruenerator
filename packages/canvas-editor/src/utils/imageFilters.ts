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
};

export interface ImagePreset {
  id: string;
  label: string;
  values: ImageAdjustments;
}

/** One-click looks; each applies a full adjustment set on top of a clean base. */
export const IMAGE_PRESETS: ImagePreset[] = [
  { id: 'original', label: 'Original', values: { ...EMPTY_ADJUSTMENTS } },
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
