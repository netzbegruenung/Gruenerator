// SPDX-License-Identifier: MPL-2.0
import { defaultMarkerFill } from './markerColors';

import type { GradientFill } from '@ggraphic/editor/utils/gradientFill';

/**
 * Shapes rendered as strokes (Konva Line/Arrow) with no fill area — a gradient
 * fill has no visible effect on these.
 */
export const STROKE_ONLY_SHAPES: ReadonlySet<string> = new Set([
  'line',
  'line-thick',
  'line-dashed',
  'line-dotted',
  'line-double',
  'line-arrow',
]);

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
  | 'arrow-curved'
  | 'hand-kreis'
  | 'hand-unterstrich'
  | 'hand-pfeil'
  | 'hand-ausruf'
  | 'hand-marker'
  | 'hand-marker-box'
  | 'hand-winken'
  | 'hand-pfeil-schlaufe'
  | 'hand-pfeil-welle'
  | 'hand-pfeil-bogen'
  | 'hand-pfeil-haken'
  | 'hand-pfeil-herz'
  | 'hand-pfeil-spirale';

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
  | 'hand'
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
  'hand-kreis': {
    id: 'hand-kreis',
    name: 'Kringel',
    tags: ['kringel', 'handgezeichnet', 'hand', 'einkreisen', 'kreis', 'circle', 'markieren'],
    category: 'hand',
  },
  'hand-unterstrich': {
    id: 'hand-unterstrich',
    name: 'Unterstrich',
    tags: ['unterstrich', 'unterstreichen', 'handgezeichnet', 'hand', 'pinsel', 'underline'],
    category: 'hand',
  },
  'hand-pfeil': {
    id: 'hand-pfeil',
    name: 'Handpfeil',
    tags: ['pfeil', 'arrow', 'handgezeichnet', 'hand', 'geschwungen', 'swoosh', 'weiter'],
    category: 'hand',
  },
  'hand-ausruf': {
    id: 'hand-ausruf',
    name: 'Ausrufstriche',
    tags: ['ausruf', 'striche', 'handgezeichnet', 'hand', 'betonung', 'burst', 'funkeln'],
    category: 'hand',
  },
  'hand-marker': {
    id: 'hand-marker',
    name: 'Textmarker-Strich',
    tags: ['textmarker', 'marker', 'highlight', 'markieren', 'hervorheben', 'pinsel', 'hand'],
    category: 'hand',
  },
  'hand-marker-box': {
    id: 'hand-marker-box',
    name: 'Textmarker-Box',
    tags: ['textmarker', 'marker', 'highlight', 'markieren', 'hervorheben', 'kasten', 'box'],
    category: 'hand',
  },
  'hand-pfeil-schlaufe': {
    id: 'hand-pfeil-schlaufe',
    name: 'Schlaufenpfeil',
    tags: ['pfeil', 'arrow', 'handgezeichnet', 'hand', 'schlaufe', 'kringel', 'loop'],
    category: 'hand',
  },
  'hand-pfeil-welle': {
    id: 'hand-pfeil-welle',
    name: 'Wellenpfeil',
    tags: ['pfeil', 'arrow', 'handgezeichnet', 'hand', 'welle', 'wellig', 'wave'],
    category: 'hand',
  },
  'hand-pfeil-bogen': {
    id: 'hand-pfeil-bogen',
    name: 'Bogenpfeil',
    tags: ['pfeil', 'arrow', 'handgezeichnet', 'hand', 'bogen', 'kurve', 'curve'],
    category: 'hand',
  },
  'hand-pfeil-haken': {
    id: 'hand-pfeil-haken',
    name: 'Hakenpfeil',
    tags: ['pfeil', 'arrow', 'handgezeichnet', 'hand', 'haken', 'kurve', 'hook'],
    category: 'hand',
  },
  'hand-pfeil-herz': {
    id: 'hand-pfeil-herz',
    name: 'Herzpfeil',
    tags: ['pfeil', 'arrow', 'handgezeichnet', 'hand', 'herz', 'liebe', 'heart'],
    category: 'hand',
  },
  'hand-pfeil-spirale': {
    id: 'hand-pfeil-spirale',
    name: 'Kringelpfeil',
    tags: ['pfeil', 'arrow', 'handgezeichnet', 'hand', 'kringel', 'spirale', 'curl'],
    category: 'hand',
  },
  'hand-winken': {
    id: 'hand-winken',
    name: 'Winkende Hand',
    tags: ['winken', 'hand', 'hallo', 'gruss', 'handgezeichnet', 'wave'],
    category: 'hand',
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
  'hand',
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
  hand: 'Handgezeichnet',
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
  /** Canvas px a composer card grew with its text (cardFollowsText); not a hand resize. */
  textGrowth?: number;
  strokeWidth?: number;
  dash?: number[];
  /** Drop shadow (Konva shadow* props); omit for no shadow. */
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  /** Linear gradient fill; when set, overrides `fill`. */
  fillGradient?: GradientFill | null;
  /** Blends the fill into what lies beneath (Konva `globalCompositeOperation`); omit for normal. */
  blendMode?: ShapeBlendMode;
  /** Mirrored about the centre (negative node scale); omit for upright. */
  flipX?: boolean;
  flipY?: boolean;
}

