export type ShapeType = 'rect' | 'circle' | 'triangle' | 'star' | 'arrow' | 'heart' | 'cloud';

export interface ShapeDef {
    id: ShapeType;
    name: string;
    tags: string[];
}

export const ALL_SHAPES: ShapeDef[] = [
    { id: 'rect', name: 'Rechteck', tags: ['rechteck', 'rectangle', 'quadrat', 'square', 'box', 'kasten'] },
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
    { id: 'primary', name: 'Grün', value: '#316049' }, // --primary-600
    { id: 'secondary', name: 'Eukalyptus', value: '#5F8575' }, // --secondary-600
    { id: 'sand', name: 'Sand', value: '#F5F1E9' }, // --neutral-600
    { id: 'white', name: 'Weiß', value: '#FFFFFF' }, // --white
    { id: 'black', name: 'Schwarz', value: '#000000' }, // --black
    { id: 'dark-green', name: 'Dunkelgrün', value: '#1F3F33' }, // --primary-800
];

export const DEFAULT_SHAPE_SIZE = 300;

export const createShape = (type: ShapeType, x: number, y: number, color: string): ShapeInstance => {
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
