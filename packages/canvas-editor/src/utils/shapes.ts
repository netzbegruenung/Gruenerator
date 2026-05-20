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
  | 'line-arrow'
  | 'speech-cloud'
  | 'speech-pointed'
  | 'cloud-fluffy'
  | 'cloud-puff'
  | 'cloud-thin'
  | 'heart-broken'
  | 'heart-double'
  | 'heart-arrow'
  | 'drop'
  | 'drop-pin'
  | 'drop-tear'
  | 'drop-flame'
  | 'banner-ribbon'
  | 'banner-flag'
  | 'banner-tag'
  | 'banner-scroll'
  | 'gear'
  | 'gear-12'
  | 'gear-6'
  | 'gear-fine'
  | 'asterisk'
  | 'star-burst'
  | 'flower'
  | 'flower-8'
  | 'blob-2'
  | 'tree'
  | 'mountain'
  | 'sun'
  | 'plus'
  | 'minus'
  | 'x-mark'
  | 'arrow-curved';

/**
 * Display category for the Formen palette. Each shape belongs to exactly one
 * category — the FormenSection groups by this field at render time and emits
 * a German-labeled subheader per category.
 */
export type ShapeCategory =
  | 'basic'
  | 'polygons'
  | 'arrows'
  | 'lines'
  | 'stars'
  | 'speech'
  | 'clouds'
  | 'hearts'
  | 'drops'
  | 'banners'
  | 'gears'
  | 'organic'
  | 'symbols'
  | 'nature';

export interface ShapeDef<T extends ShapeType = ShapeType> {
  id: T;
  name: string;
  tags: readonly string[];
  category: ShapeCategory;
}

/**
 * Source of truth for shape metadata. Typed as `{ [K in ShapeType]: ShapeDef<K> }`
 * so adding a new ShapeType without registering it here is a compile error.
 * Each entry's `id` is bound to its key — `rect: { id: 'circle', ... }` won't
 * compile. Object key insertion order is the search-result order.
 */
