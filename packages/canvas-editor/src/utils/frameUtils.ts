import {
  PiCircleFill,
  PiCircleDashedBold,
  PiCloudFill,
  PiChatCircleFill,
  PiDiamondFill,
  PiDropFill,
  PiEggFill,
  PiFrameCornersFill,
  PiHeartFill,
  PiHexagonFill,
  PiLeafFill,
  PiOctagonFill,
  PiSquareFill,
  PiStarFill,
  PiTagFill,
  PiTriangleFill,
} from 'react-icons/pi';

import type { IconType } from 'react-icons';

export type FrameClipType =
  | 'circle'
  | 'rounded-rect'
  | 'square'
  | 'oval'
  | 'hexagon'
  | 'diamond'
  | 'drop'
  | 'leaf'
  | 'star'
  | 'heart'
  | 'cloud'
  | 'blob'
  | 'arch'
  | 'octagon'
  | 'pentagon'
  | 'triangle'
  | 'speech-bubble'
  | 'banner-tag'
  | 'ring'
  | 'ribbon';

/**
 * Display category for the Rahmen palette. Each clip-type belongs to exactly
 * one category — RahmenSection groups by this field at render time and emits
 * a German-labeled subheader per category.
 */
export type FrameCategory = 'geometric' | 'soft' | 'organic' | 'stars' | 'speech' | 'banners';

export interface FrameInstance {
  id: string;
  clipType: FrameClipType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  imageSrc: string | null;
  imageOffsetX: number;
  imageOffsetY: number;
  imageScale: number;
  borderColor: string;
  borderWidth: number;
  cornerRadius: number;
  // --- Phase 1d schema groundwork (no UI yet; defaults are inert) ---
  // Border styling (Phase 2)
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double';
  borderDash?: number[];
  // Drop shadow (Phase 3)
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  // Polaroid (Phase 4)
  caption?: string;
  tilt?: number;
  // Aspect-ratio lock (Phase 5)
  aspectRatioLock?: number;
}

export interface FramePreset<T extends FrameClipType = FrameClipType> {
  id: T;
  name: string;
  tags: readonly string[];
  category: FrameCategory;
}

/**
 * Source of truth for frame metadata. Typed as `{ [K in FrameClipType]: FramePreset<K> }`
 * so adding a new FrameClipType without registering it here is a compile error.
 * Each entry's `id` is bound to its key. Object key insertion order is the
 * fallback search order; FRAME_PRESETS is derived.
 */
