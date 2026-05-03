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
  | 'leaf'
  | 'line'
  | 'line-thick'
  | 'line-dashed'
  | 'line-dotted'
  | 'line-double'
  | 'line-arrow';

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
  {
    id: 'line',
    name: 'Linie',
    tags: ['linie', 'line', 'strich', 'trenner', 'divider', 'duenn', 'dünn'],
  },
  {
    id: 'line-thick',
    name: 'Dicke Linie',
    tags: ['dicke', 'thick', 'linie', 'line', 'balken', 'fett', 'bold'],
  },
  {
    id: 'line-dashed',
    name: 'Gestrichelte Linie',
    tags: ['gestrichelt', 'dashed', 'linie', 'line', 'strich', 'unterbrochen'],
  },
  {
    id: 'line-dotted',
    name: 'Gepunktete Linie',
    tags: ['gepunktet', 'dotted', 'linie', 'line', 'punkte', 'dots'],
  },
  {
    id: 'line-double',
    name: 'Doppellinie',
    tags: ['doppellinie', 'double', 'linie', 'line', 'zwei', 'parallel'],
  },
  {
    id: 'line-arrow',
    name: 'Linie mit Pfeil',
    tags: ['pfeillinie', 'pfeil', 'arrow', 'linie', 'line', 'richtung'],
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
  strokeWidth?: number;
  dash?: number[];
}

/** Eucalyptus (--secondary-600), used as the default neutral color for line variants. */
export const EUCALYPTUS = '#5F8575';

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
  line: { width: 360, height: 24 },
  'line-thick': { width: 360, height: 32 },
  'line-dashed': { width: 360, height: 24 },
  'line-dotted': { width: 360, height: 24 },
  'line-double': { width: 360, height: 32 },
  'line-arrow': { width: 360, height: 32 },
};

const DEFAULT_CORNER_RADIUS: Partial<Record<ShapeType, number>> = {
  'rounded-rect': 32,
};

const DEFAULT_STROKE_WIDTH: Partial<Record<ShapeType, number>> = {
  line: 6,
  'line-thick': 18,
  'line-dashed': 6,
  'line-dotted': 6,
  'line-double': 6,
  'line-arrow': 6,
};

const DEFAULT_DASH: Partial<Record<ShapeType, number[]>> = {
  'line-dashed': [22, 14],
  'line-dotted': [0.1, 14],
};

const DEFAULT_FILL_OVERRIDE: Partial<Record<ShapeType, string>> = {
  line: EUCALYPTUS,
  'line-thick': EUCALYPTUS,
  'line-dashed': EUCALYPTUS,
  'line-dotted': EUCALYPTUS,
  'line-double': EUCALYPTUS,
  'line-arrow': EUCALYPTUS,
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
    fill: DEFAULT_FILL_OVERRIDE[type] ?? color,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
  };
  const overrides: Partial<ShapeInstance> = {};
  const cornerRadius = DEFAULT_CORNER_RADIUS[type];
  if (cornerRadius !== undefined) overrides.cornerRadius = cornerRadius;
  const strokeWidth = DEFAULT_STROKE_WIDTH[type];
  if (strokeWidth !== undefined) overrides.strokeWidth = strokeWidth;
  const dash = DEFAULT_DASH[type];
  if (dash !== undefined) overrides.dash = dash;
  return { ...base, ...overrides };
};
