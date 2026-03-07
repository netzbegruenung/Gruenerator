export type FrameClipType = 'circle' | 'rounded-rect';

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
    name: 'Rechteckrahmen',
    tags: ['rechteck', 'rectangle', 'rahmen', 'frame', 'bild', 'foto', 'abgerundet', 'rounded'],
  },
];

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