/**
 * The composer's background planes (gradient, colour panel beside a photo
 * strip, contrast scrim, AT strip tint): ordinary shapes, the ids only name
 * their role for the colour pick, page inheritance and provenance. Canvases
 * composed 07.–15.10.2026 still carry a `locked: true` that nothing reads any
 * more — a lock the user can set needs a key of its own.
 */
export const COMPOSER_PLANE_IDS: readonly string[] = ['sc-bg', 'sc-panel', 'sc-scrim', 'sc-tint'];

/**
 * The photo strip beside the composer's colour panel (`foto-oben` /
 * `foto-unten`): the full-width part of the page the panel leaves free. The
 * background photo is cover-fitted into it, so it pans inside the strip
 * instead of sliding under the panel. Null when there is no such panel, or it
 * no longer spans the page's width from one edge.
 */
export function photoStripBeside(
  shapes: readonly ShapeInstance[] | null | undefined,
  page: { width: number; height: number }
): { x: number; y: number; width: number; height: number } | null {
  const panel = shapes?.find((s) => s.id === 'sc-panel');
  if (!panel || panel.type !== 'rect' || panel.rotation) return null;
  const width = panel.width * (panel.scaleX ?? 1);
  const height = panel.height * (panel.scaleY ?? 1);
  const near = (a: number, b: number) => Math.abs(a - b) < 1;
  if (!near(panel.x - width / 2, 0) || !near(width, page.width)) return null;
  const top = panel.y - height / 2;
  const bottom = panel.y + height / 2;
  if (near(top, 0) && bottom < page.height - 1) {
    return { x: 0, y: bottom, width: page.width, height: page.height - bottom };
  }
  if (near(bottom, page.height) && top > 1) return { x: 0, y: 0, width: page.width, height: top };
  return null;
}

/** Any colour plane the composer lays under the text, the header band and comparison columns included. */
export function isComposerPlane(id: string): boolean {
  return COMPOSER_PLANE_IDS.includes(id) || id === 'sc-kopfband' || id.endsWith('-flaeche');
}

/** `color`: hue and saturation of the fill, brightness of what lies beneath — a duotone. */
export type ShapeBlendMode = 'color';

/** Eucalyptus (--secondary-600), used as the default neutral color for line variants. */
export const EUCALYPTUS = '#5F8575';

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
  'hand-kreis': { width: 340, height: 140 },
  'hand-unterstrich': { width: 360, height: 30 },
  'hand-pfeil': { width: 300, height: 150 },
  'hand-ausruf': { width: 110, height: 110 },
  'hand-marker': { width: 420, height: 80 },
  'hand-marker-box': { width: 420, height: 90 },
  'hand-winken': { width: 160, height: 160 },
  'hand-pfeil-schlaufe': { width: 300, height: 80 },
  'hand-pfeil-welle': { width: 300, height: 64 },
  'hand-pfeil-bogen': { width: 300, height: 64 },
  'hand-pfeil-haken': { width: 260, height: 82 },
  'hand-pfeil-herz': { width: 340, height: 95 },
  'hand-pfeil-spirale': { width: 320, height: 72 },
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
  'hand-kreis': 7,
  'hand-unterstrich': 12,
  'hand-pfeil': 12,
  'hand-ausruf': 10,
  'hand-winken': 9,
  'hand-pfeil-schlaufe': 9,
  'hand-pfeil-welle': 9,
  'hand-pfeil-bogen': 11,
  'hand-pfeil-haken': 11,
  'hand-pfeil-herz': 9,
  'hand-pfeil-spirale': 9,
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

/** Shapes that start in the brand's first marker colour. */
const MARKER_SHAPES: ReadonlySet<ShapeType> = new Set(['hand-marker', 'hand-marker-box']);

export const createShape = (
  type: ShapeType,
  x: number,
  y: number,
  color: string,
  explicitColor?: string
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
    fill:
      explicitColor ??
      (MARKER_SHAPES.has(type) ? defaultMarkerFill() : DEFAULT_FILL_OVERRIDE[type]) ??
      color,
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
