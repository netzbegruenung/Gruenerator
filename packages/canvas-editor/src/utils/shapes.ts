export type ShapeType =
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'star'
  | 'arrow'
  | 'heart'
  | 'cloud'
  | 'hexagon'
  | 'pentagon'
  | 'diamond'
  | 'ellipse'
  | 'rounded-rect'
  | 'ring'
  | 'chevron'
  | 'double-arrow'
  | 'wavy'
  | 'speech-round'
  | 'speech-rect'
  | 'sparkle'
  | 'checkmark'
  | 'blob'
  | 'leaf';

export interface ShapeDef {
  id: ShapeType;
  name: string;
  tags: string[];
}

export const ALL_SHAPES: ShapeDef[] = [
  {
    id: 'rect',
    name: 'Rechteck',
    tags: ['rechteck', 'rectangle', 'quadrat', 'square', 'box', 'kasten'],
  },
  { id: 'circle', name: 'Kreis', tags: ['kreis', 'circle', 'rund', 'round', 'punkt', 'dot'] },
  { id: 'triangle', name: 'Dreieck', tags: ['dreieck', 'triangle', 'spitz', 'pyramide'] },
  { id: 'star', name: 'Stern', tags: ['stern', 'star', 'sterne', 'funkel', 'sparkle'] },
  { id: 'arrow', name: 'Pfeil', tags: ['pfeil', 'arrow', 'richtung', 'zeiger', 'hinweis'] },
  { id: 'heart', name: 'Herz', tags: ['herz', 'heart', 'liebe', 'love', 'romantik'] },
  { id: 'cloud', name: 'Wolke', tags: ['wolke', 'cloud', 'himmel', 'sky', 'wetter'] },
  {
    id: 'hexagon',
    name: 'Sechseck',
    tags: ['sechseck', 'hexagon', 'wabe', 'badge', 'sechs'],
  },
  {
    id: 'pentagon',
    name: 'Fünfeck',
    tags: ['fuenfeck', 'fünfeck', 'pentagon', 'fuenf', 'fünf'],
  },
  {
    id: 'diamond',
    name: 'Raute',
    tags: ['raute', 'diamond', 'rhombus', 'karo', 'fokus'],
  },
  {
    id: 'ellipse',
    name: 'Ellipse',
    tags: ['ellipse', 'oval', 'eierform', 'lang'],
  },
  {
    id: 'rounded-rect',
    name: 'Abgerundetes Rechteck',
    tags: ['abgerundet', 'rounded', 'rechteck', 'rectangle', 'pille', 'pill', 'soft'],
  },
  {
    id: 'ring',
    name: 'Ring',
    tags: ['ring', 'donut', 'donat', 'kranz', 'kreis', 'rahmen'],
  },
  {
    id: 'chevron',
    name: 'Chevron',
    tags: ['chevron', 'pfeilspitze', 'spitze', 'pfeil', 'weiter', 'next'],
  },
  {
    id: 'double-arrow',
    name: 'Doppelpfeil',
    tags: ['doppelpfeil', 'double', 'arrow', 'beidseitig', 'vergleich', 'versus'],
  },
  {
    id: 'wavy',
    name: 'Wellenlinie',
    tags: ['welle', 'wave', 'wellenlinie', 'linie', 'trenner', 'divider'],
  },
  {
    id: 'speech-round',
    name: 'Sprechblase',
    tags: ['sprechblase', 'speech', 'bubble', 'zitat', 'quote', 'sagen', 'rund'],
  },
  {
    id: 'speech-rect',
    name: 'Sprechblase eckig',
    tags: ['sprechblase', 'speech', 'bubble', 'zitat', 'quote', 'eckig', 'rectangle'],
  },
  {
    id: 'sparkle',
    name: 'Funkeln',
    tags: ['funkeln', 'sparkle', 'glanz', 'glitzern', 'magie', 'twinkle'],
  },
  {
    id: 'checkmark',
    name: 'Häkchen',
    tags: ['haekchen', 'häkchen', 'check', 'checkmark', 'ja', 'erledigt', 'tick', 'ok'],
  },
  {
    id: 'blob',
    name: 'Blob',
    tags: ['blob', 'organisch', 'klecks', 'form', 'modern', 'fluid'],
  },
  {
    id: 'leaf',
    name: 'Blatt',
    tags: ['blatt', 'leaf', 'natur', 'nature', 'grün', 'gruen', 'pflanze', 'oeko'],
  },
];

export interface ShapeInstance {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  cornerRadius?: number;
}

export const BRAND_COLORS = [
  { id: 'tanne', name: 'Tanne', value: '#005538' },
  { id: 'klee', name: 'Klee', value: '#008939' },
  { id: 'grashalm', name: 'Grashalm', value: '#8ABD24' },
  { id: 'himmel', name: 'Himmel', value: '#0BA1DD' },
  { id: 'sand', name: 'Sand', value: '#F5F1E9' },
  { id: 'hellgruen', name: 'Hellgrün', value: '#6CCD87' },
  { id: 'dunkelgrau', name: 'Dunkelgrau', value: '#2E2E3D' },
  { id: 'white', name: 'Weiß', value: '#FFFFFF' },
  { id: 'black', name: 'Schwarz', value: '#000000' },
];

export const FONT_COLORS = [
  { id: 'black', name: 'Schwarz', value: '#000000' },
  { id: 'white', name: 'Weiß', value: '#FFFFFF' },
  { id: 'tanne', name: 'Tanne', value: '#005538' },
  { id: 'sand', name: 'Sand', value: '#F5F1E9' },
  { id: 'klee', name: 'Klee', value: '#008939' },
];

export const DEFAULT_SHAPE_SIZE = 300;

const DEFAULT_DIMENSIONS: Partial<Record<ShapeType, { width: number; height: number }>> = {
  ellipse: { width: 300, height: 180 },
  'speech-round': { width: 320, height: 260 },
  'speech-rect': { width: 320, height: 220 },
  wavy: { width: 320, height: 80 },
  'double-arrow': { width: 320, height: 120 },
  chevron: { width: 200, height: 240 },
  leaf: { width: 240, height: 300 },
};

const DEFAULT_CORNER_RADIUS: Partial<Record<ShapeType, number>> = {
  'rounded-rect': 32,
};

export const createShape = (
  type: ShapeType,
  x: number,
  y: number,
  color: string
): ShapeInstance => {
  const dims = DEFAULT_DIMENSIONS[type] ?? { width: DEFAULT_SHAPE_SIZE, height: DEFAULT_SHAPE_SIZE };
  const base: ShapeInstance = {
    id: `shape-${Date.now()}`,
    type,
    x,
    y,
    width: dims.width,
    height: dims.height,
    fill: color,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
  };
  const cornerRadius = DEFAULT_CORNER_RADIUS[type];
  return cornerRadius !== undefined ? { ...base, cornerRadius } : base;
};