const SHAPE_DEFS: { readonly [K in ShapeType]: ShapeDef<K> } = {
  rect: {
    id: 'rect',
    name: 'Rechteck',
    tags: ['rechteck', 'rectangle', 'quadrat', 'square', 'box', 'kasten'],
    category: 'basic',
  },
  'rounded-rect': {
    id: 'rounded-rect',
    name: 'Abgerundetes Rechteck',
    tags: ['abgerundet', 'rounded', 'rechteck', 'rectangle', 'pille', 'pill', 'soft'],
    category: 'basic',
  },
  circle: {
    id: 'circle',
    name: 'Kreis',
    tags: ['kreis', 'circle', 'rund', 'round', 'punkt', 'dot'],
    category: 'basic',
  },
  ellipse: {
    id: 'ellipse',
    name: 'Ellipse',
    tags: ['ellipse', 'oval', 'eierform', 'lang'],
    category: 'basic',
  },
  ring: {
    id: 'ring',
    name: 'Ring',
    tags: ['ring', 'donut', 'donat', 'kranz', 'kreis', 'rahmen'],
    category: 'basic',
  },
  triangle: {
    id: 'triangle',
    name: 'Dreieck',
    tags: ['dreieck', 'triangle', 'spitz', 'pyramide'],
    category: 'polygons',
  },
  diamond: {
    id: 'diamond',
    name: 'Raute',
    tags: ['raute', 'diamond', 'rhombus', 'karo', 'fokus'],
    category: 'polygons',
  },
  pentagon: {
    id: 'pentagon',
    name: 'Fünfeck',
    tags: ['fuenfeck', 'fünfeck', 'pentagon', 'fuenf', 'fünf'],
    category: 'polygons',
  },
  hexagon: {
    id: 'hexagon',
    name: 'Sechseck',
    tags: ['sechseck', 'hexagon', 'wabe', 'badge', 'sechs'],
    category: 'polygons',
  },
  arrow: {
    id: 'arrow',
    name: 'Pfeil',
    tags: ['pfeil', 'arrow', 'richtung', 'zeiger', 'hinweis'],
    category: 'arrows',
  },
  chevron: {
    id: 'chevron',
    name: 'Chevron',
    tags: ['chevron', 'pfeilspitze', 'spitze', 'pfeil', 'weiter', 'next'],
    category: 'arrows',
  },
  'double-arrow': {
    id: 'double-arrow',
    name: 'Doppelpfeil',
    tags: ['doppelpfeil', 'double', 'arrow', 'beidseitig', 'vergleich', 'versus'],
    category: 'arrows',
  },
  'arrow-curved': {
    id: 'arrow-curved',
    name: 'Geschwungener Pfeil',
    tags: ['pfeil', 'arrow', 'curved', 'geschwungen', 'bogen', 'rueckkehr'],
    category: 'arrows',
  },
  line: {
    id: 'line',
    name: 'Linie',
    tags: ['linie', 'line', 'strich', 'trenner', 'divider', 'duenn', 'dünn'],
    category: 'lines',
  },
  'line-thick': {
    id: 'line-thick',
    name: 'Dicke Linie',
    tags: ['dicke', 'thick', 'linie', 'line', 'balken', 'fett', 'bold'],
    category: 'lines',
  },
  'line-dashed': {
    id: 'line-dashed',
    name: 'Gestrichelte Linie',
    tags: ['gestrichelt', 'dashed', 'linie', 'line', 'strich', 'unterbrochen'],
    category: 'lines',
  },
  'line-dotted': {
    id: 'line-dotted',
    name: 'Gepunktete Linie',
    tags: ['gepunktet', 'dotted', 'linie', 'line', 'punkte', 'dots'],
    category: 'lines',
  },
  'line-double': {
    id: 'line-double',
    name: 'Doppellinie',
    tags: ['doppellinie', 'double', 'linie', 'line', 'zwei', 'parallel'],
    category: 'lines',
  },
  'line-arrow': {
    id: 'line-arrow',
    name: 'Linie mit Pfeil',
    tags: ['pfeillinie', 'pfeil', 'arrow', 'linie', 'line', 'richtung'],
    category: 'lines',
  },
  wavy: {
    id: 'wavy',
    name: 'Wellenlinie',
    tags: ['welle', 'wave', 'wellenlinie', 'linie', 'trenner', 'divider'],
    category: 'lines',
  },
  star: {
    id: 'star',
    name: 'Stern',
    tags: ['stern', 'star', 'sterne'],
    category: 'stars',
  },
  sparkle: {
    id: 'sparkle',
    name: 'Funkeln',
    tags: ['funkeln', 'sparkle', 'glanz', 'glitzern', 'magie', 'twinkle'],
    category: 'stars',
  },
  asterisk: {
    id: 'asterisk',
    name: 'Asterisk',
    tags: ['asterisk', 'sternchen', 'stern', 'sechs', 'arme', 'quadratischer stern'],
    category: 'stars',
  },
  'star-burst': {
    id: 'star-burst',
    name: 'Sternenexplosion',
    tags: ['sternenexplosion', 'starburst', 'explosion', 'stern', 'strahlen'],
    category: 'stars',
  },
  'speech-round': {
    id: 'speech-round',
    name: 'Sprechblase',
    tags: ['sprechblase', 'speech', 'bubble', 'zitat', 'quote', 'sagen', 'rund'],
    category: 'speech',
  },
  'speech-rect': {
    id: 'speech-rect',
    name: 'Sprechblase eckig',
    tags: ['sprechblase', 'speech', 'bubble', 'zitat', 'quote', 'eckig', 'rectangle'],
    category: 'speech',
  },
  'speech-cloud': {
    id: 'speech-cloud',
    name: 'Denkblase',
    tags: ['denkblase', 'thought', 'bubble', 'wolke', 'denken', 'idee'],
    category: 'speech',
  },
  'speech-pointed': {
    id: 'speech-pointed',
    name: 'Spitze Sprechblase',
    tags: ['sprechblase', 'speech', 'spitz', 'pointed', 'tag', 'banner'],
    category: 'speech',
  },
  cloud: {
    id: 'cloud',
    name: 'Wolke',
    tags: ['wolke', 'cloud', 'himmel', 'sky', 'wetter'],
    category: 'clouds',
  },
  'cloud-fluffy': {
    id: 'cloud-fluffy',
    name: 'Flauschige Wolke',
    tags: ['wolke', 'cloud', 'flauschig', 'fluffy', 'rund'],
    category: 'clouds',
  },
  'cloud-puff': {
    id: 'cloud-puff',
    name: 'Wölkchen',
    tags: ['woelkchen', 'wölkchen', 'cloud', 'klein', 'puff', 'mini'],
    category: 'clouds',
  },
  'cloud-thin': {
    id: 'cloud-thin',
    name: 'Schwaden',
    tags: ['schwaden', 'cloud', 'flach', 'thin', 'stratus', 'lang'],
    category: 'clouds',
  },
  heart: {
    id: 'heart',
    name: 'Herz',
    tags: ['herz', 'heart', 'liebe', 'love', 'romantik'],
    category: 'hearts',
  },
  'heart-broken': {
    id: 'heart-broken',
    name: 'Gebrochenes Herz',
    tags: ['herz', 'heart', 'gebrochen', 'broken', 'liebeskummer'],
    category: 'hearts',
  },
  'heart-double': {
    id: 'heart-double',
    name: 'Doppeltes Herz',
    tags: ['herz', 'heart', 'doppel', 'double', 'zwei', 'paar'],
    category: 'hearts',
  },
  'heart-arrow': {
    id: 'heart-arrow',
    name: 'Herz mit Pfeil',
    tags: ['herz', 'heart', 'pfeil', 'arrow', 'amor', 'cupid', 'liebe'],
    category: 'hearts',
  },
  drop: {
    id: 'drop',
    name: 'Tropfen',
    tags: ['tropfen', 'drop', 'tear', 'träne', 'wasser', 'water'],
    category: 'drops',
  },
  'drop-pin': {
    id: 'drop-pin',
    name: 'Stecknadel',
    tags: ['stecknadel', 'pin', 'map', 'standort', 'location', 'marker'],
    category: 'drops',
  },
  'drop-tear': {
    id: 'drop-tear',
    name: 'Träne',
    tags: ['träne', 'traene', 'tear', 'tropfen', 'klein'],
    category: 'drops',
  },
  'drop-flame': {
    id: 'drop-flame',
    name: 'Flamme',
    tags: ['flamme', 'flame', 'feuer', 'fire', 'heiß', 'heiss'],
    category: 'drops',
  },
  'banner-ribbon': {
    id: 'banner-ribbon',
    name: 'Banner',
    tags: ['banner', 'ribbon', 'fahne', 'titel', 'header'],
    category: 'banners',
  },
  'banner-flag': {
    id: 'banner-flag',
    name: 'Wimpel',
    tags: ['wimpel', 'flag', 'fahne', 'banner', 'pennant'],
    category: 'banners',
  },
  'banner-tag': {
    id: 'banner-tag',
    name: 'Etikett',
    tags: ['etikett', 'tag', 'label', 'preis', 'banner'],
    category: 'banners',
  },
  'banner-scroll': {
    id: 'banner-scroll',
    name: 'Schriftrolle',
    tags: ['schriftrolle', 'scroll', 'banner', 'rolle', 'titel'],
    category: 'banners',
  },
  gear: {
    id: 'gear',
    name: 'Zahnrad',
    tags: ['zahnrad', 'gear', 'cog', 'einstellungen', 'settings', 'mechanik'],
    category: 'gears',
  },
  'gear-12': {
    id: 'gear-12',
    name: 'Zahnrad fein',
    tags: ['zahnrad', 'gear', 'cog', 'fein', 'zwoelf', 'mechanik'],
    category: 'gears',
  },
  'gear-6': {
    id: 'gear-6',
    name: 'Zahnrad grob',
    tags: ['zahnrad', 'gear', 'cog', 'grob', 'sechs', 'einfach'],
    category: 'gears',
  },
  'gear-fine': {
    id: 'gear-fine',
    name: 'Zahnrad feinverzahnt',
    tags: ['zahnrad', 'gear', 'cog', 'feinverzahnt', 'praezise', 'mechanik'],
    category: 'gears',
  },
  blob: {
    id: 'blob',
    name: 'Blob',
    tags: ['blob', 'organisch', 'klecks', 'form', 'modern', 'fluid', 'abstrakt'],
    category: 'organic',
  },
  flower: {
    id: 'flower',
    name: 'Blume',
    tags: ['blume', 'flower', 'blüte', 'organisch', 'natur', 'sechs'],
    category: 'organic',
  },
  'flower-8': {
    id: 'flower-8',
    name: 'Blüte',
    tags: ['blüte', 'bluete', 'flower', 'acht', 'blume', 'gross'],
    category: 'organic',
  },
  'blob-2': {
    id: 'blob-2',
    name: 'Blob 2',
    tags: ['blob', 'organisch', 'klecks', 'rund', 'fluid', 'abstrakt'],
    category: 'organic',
  },
  leaf: {
    id: 'leaf',
    name: 'Blatt',
    tags: ['blatt', 'leaf', 'natur', 'nature', 'grün', 'gruen', 'pflanze', 'oeko'],
    category: 'nature',
  },
  tree: {
    id: 'tree',
    name: 'Baum',
    tags: ['baum', 'tree', 'natur', 'wald', 'pflanze'],
    category: 'nature',
  },
  mountain: {
    id: 'mountain',
    name: 'Berg',
    tags: ['berg', 'mountain', 'gipfel', 'natur', 'landschaft'],
    category: 'nature',
  },
  sun: {
    id: 'sun',
    name: 'Sonne',
    tags: ['sonne', 'sun', 'strahlen', 'natur', 'sommer', 'wetter'],
    category: 'nature',
  },
  checkmark: {
    id: 'checkmark',
    name: 'Häkchen',
    tags: ['haekchen', 'häkchen', 'check', 'checkmark', 'ja', 'erledigt', 'tick', 'ok'],
    category: 'symbols',
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    tags: ['plus', 'mehr', 'add', 'kreuz'],
    category: 'symbols',
  },
  minus: {
    id: 'minus',
    name: 'Minus',
    tags: ['minus', 'weniger', 'remove', 'subtract', 'strich'],
    category: 'symbols',
  },
  'x-mark': {
    id: 'x-mark',
    name: 'Kreuz',
    tags: ['kreuz', 'cross', 'x', 'nein', 'no', 'close', 'schliessen'],
    category: 'symbols',
  },
};

