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
