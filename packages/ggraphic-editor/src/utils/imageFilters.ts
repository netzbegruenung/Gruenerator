// SPDX-License-Identifier: MPL-2.0
/**
 * Image adjustment filters for user images and background photos
 * (Konva.Filters "Multiple Filters" pattern: cache() the node, then apply an
 * array of filters that read node attrs). See https://konvajs.org/api/Konva.Filters.html
 */

import Konva from 'konva';

import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { messages } from '@ggraphic/editor/i18n/messages';

import type { ImageAdjustments } from './userImageUtils';

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

/** The tint colour when an image has a strength but no colour of its own: the brand accent. */
export const defaultTint = (): string => activeBrand().colors.accent;

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
  const ramp = tintRamp((this.getAttr('tint') as string | undefined) || defaultTint());
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] += (ramp[l * 3]! - d[i]) * strength;
    d[i + 1] += (ramp[l * 3 + 1]! - d[i + 1]) * strength;
    d[i + 2] += (ramp[l * 3 + 2]! - d[i + 2]) * strength;
  }
};

/**
 * Darkens towards the edges by the node's `vignette` (0..1): untouched in the
 * middle, full strength in the corners, eased in between.
 */
export const VignetteFilter: KonvaFilter = function (imageData) {
  const strength = Math.max(0, Math.min(1, (this.getAttr('vignette') as number) || 0));
  if (!strength) return;
  const { width, height, data } = imageData;
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y++) {
    const dy = (y - cy) / cy;
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / cx;
      // 0 in the middle, 1 in the corners.
      const t = Math.min(1, Math.max(0, (Math.sqrt((dx * dx + dy * dy) / 2) - 0.35) / 0.65));
      const k = 1 - strength * t * t * (3 - 2 * t);
      const i = (y * width + x) * 4;
      data[i] *= k;
      data[i + 1] *= k;
      data[i + 2] *= k;
    }
  }
};

/**
 * Mirrors the pixels by the node's `flipX` / `flipY`. A pixel pass instead of
 * a negative scale: the node keeps its geometry, so drag bounds, the
 * transformer and the cover crop stay as they are.
 */
export const FlipFilter: KonvaFilter = function (imageData) {
  const fx = !!this.getAttr('flipX');
  const fy = !!this.getAttr('flipY');
  if (!fx && !fy) return;
  const { width, height, data } = imageData;
  const src = new Uint32Array(data.buffer.slice(0));
  const out = new Uint32Array(data.buffer, data.byteOffset, width * height);
  for (let y = 0; y < height; y++) {
    const sy = fy ? height - 1 - y : y;
    for (let x = 0; x < width; x++) {
      out[y * width + x] = src[sy * width + (fx ? width - 1 - x : x)]!;
    }
  }
};

/** Konva filter array for the image's currently-active adjustments. */
export function getActiveImageFilters(img: ImageAdjustments): KonvaFilter[] {
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
  if (img.vignette) filters.push(VignetteFilter);
  if (img.flipX || img.flipY) filters.push(FlipFilter);
  return filters;
}

export function hasActiveImageFilters(img: ImageAdjustments): boolean {
  return getActiveImageFilters(img).length > 0;
}

/** The node attrs the filters above read. */
export function imageFilterAttrs(img: ImageAdjustments) {
  return {
    blurRadius: img.blur ?? 0,
    brightness: img.brightness ?? 0,
    contrast: img.contrast ?? 0,
    saturation: img.saturation ?? 0,
    hue: img.hue ?? 0,
    temperature: img.temperature ?? 0,
    tint: img.tint,
    tintStrength: img.tintStrength ?? 0,
    vignette: img.vignette ?? 0,
    flipX: !!img.flipX,
    flipY: !!img.flipY,
  };
}

/** Clears every look (for "reset" and as the base of a preset); a flip is not a look and stays. */
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
  vignette: 0,
};

export interface ImagePreset {
  id: string;
  label: string;
  values: ImageAdjustments;
}

/** One-click looks; each applies a full adjustment set on top of a clean base. */
export const IMAGE_PRESETS: ImagePreset[] = [
  {
    id: 'original',
    get label() {
      return messages().imageLooks.original;
    },
    values: { ...EMPTY_ADJUSTMENTS },
  },
  {
    id: 'gruen',
    get label() {
      return messages().imageLooks.gruen;
    },
    values: { ...EMPTY_ADJUSTMENTS, tintStrength: 1 },
  },
  {
    id: 'grau',
    get label() {
      return messages().imageLooks.grau;
    },
    values: { ...EMPTY_ADJUSTMENTS, grayscale: true },
  },
  {
    id: 'vivid',
    get label() {
      return messages().imageLooks.vivid;
    },
    values: { ...EMPTY_ADJUSTMENTS, saturation: 1.6, contrast: 18 },
  },
  {
    id: 'warm',
    get label() {
      return messages().imageLooks.warm;
    },
    values: { ...EMPTY_ADJUSTMENTS, temperature: 40, saturation: 0.6 },
  },
  {
    id: 'cool',
    get label() {
      return messages().imageLooks.cool;
    },
    values: { ...EMPTY_ADJUSTMENTS, temperature: -40 },
  },
  {
    id: 'bw',
    get label() {
      return messages().imageLooks.bw;
    },
    values: { ...EMPTY_ADJUSTMENTS, grayscale: true, contrast: 12 },
  },
  {
    id: 'vintage',
    get label() {
      return messages().imageLooks.vintage;
    },
    values: { ...EMPTY_ADJUSTMENTS, sepia: true, contrast: -10, brightness: 0.05 },
  },
];

/** The template background photo's look, stored on the page state; null when untouched. */
export function backgroundAdjustments(state: Record<string, unknown>): ImageAdjustments | null {
  const value = state.backgroundImageAdjustments;
  return value && typeof value === 'object' ? (value as ImageAdjustments) : null;
}