const FRAME_PRESET_DEFS: { readonly [K in FrameClipType]: FramePreset<K> } = {
  circle: {
    id: 'circle',
    name: 'Kreisrahmen',
    tags: ['kreis', 'circle', 'rund', 'round', 'rahmen', 'frame', 'bild', 'foto'],
    category: 'soft',
  },
  oval: {
    id: 'oval',
    name: 'Ovaler Rahmen',
    tags: ['oval', 'ellipse', 'ei', 'egg', 'rahmen', 'frame'],
    category: 'soft',
  },
  ring: {
    id: 'ring',
    name: 'Ringrahmen',
    tags: ['ring', 'donut', 'kranz', 'rahmen', 'frame'],
    category: 'soft',
  },
  square: {
    id: 'square',
    name: 'Rechteckrahmen',
    tags: ['rechteck', 'quadrat', 'square', 'rahmen', 'frame', 'eckig'],
    category: 'geometric',
  },
  'rounded-rect': {
    id: 'rounded-rect',
    name: 'Abgerundeter Rahmen',
    tags: ['rechteck', 'rectangle', 'rahmen', 'frame', 'bild', 'foto', 'abgerundet', 'rounded'],
    category: 'geometric',
  },
  triangle: {
    id: 'triangle',
    name: 'Dreieck',
    tags: ['dreieck', 'triangle', 'rahmen', 'frame', 'spitz'],
    category: 'geometric',
  },
  diamond: {
    id: 'diamond',
    name: 'Raute',
    tags: ['raute', 'diamond', 'rhombus', 'karo', 'rahmen', 'frame'],
    category: 'geometric',
  },
  pentagon: {
    id: 'pentagon',
    name: 'Fünfeck',
    tags: ['fuenfeck', 'fünfeck', 'pentagon', 'rahmen', 'frame'],
    category: 'geometric',
  },
  hexagon: {
    id: 'hexagon',
    name: 'Sechseck',
    tags: ['sechseck', 'hexagon', 'wabe', 'rahmen', 'frame'],
    category: 'geometric',
  },
  octagon: {
    id: 'octagon',
    name: 'Achteck',
    tags: ['achteck', 'octagon', 'rahmen', 'frame', 'stop'],
    category: 'geometric',
  },
  arch: {
    id: 'arch',
    name: 'Bogen',
    tags: ['bogen', 'arch', 'tor', 'fenster', 'rahmen', 'frame'],
    category: 'geometric',
  },
  drop: {
    id: 'drop',
    name: 'Tropfen',
    tags: ['tropfen', 'drop', 'wasser', 'rahmen', 'frame'],
    category: 'organic',
  },
  leaf: {
    id: 'leaf',
    name: 'Blatt',
    tags: ['blatt', 'leaf', 'natur', 'gruen', 'rahmen', 'frame'],
    category: 'organic',
  },
  heart: {
    id: 'heart',
    name: 'Herz',
    tags: ['herz', 'heart', 'liebe', 'love', 'rahmen', 'frame'],
    category: 'organic',
  },
  cloud: {
    id: 'cloud',
    name: 'Wolke',
    tags: ['wolke', 'cloud', 'himmel', 'rahmen', 'frame'],
    category: 'organic',
  },
  blob: {
    id: 'blob',
    name: 'Blob',
    tags: ['blob', 'organisch', 'klecks', 'rahmen', 'frame', 'modern'],
    category: 'organic',
  },
  star: {
    id: 'star',
    name: 'Stern',
    tags: ['stern', 'star', 'rahmen', 'frame'],
    category: 'stars',
  },
  'speech-bubble': {
    id: 'speech-bubble',
    name: 'Sprechblase',
    tags: ['sprechblase', 'speech', 'bubble', 'zitat', 'quote', 'rahmen', 'frame'],
    category: 'speech',
  },
  'banner-tag': {
    id: 'banner-tag',
    name: 'Etikett',
    tags: ['etikett', 'tag', 'label', 'banner', 'rahmen', 'frame'],
    category: 'banners',
  },
  ribbon: {
    id: 'ribbon',
    name: 'Banner',
    tags: ['banner', 'ribbon', 'fahne', 'header', 'rahmen', 'frame'],
    category: 'banners',
  },
};

export const FRAME_PRESETS: ReadonlyArray<FramePreset> = Object.values(FRAME_PRESET_DEFS);
export const getFramePreset = <T extends FrameClipType>(type: T): FramePreset<T> =>
  FRAME_PRESET_DEFS[type];

/**
 * Display order (top-to-bottom) for category subheaders in the Rahmen panel.
 */
export const FRAME_CATEGORY_ORDER: readonly FrameCategory[] = [
  'geometric',
  'soft',
  'organic',
  'stars',
  'speech',
  'banners',
];

export const FRAME_CATEGORY_LABELS: Record<FrameCategory, string> = {
  geometric: 'Geometrisch',
  soft: 'Rund',
  organic: 'Organisch',
  stars: 'Sterne',
  speech: 'Sprechblasen',
  banners: 'Banner',
};

export const FRAME_ICON_MAP: Record<FrameClipType, IconType> = {
  circle: PiCircleFill,
  'rounded-rect': PiFrameCornersFill,
  square: PiSquareFill,
  oval: PiEggFill,
  hexagon: PiHexagonFill,
  diamond: PiDiamondFill,
  drop: PiDropFill,
  leaf: PiLeafFill,
  star: PiStarFill,
  heart: PiHeartFill,
  cloud: PiCloudFill,
  blob: PiCircleFill,
  arch: PiFrameCornersFill,
  octagon: PiOctagonFill,
  pentagon: PiHexagonFill,
  triangle: PiTriangleFill,
  'speech-bubble': PiChatCircleFill,
  'banner-tag': PiTagFill,
  ring: PiCircleDashedBold,
  ribbon: PiTagFill,
};

