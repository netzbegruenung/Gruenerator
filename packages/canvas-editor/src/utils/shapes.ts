export type ShapeType = 'rect' | 'circle' | 'triangle' | 'star' | 'arrow' | 'heart' | 'cloud';

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

export const createShape = (
  type: ShapeType,
  x: number,
  y: number,
  color: string
): ShapeInstance => {
  return {
    id: `shape-${Date.now()}`,
    type,
    x,
    y,
    width: DEFAULT_SHAPE_SIZE,
    height: DEFAULT_SHAPE_SIZE,
    fill: color,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
  };
};
