import {
  PiCircleFill,
  PiDiamondFill,
  PiDropFill,
  PiEggFill,
  PiFrameCornersFill,
  PiHexagonFill,
  PiLeafFill,
  PiSquareFill,
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
  | 'leaf';

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
}

export interface FramePreset {
  id: FrameClipType;
  name: string;
  tags: string[];
}

export const FRAME_PRESETS: FramePreset[] = [
  {
    id: 'circle',
    name: 'Kreisrahmen',
    tags: ['kreis', 'circle', 'rund', 'round', 'rahmen', 'frame', 'bild', 'foto'],
  },
  {
    id: 'rounded-rect',
    name: 'Abgerundeter Rahmen',
    tags: ['rechteck', 'rectangle', 'rahmen', 'frame', 'bild', 'foto', 'abgerundet', 'rounded'],
  },
  {
    id: 'square',
    name: 'Rechteckrahmen',
    tags: ['rechteck', 'quadrat', 'square', 'rahmen', 'frame', 'eckig'],
  },
  {
    id: 'oval',
    name: 'Ovaler Rahmen',
    tags: ['oval', 'ellipse', 'ei', 'egg', 'rahmen', 'frame'],
  },
  {
    id: 'hexagon',
    name: 'Sechseck',
    tags: ['sechseck', 'hexagon', 'wabe', 'rahmen', 'frame'],
  },
  {
    id: 'diamond',
    name: 'Raute',
    tags: ['raute', 'diamond', 'rhombus', 'karo', 'rahmen', 'frame'],
  },
  {
    id: 'drop',
    name: 'Tropfen',
    tags: ['tropfen', 'drop', 'wasser', 'rahmen', 'frame'],
  },
  {
    id: 'leaf',
    name: 'Blatt',
    tags: ['blatt', 'leaf', 'natur', 'gruen', 'rahmen', 'frame'],
  },
];

export const FRAME_ICON_MAP: Record<FrameClipType, IconType> = {
  circle: PiCircleFill,
  'rounded-rect': PiFrameCornersFill,
  square: PiSquareFill,
  oval: PiEggFill,
  hexagon: PiHexagonFill,
  diamond: PiDiamondFill,
  drop: PiDropFill,
  leaf: PiLeafFill,
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
};

export const DEFAULT_FRAME_SIZE = 300;

let instanceCounter = 0;

export function createFrameInstance(clipType: FrameClipType, x: number, y: number): FrameInstance {
  instanceCounter += 1;
  return {
    id: `frame-${Date.now()}-${instanceCounter}`,
    clipType,
    x,
    y,
    width: DEFAULT_FRAME_SIZE,
    height: DEFAULT_FRAME_SIZE,
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