// SVG path strings for each frame silhouette, normalized to a 44x44 viewBox.
// Used to render filled mini-previews in the sidebar preset grid (Canva-style).
export const FRAME_PRESET_PATHS: Record<FrameClipType, string> = {
  circle: 'M22 2 a20 20 0 1 0 0 40 a20 20 0 1 0 0 -40',
  'rounded-rect':
    'M8 2 h28 a6 6 0 0 1 6 6 v28 a6 6 0 0 1 -6 6 h-28 a6 6 0 0 1 -6 -6 v-28 a6 6 0 0 1 6 -6 z',
  square: 'M2 2 h40 v40 h-40 z',
  oval: 'M22 2 a14 20 0 1 0 0 40 a14 20 0 1 0 0 -40',
  hexagon: 'M22 2 L40 12 L40 32 L22 42 L4 32 L4 12 z',
  diamond: 'M22 2 L42 22 L22 42 L2 22 z',
  drop: 'M22 2 C 8 16, 8 36, 22 42 C 36 36, 36 16, 22 2 z',
  leaf: 'M2 42 C 2 12, 12 2, 42 2 C 42 32, 32 42, 2 42 z',
  // 5-point star
  star: 'M22 2 L27 16 L42 16 L30 25 L34 40 L22 31 L10 40 L14 25 L2 16 L17 16 z',
  // Classic rounded heart
  heart: 'M22 40 C 22 40 4 28 4 14 C 4 5 13 2 22 12 C 31 2 40 5 40 14 C 40 28 22 40 22 40 z',
  // Soft 3-bump cloud
  cloud:
    'M14 32 C 6 32 2 26 5 20 C 7 14 14 13 17 17 C 18 9 28 7 33 14 C 38 9 42 14 42 20 C 42 28 36 32 30 31 C 26 35 18 35 14 32 z',
  // Asymmetric organic blob
  blob: 'M22 2 C 33 4 41 12 42 22 C 42 32 35 41 24 42 C 14 43 4 36 2 26 C 0 16 7 7 14 4 C 17 3 19 2 22 2 z',
  // Round-top, flat-bottom arch (window/door shape)
  arch: 'M2 42 L2 22 C 2 11 11 2 22 2 C 33 2 42 11 42 22 L42 42 z',
  // Regular 8-sided octagon
  octagon: 'M14 2 L30 2 L42 14 L42 30 L30 42 L14 42 L2 30 L2 14 z',
  // Regular 5-sided pentagon
  pentagon: 'M22 2 L42 16 L34 40 L10 40 L2 16 z',
  // Equilateral triangle (point up)
  triangle: 'M22 2 L42 40 L2 40 z',
  // Speech bubble with bottom-left tail
  'speech-bubble':
    'M2 4 L42 4 L42 32 L20 32 L10 42 L12 32 L2 32 z',
  // Banner-tag: rect with chevron-cut left side (price-tag style)
  'banner-tag': 'M2 22 L12 4 L42 4 L42 40 L12 40 z',
  // Annular ring (donut) — outer + inner subpaths; even-odd fill in <path fill-rule="evenodd"> usage
  ring: 'M22 2 a20 20 0 1 0 0 40 a20 20 0 1 0 0 -40 z M22 14 a8 8 0 1 0 0 16 a8 8 0 1 0 0 -16 z',
  // Ribbon: rectangular middle with chevron tails left and right
  ribbon: 'M2 14 L10 22 L2 30 L14 30 L14 38 L30 38 L30 30 L42 30 L34 22 L42 14 L30 14 L30 6 L14 6 L14 14 z',
};

export const DEFAULT_FRAME_SIZE = 300;

/**
 * Per-clip-type initial dimensions. Frames whose silhouette is naturally
 * non-square (banners, arches, ribbons) open at a sensible aspect ratio.
 * Anything not listed defaults to DEFAULT_FRAME_SIZE × DEFAULT_FRAME_SIZE.
 */
const DEFAULT_FRAME_DIMENSIONS: Partial<Record<FrameClipType, { width: number; height: number }>> = {
  arch: { width: 300, height: 380 },
  'speech-bubble': { width: 360, height: 300 },
  'banner-tag': { width: 380, height: 220 },
  ribbon: { width: 380, height: 220 },
  oval: { width: 300, height: 220 },
};

let instanceCounter = 0;

export function createFrameInstance(clipType: FrameClipType, x: number, y: number): FrameInstance {
  instanceCounter += 1;
  const dims = DEFAULT_FRAME_DIMENSIONS[clipType] ?? {
    width: DEFAULT_FRAME_SIZE,
    height: DEFAULT_FRAME_SIZE,
  };
  return {
    id: `frame-${Date.now()}-${instanceCounter}`,
    clipType,
    x,
    y,
    width: dims.width,
    height: dims.height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    imageSrc: null,
    imageOffsetX: 0,
    imageOffsetY: 0,
    imageScale: 1,
    borderColor: '#005538',
    borderWidth: 3,
    cornerRadius: clipType === 'rounded-rect' ? 24 : 0,
  };
}