export const ALL_SHAPES: ReadonlyArray<ShapeDef> = Object.values(SHAPE_DEFS);
export const getShapeDef = <T extends ShapeType>(type: T): ShapeDef<T> => SHAPE_DEFS[type];

/**
 * German display labels for shape categories. Used for FormenSection subheaders.
 * Order is the display order (top-to-bottom in the panel).
 */
export const CATEGORY_ORDER: readonly ShapeCategory[] = [
  'basic',
  'polygons',
  'arrows',
  'lines',
  'stars',
  'speech',
  'clouds',
  'hearts',
  'drops',
  'banners',
  'gears',
  'organic',
  'nature',
  'symbols',
];

export const CATEGORY_LABELS: Record<ShapeCategory, string> = {
  basic: 'Grundformen',
  polygons: 'Vielecke',
  arrows: 'Pfeile',
  lines: 'Linien',
  stars: 'Sterne',
  speech: 'Sprechblasen',
  clouds: 'Wolken',
  hearts: 'Herzen',
  drops: 'Tropfen',
  banners: 'Banner',
  gears: 'Zahnräder',
  organic: 'Organische Formen',
  nature: 'Natur',
  symbols: 'Symbole',
};

/**
 * Exhaustiveness assertion. Use as the `default` case of a switch on a discriminated
 * union — adding a new union variant without handling it becomes a compile error.
 */
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

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
  'speech-cloud': { width: 320, height: 260 },
  'speech-pointed': { width: 320, height: 220 },
  wavy: { width: 320, height: 80 },
  'double-arrow': { width: 320, height: 120 },
  chevron: { width: 200, height: 240 },
  leaf: { width: 240, height: 300 },
  drop: { width: 220, height: 300 },
  'drop-pin': { width: 220, height: 320 },
  'drop-tear': { width: 200, height: 280 },
  'drop-flame': { width: 220, height: 300 },
  'banner-ribbon': { width: 360, height: 160 },
  'banner-flag': { width: 360, height: 240 },
  'banner-tag': { width: 360, height: 200 },
  'banner-scroll': { width: 360, height: 180 },
  'heart-double': { width: 360, height: 220 },
  'heart-arrow': { width: 360, height: 280 },
  'cloud-puff': { width: 280, height: 200 },
  'cloud-thin': { width: 360, height: 160 },
  tree: { width: 240, height: 320 },
  mountain: { width: 360, height: 240 },
  'arrow-curved': { width: 320, height: 260 },
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
  const dims = DEFAULT_DIMENSIONS[type] ?? {
    width: DEFAULT_SHAPE_SIZE,
    height: DEFAULT_SHAPE_SIZE,
  };
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
