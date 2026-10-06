/**
 * Sharepic spec → freeform canvas pages, one per slide.
 *
 * The free-text creator's model writes, per slide, ONE text group (kicker,
 * headline, paragraphs, text, quote, list, button) plus a background and a few
 * extras; this turns it into the element collections a person builds by hand
 * in the freeform editor, so the draft stays fully editable. The look follows
 * the parties' current Instagram posts (analysed 10/2026): one compact text
 * block, a headline that fills the width in sentence case, one accent, no flat
 * backgrounds, built contrast on photos. Carousels add what their slides share:
 * a "swipe on" arrow on every slide but the last, DE line boxes on photos.
 *
 * Pure: no React, no Konva. Text is measured through the injected `measure`.
 */
import {
  accentLines,
  foldMarkerIntoAccent,
  layoutRichTextBlock,
  type MeasureRun,
  type SharepicColor,
  type SharepicCreatorLocale,
  type SharepicChartKind,
  type SharepicFormat,
  type SharepicItem,
  type SharepicPhotoAttribution,
  type SharepicSeitenzahl,
  type SharepicSlide,
  type KiLabelMode,
  type SharepicSpec,
  type SharepicTextSide,
} from '@gruenerator/contracts';

import { getBrandTheme } from '../brand/theme';
import { DEFAULT_FORMAT_ID, getCanvasFormatOrDefault, type CanvasFormat } from '../formats';
import { ASSET_TARGET_SIZE, type AssetInstance } from '../utils/canvasAssets';
import { createChartInstance, type ChartInstance, type ChartType } from '../utils/chartUtils';
import { createCircleBadgeInstance } from '../utils/circleBadgeUtils';
import { COLORS } from '../utils/dreizeilenLayout';
import { createPillBadgeInstance } from '../utils/pillBadgeUtils';
import { createShape, type ShapeInstance } from '../utils/shapes';
import {
  measureTextWidthWithFont,
  runFont,
  type TextAccent,
  type TextMarker,
} from '../utils/textUtils';
import { VERANSTALTUNG_CONFIG } from '../utils/veranstaltungLayout';

import { SHAREPIC_ICON_FILLED, SHAREPIC_ICON_IDS, VERGLEICH_MARKER_IDS } from './sharepicIcons';

import type { IconState } from '../configs/factory/baseTypes';
import type { AdditionalText } from '../configs/types';
import type { CircleBadgeInstance } from '../utils/circleBadgeUtils';
import type { PillBadgeInstance } from '../utils/pillBadgeUtils';
import type { UserImageInstance } from '../utils/userImageUtils';

export type MeasureText = (
  text: string,
  fontSize: number,
  fontFamily: string,
  fontStyle: string
) => number;

/** How bright or busy the photo is where the text sits; decides how dense the scrim gets. */
export type PhotoTone = 'dunkel' | 'mittel' | 'hell';

export interface ComposeOptions {
  /** URL the canvas loads a stock photo from. */
  photoSrc: (filename: string) => string;
  /** Photo credit per slide, as the draft returned it. */
  attributions?: (SharepicPhotoAttribution | null)[];
  measure?: MeasureText;
  /** AI notice on every slide, same wording and look as the server-side image label. Default `full`. */
  kiLabel?: KiLabelMode;
  /**
   * Tone of a stock photo on the side the text sits on, measured by the
   * client (the composer stays sync and pure). `null` or absent: `mittel`.
   */
  photoTone?: (filename: string, side: SharepicTextSide) => PhotoTone | null;
}

/** Props for the `freeform` / `freeform-at` config's `createInitialState` — one page. */
export type ComposedSlide = {
  backgroundMode: 'color' | 'image';
  backgroundColor: string;
  currentImageSrc?: string;
  hasBackgroundImage: boolean;
  /** Where the cover-fitted photo sits; absent: the editor's default, centred on the canvas. */
  imageOffset?: { x: number; y: number };
  imageScale?: number;
  imageAttribution: SharepicPhotoAttribution | null;
  additionalTexts: AdditionalText[];
  pillBadgeInstances: PillBadgeInstance[];
  circleBadgeInstances: CircleBadgeInstance[];
  shapeInstances: ShapeInstance[];
  assetInstances: AssetInstance[];
  chartInstances: ChartInstance[];
  /** An infographic's painted illustrations. */
  userImageInstances: UserImageInstance[];
  selectedIcons: string[];
  iconStates: Record<string, IconState>;
  layerOrder: string[];
};

export interface ComposedSharepic {
  templateType: 'freeform' | 'freeform-at';
  /** The canvas format the slides are laid out on. */
  format: SharepicFormat;
  /** One page per slide, in order. */
  slides: ComposedSlide[];
}

/** 6.5 % of the width — the margin the posts use. */
const MARGIN = 70;
const GAP = 30;
const FOOTER = 130;
/**
 * Logo: longer side and gap to the bottom edge, measured on the posts (10/2026).
 * DE: the posts carry the "BÜNDNIS 90/DIE GRÜNEN" word mark bottom-left at the
 * margin; there is no word-mark asset yet, so the sunflower stands in, small.
 * AT: the "G DIE GRÜNEN" logo with claim (1410 × 1239), ~210 px, centred.
 */
const LOGO = {
  'de-DE': { size: 110, height: 110, bottom: 70 },
  'de-AT': { size: 210, height: (210 * 1239) / 1410, bottom: 91 },
} as const;

/**
 * AI label, mirroring `imagine_label_canvas.ts` at 1080 px: PT Sans Bold 27,
 * pill bottom-left. Kept in sync by hand, the API cannot import the editor.
 */
const KI_LABEL = {
  texts: { full: 'KI-Generiert mit dem Grünerator', short: 'KI-Generiert' },
  fontFamily: 'PT Sans',
  fontSize: 27,
  margin: 11,
  paddingX: 16,
  paddingY: 9,
  radius: 8,
  gap: 8,
} as const;

export const SHAREPIC_COLOR_HEX: Record<SharepicColor, string> = {
  tanne: COLORS.TANNE,
  dunkeltanne: '#00261A',
  grasgruen: '#00CC4F',
  mint: '#D5EEE6',
  hellgrau: '#F2F2F2',
  dunkelgruen: getBrandTheme('de-AT').colors.primary,
  hellgruen: getBrandTheme('de-AT').colors.secondary,
  weiss: '#FFFFFF',
};

/** Dark greens get a gradient; the rest stays flat, as the posts are. */
const GRADIENTS: Partial<Record<SharepicColor, { angle: number; stops: string[] }>> = {
  tanne: { angle: 60, stops: ['#00261A', '#005538', '#0A7A3F'] },
  dunkeltanne: { angle: 60, stops: ['#00140D', '#00261A', '#005538'] },
  // Grass green has none: measured flat on @die_gruenen (#01CF51 edge to edge).
  // Measured on @diegruenen carousels (10/2026, median over text-free patches):
  // a deep, slightly bluish green, darker at the top, only a little lighter
  // below — no slide into yellow-green.
  dunkelgruen: { angle: 90, stops: ['#0B6620', '#1D7A35', '#23803B'] },
  hellgruen: { angle: 60, stops: ['#3F9A2A', '#56af31', '#7CC650'] },
};

/**
 * Scrim alpha under the text, per photo tone — capped at `SCRIM_MAX`: the posts
 * keep the photo bright and carry the text with a shadow, not a curtain.
 */
const SCRIM_TEXT_ALPHA: Record<PhotoTone, number> = { dunkel: 0.4, mittel: 0.48, hell: 0.55 };
export const SCRIM_MAX = 0.55;
/** The scrim covers at least this share of the photo from the text edge… */
const SCRIM_MIN_DEPTH = 0.42;
/** …and fades over this share beyond the dense band. */
const SCRIM_FADE = 0.15;
/** DE: a very dark Tanne (#06251A); AT stays neutral-dark. */
const SCRIM_DARK: Record<SharepicCreatorLocale, string> = { 'de-DE': '6,37,26', 'de-AT': '3,14,8' };
/** Dense scrim reaches this far past the text before it fades. */
const SCRIM_GUTTER = 48;
/** Stops of the scrim's fade, as fractions of its length. */
const SCRIM_EASE = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

/** Gradient angle per side: offset 0 on the picture side. */
const SCRIM_ANGLE: Record<SharepicTextSide, number> = {
  unten: 90,
  oben: 270,
  links: 180,
  rechts: 0,
};

const LIGHT: readonly SharepicColor[] = ['mint', 'hellgrau', 'weiss'];

/** DE accent: a lime marker box. AT accent: a yellow Vollkorn line. */
const LIME = '#BEFF60';
/** DE accent words on light ground — lime would vanish there. */
const KLEE = '#008939';

const CHART_TYPE: Record<SharepicChartKind, ChartType> = {
  balken: 'bar',
  'balken-quer': 'bar-horizontal',
  linie: 'line',
  kreis: 'pie',
  donut: 'donut',
};
/**
 * Chart series on the white card, strongest first, one colour per part of a
 * pie (the spec allows five). Light ones (DE grass green and lime, AT yellow)
 * never open the list: on white they only read next to a dark green.
 */
const CHART_PALETTE: Record<SharepicCreatorLocale, string[]> = {
  'de-DE': ['#00261A', KLEE, '#00CC4F', '#005538', LIME],
  'de-AT': [
    getBrandTheme('de-AT').colors.primary,
    getBrandTheme('de-AT').colors.secondary,
    getBrandTheme('de-AT').colors.accent,
    '#0B6620',
    '#7CC650',
  ],
};
/** The share a pie's values leave to 100 %. */
const CHART_REST = '#C8C8C7';
/**
 * The chart renders at half size and is scaled up, so its labels (13 px in
 * the editor's chart renderer) read at 26 px on the 1080 px canvas.
 */
const CHART_SCALE = 2;
const CHART_MIN_HEIGHT = 240;

/** The DE "swipe on" arrow — an icon from the editor's own sets, so it stays swappable. */
const ARROW_ICON = 'tabler:arrow-narrow-right';
/** The AT one is the posts' brush stroke: white, green on light ground. */
const BRUSH_ARROW = { onDark: 'brush-arrow-weiss', onLight: 'brush-arrow-gruen' } as const;
/**
 * Arrow box and its gap to the right edge, measured on the posts: DE a
 * small arrow ~22 px from the corner, AT a long stroke ~280 px wide, ~40 px in.
 * The drawn arrow is narrower than its box (DE ≈ 0.64, AT ≈ 0.8).
 */
const ARROW = {
  'de-DE': { size: 42, right: 22, bottom: 22, glyph: 0.64 },
  'de-AT': { size: 350, right: 40, bottom: 60, glyph: 0.8 },
} as const;
/** Headline: widest line at this share of its column, up to `HEADLINE_MAX` px. */
const HEADLINE_FILL = 0.95;
const HEADLINE_MAX = 230;
const HEADLINE_WITH_CARD = 130;
const CARD_ITEMS: readonly SharepicItem['type'][] = [
  'liste',
  'diagramm',
  'iconliste',
  'vergleich',
  'faktencheck',
  'infografik',
];
/**
 * The smallest quantity's side, as a share of the largest one's. Area-true
 * below this the object turns into a speck nobody recognises (4 kg against
 * 85 kg); the figure under it still says the truth.
 */
const MENGEN_MIN_SIDE = 0.32;
/** Air between two figures side by side, so "3,1 Mio. t 1,3 Mio. t" never reads as one. */
const CAPTION_GUTTER = 48;
/** Gap between two pictogram units, as a share of a unit; how strongly the outlines of the units not counted show. */
const ANTEIL_GAP = 0.18;
const ANTEIL_REST_OPACITY = 0.8;
/** Air between two quantity illustrations, and the largest one's side at scale 1. */
const MENGEN_ART_GAP = 32;
const MENGEN_MAX_ART = 440;
/** A cover headline alone on a colour: larger, filling up to this share of the height. */
const HEADLINE_COVER_MAX = 260;
const COVER_SHARE = 0.6;
const QUOTE_ALONE_MAX = 120;
/** Paragraphs stay at most this share of the headline size. */
const HEADLINE_RATIO = 1.8;
/** Top padding of a block that starts at the canvas top, measured on the posts. */
const TOP_PAD: Record<SharepicCreatorLocale, number> = { 'de-DE': 110, 'de-AT': 120 };
/** AT centred text: ~100 px side margins on the argument slides. */
const AT_CENTRED_MARGIN = 100;
/** Date circle on a colour or photo slide: free in the bottom-right corner. */
const DATE_CIRCLE = { radius: 170, right: 40, bottom: 50 } as const;

const defaultMeasure: MeasureText = (text, fontSize, fontFamily, fontStyle) =>
  measureTextWidthWithFont(text, fontSize, fontFamily, fontStyle);

/** Greedy word wrap; a single over-long word keeps its own line. */
export function wrapWords(
  text: string,
  width: number,
  measureLine: (line: string) => number
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && measureLine(candidate) > width) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/**
 * Same line count as a greedy wrap, but at the narrowest width that keeps it —
 * so a box never ends on a lone word ("Mutter. Jeden / Tag.").
 */
export function balancedWrap(
  text: string,
  width: number,
  measureLine: (line: string) => number
): string[] {
  const lines = wrapWords(text, width, measureLine);
  if (lines.length < 2) return lines;
  let low = 0;
  let high = width;
  for (let step = 0; step < 12; step++) {
    const mid = (low + high) / 2;
    if (wrapWords(text, mid, measureLine).length > lines.length) low = mid;
    else high = mid;
  }
  return wrapWords(text, high, measureLine);
}

/**
 * Largest size <= `size` at which every word of `texts` (plus `indent`) fits
 * `width` — the editor's wrap breaks a word that does not fit mid-letter.
 * Measured bold, the widest face a mark can switch to.
 */
export function largestSizeWordsFit(
  texts: string[],
  size: number,
  width: number,
  indent: number,
  measureWord: (word: string, size: number) => number,
  minSize = 24
): number {
  const words = texts
    .join(' ')
    .replace(/\*\*|__|==|\+\+|\*/g, '')
    .split(/\s+/)
    .filter(Boolean);
  let fitted = size;
  while (fitted > minSize && words.some((w) => indent + measureWord(w, fitted) > width)) fitted--;
  return fitted;
}

/** Distance between Störer lines, as a share of the font size. */
const STOERER_LINE_STEP = 1.1;
/** The DE design guide keeps 10 % of the Störer free around its text. */
const STOERER_TEXT_SHARE = 0.9;
/** Largest Störer type as a share of the radius (88 px at 125). */
const STOERER_MAX_SIZE_SHARE = 0.7;
/** Smallest Störer type that still reads at feed size (on 1080 px). */
const STOERER_MIN_READABLE = 32;
/** DE Störer sizes, largest first; the largest holds any 28-character text. */
const STOERER_RADII = [175, 165, 155, 145, 135, 125, 115, 105, 95];

/**
 * DE Störer text: the largest size at which some wrap of the text fits,
 * corner to corner, inside 90 % of the circle. Each line counts as a box
 * `size` high, centred on its offset — taller than the glyphs, so the margin
 * only grows.
 */
function fitStoererText(
  text: string,
  radius: number,
  measureLine: (line: string, size: number) => number,
  maxSize: number,
  minSize = 20
): { lines: string[]; size: number } | null {
  const inner = radius * STOERER_TEXT_SHARE;
  const fits = (lines: string[], size: number) =>
    lines.every((line, i) => {
      const edge = Math.abs((i - (lines.length - 1) / 2) * size * STOERER_LINE_STEP) + size / 2;
      return (measureLine(line, size) / 2) ** 2 + edge ** 2 <= inner ** 2;
    });
  for (let size = maxSize; size >= minSize; size--) {
    const measureAt = (l: string) => measureLine(l, size);
    // Narrower wraps trade width for lines; the circle has room for either.
    for (let width = 2 * inner; width >= size; width -= 10) {
      const lines = balancedWrap(text, width, measureAt);
      if (fits(lines, size)) return { lines, size };
    }
  }
  return null;
}

type HeadlineItem = Extract<SharepicItem, { type: 'headline' }>;

/**
 * AT emphasis: Vollkorn Black Italic (CI 2026 p. 22), the `bold italic` face
 * in typography.css — `italic` alone loads Bold Italic.
 */
const AT_EMPHASIS_STYLE = 'bold italic' as const;

const stripMarks = (text: string) => text.replace(/\*\*|__|==|\+\+/g, '');

/** Every string of a slide with `++marker++` read as `==accent==` (AT has no marker boxes). */
function foldMarkers<T>(value: T): T {
  if (typeof value === 'string') return foldMarkerIntoAccent(value) as T;
  if (Array.isArray(value)) return value.map(foldMarkers) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, foldMarkers(v)])) as T;
  }
  return value;
}

interface Column {
  x: number;
  width: number;
  align: 'left' | 'center';
}

interface Placed {
  height: number;
  /** Space after this item. */
  after: number;
  place: (y: number) => void;
}

export function composeSharepic(spec: SharepicSpec, options: ComposeOptions): ComposedSharepic {
  const count = spec.slides.length;
  const format = spec.format ?? DEFAULT_FORMAT_ID;
  const canvas = getCanvasFormatOrDefault(format);
  return {
    templateType: spec.locale === 'de-AT' ? 'freeform-at' : 'freeform',
    format,
    slides: spec.slides.map((slide, index) =>
      composeSlide(
        slide,
        spec.locale,
        canvas,
        options,
        options.attributions?.[index] ?? null,
        index < count - 1 && spec.pfeil !== false,
        count > 1 && spec.seitenzahl ? { index, count, style: spec.seitenzahl } : null
      )
    ),
  };
}

function composeSlide(
  slide: SharepicSlide,
  locale: SharepicCreatorLocale,
  canvas: CanvasFormat,
  options: ComposeOptions,
  attribution: SharepicPhotoAttribution | null,
  /** Not the last slide of a carousel (and arrows on): it gets the "swipe on" arrow. */
  swipeOn: boolean,
  /** Where this slide sits in a numbered carousel. */
  page: { index: number; count: number; style: SharepicSeitenzahl } | null
): ComposedSlide {
  const measure = options.measure ?? defaultMeasure;
  const theme = getBrandTheme(locale);
  const isAt = locale === 'de-AT';
  // The marker box is a DE signature; AT highlights with the yellow Vollkorn
  // accent only, so a `++` that reaches an AT slide is set as `==`.
  const spec = isAt ? foldMarkers(slide) : slide;
  const bg = spec.background;
  const darkText = isAt ? theme.colors.primary : SHAREPIC_COLOR_HEX.dunkeltanne;
  const boxed = !isAt && !!spec.zeilenboxen;
  const quoteSlide = spec.items.some((i) => i.type === 'zitat');
  /** AT quote on a photo: always centred at the bottom, as the posts set it. */
  const atPhotoQuote = isAt && quoteSlide && bg.kind === 'foto';
  /** A headline alone on a colour (cover, hook): top-left, as the posts set it. */
  const headlineAlone =
    bg.kind === 'farbe' &&
    spec.items.some((i) => i.type === 'headline') &&
    spec.items.every((i) => i.type === 'headline' || i.type === 'dachzeile');
  // Text on a full-bleed photo sits at the bottom — the photo stays visible
  // above it. Line boxes are the exception: the posts stack them mid-photo.
  const position = headlineAlone
    ? 'oben'
    : bg.kind === 'foto' && spec.position === 'mitte' && !boxed
      ? 'unten'
      : spec.position;

  const out: ComposedSlide = {
    backgroundMode: bg.kind === 'farbe' ? 'color' : 'image',
    backgroundColor:
      SHAREPIC_COLOR_HEX[
        bg.kind === 'farbe' ? bg.color : bg.kind === 'foto' ? 'dunkeltanne' : bg.panelColor
      ],
    hasBackgroundImage: bg.kind !== 'farbe',
    imageAttribution: bg.kind !== 'farbe' ? attribution : null,
    additionalTexts: [],
    pillBadgeInstances: [],
    circleBadgeInstances: [],
    shapeInstances: [],
    assetInstances: [],
    chartInstances: [],
    userImageInstances: [],
    selectedIcons: [],
    iconStates: {},
    layerOrder: [],
  };
  if (bg.kind !== 'farbe') out.currentImageSrc = options.photoSrc(bg.filename);

  const addShape = (shape: ShapeInstance) => {
    out.shapeInstances.push(shape);
    out.layerOrder.push(shape.id);
  };
  /** An editor icon centred on x/y, `size` px across. */
  const addIcon = (
    id: string,
    iconId: string,
    x: number,
    y: number,
    size: number,
    color: string,
    opacity = 1
  ) => {
    out.selectedIcons.push(id);
    out.iconStates[id] = { iconId, x, y, scale: size / 120, rotation: 0, color, opacity };
    out.layerOrder.push(id);
  };
  const rect = (id: string, x: number, y: number, w: number, h: number, fill: string) => {
    const shape = createShape('rect', x + w / 2, y + h / 2, fill, fill);
    return Object.assign(shape, { id, width: w, height: h });
  };

  // ── Surface: what the text sits on, and the planes that make it ──────────
  let areaTop = 0;
  let areaBottom: number = canvas.height;
  let surface: SharepicColor | 'foto' = 'foto';
  let scrim: ShapeInstance | null = null;
  let scrimSide: 'unten' | 'oben' | null = null;
  let scrimDark = '';
  let scrimLevel = 0;
  /**
   * Places the scrim: dense (`scrimLevel` and up) from the text side's edge
   * to `denseTo` px inward, then a fade to nothing.
   */
  const setScrim = (side: SharepicTextSide, denseTo: number) => {
    if (!scrim) return;
    const vertical = side === 'unten' || side === 'oben';
    const full = vertical ? canvas.height : canvas.width;
    // Fade across all the photo left beside the text: a short ramp of near-black
    // over a bright photo reads as a curtain edge.
    // Top/bottom: only the text side's share of the photo, the rest stays as
    // shot. A side column fades across the whole width — a short ramp beside
    // a tall column reads as a curtain edge.
    const depth = vertical
      ? Math.min(full, Math.max(full * SCRIM_MIN_DEPTH, denseTo + full * SCRIM_FADE))
      : full;
    const fade = Math.max(0.01, 1 - denseTo / depth);
    const edge = scrimLevel;
    const x = side === 'rechts' ? canvas.width - depth : 0;
    const y = side === 'unten' ? canvas.height - depth : 0;
    const w = side === 'links' || side === 'rechts' ? depth : canvas.width;
    const h = side === 'unten' || side === 'oben' ? depth : canvas.height;
    Object.assign(scrim, { x: x + w / 2, y: y + h / 2, width: w, height: h });
    scrim.fillGradient = {
      type: 'linear',
      angle: SCRIM_ANGLE[side],
      stops: [
        // Smoothstep: flat at both ends, so neither the photo side nor the
        // start of the dense band shows a seam.
        ...SCRIM_EASE.map((t) => ({
          offset: fade * t,
          color: `rgba(${scrimDark},${(scrimLevel * t * t * (3 - 2 * t)).toFixed(3)})`,
        })),
        { offset: 1, color: `rgba(${scrimDark},${edge})` },
      ],
    };
  };
  const aufruf = spec.items.find((i) => i.type === 'aufruf') ?? null;
  let column: Column = {
    x: MARGIN,
    width: canvas.width - 2 * MARGIN,
    align:
      (isAt && quoteSlide) || (aufruf && aufruf.stil !== 'ausruf')
        ? 'center'
        : headlineAlone
          ? 'left'
          : spec.align === 'zentriert'
            ? 'center'
            : 'left',
  };

  if (bg.kind === 'farbe') {
    surface = bg.color;
    const gradient = GRADIENTS[bg.color];
    if (gradient) {
      const { stops } = gradient;
      const plane = rect('sc-bg', 0, 0, canvas.width, canvas.height, stops[1]!);
      plane.fillGradient = {
        type: 'linear',
        angle: gradient.angle,
        stops: stops.map((color, i) => ({ offset: i / (stops.length - 1), color })),
      };
      addShape(plane);
    }
  } else if (bg.kind === 'foto-oben') {
    surface = bg.panelColor;
    // The event template's strip share (40 %), on whatever height the format has.
    areaTop =
      (VERANSTALTUNG_CONFIG.photo.height * canvas.height) / VERANSTALTUNG_CONFIG.canvas.height;
    // The photo is cover-fitted to the whole canvas; move its middle into the strip.
    out.imageOffset = { x: 0, y: areaTop / 2 - canvas.height / 2 };
    out.imageScale = 1;
    addShape(
      rect('sc-panel', 0, areaTop, canvas.width, canvas.height - areaTop, out.backgroundColor)
    );
  } else if (bg.kind === 'foto-unten') {
    // The colour carries the text at the top; the photo starts at a hard edge
    // (a soft fade reads as a smear on AT, and the posts cut it clean).
    surface = bg.panelColor;
    areaBottom = canvas.height * 0.6;
    // The lower strip, from where the text area ends: the photo's middle goes there.
    out.imageOffset = { x: 0, y: (areaBottom + canvas.height) / 2 - canvas.height / 2 };
    out.imageScale = 1;
    addShape(rect('sc-panel', 0, 0, canvas.width, areaBottom, out.backgroundColor));
  } else if (!boxed || spec.items.some((i) => i.type === 'zitat' || i.type === 'frage')) {
    // Text on a photo: a gradient from the text side into the picture.
    // Line boxes bring their own contrast and need none — a quote or question
    // stays free text even on a boxed slide, so it needs the scrim.
    const side = atPhotoQuote ? 'unten' : bg.textSeite;
    const vertical = side === 'unten' || side === 'oben';
    scrimDark = SCRIM_DARK[locale];
    scrimLevel = SCRIM_TEXT_ALPHA[options.photoTone?.(bg.filename, side) ?? 'mittel'];
    // Real stops follow in `setScrim`, once the geometry is known.
    scrim = rect('sc-scrim', 0, 0, canvas.width, canvas.height, 'transparent');
    addShape(scrim);
    if (vertical) {
      // Sized after layout, once the block's height is known.
      scrimSide = side;
    } else {
      const width = canvas.width * 0.52;
      column = {
        x: side === 'links' ? MARGIN : canvas.width - MARGIN - width,
        width,
        align: 'left',
      };
      // Dense across the column and a gutter, from the picture's edge outward.
      setScrim(side, MARGIN + width + SCRIM_GUTTER);
    }
  }
  // AT sets a photo strip in green monochrome, as the posts do; a full-bleed
  // photo carries the text and stays as shot.
  if (isAt && (bg.kind === 'foto-oben' || bg.kind === 'foto-unten')) {
    const top = bg.kind === 'foto-oben' ? 0 : areaBottom;
    const bottom = bg.kind === 'foto-oben' ? areaTop : canvas.height;
    const tint = rect('sc-tint', 0, top, canvas.width, bottom - top, theme.colors.primary);
    addShape({ ...tint, blendMode: 'color' });
  }

  const onLight = surface !== 'foto' && LIGHT.includes(surface);
  // DE grass green is bright: the posts set dark text on it, not white.
  const onGrass = !isAt && surface === 'grasgruen';
  const darkInk = onLight || onGrass;
  const textColor = darkInk ? darkText : '#FFFFFF';
  // Logo and arrow sit in the footer: on `foto-unten` that is the photo, not the panel.
  const footerOnLight = bg.kind !== 'foto-unten' && onLight;
  const footerDarkInk = bg.kind !== 'foto-unten' && darkInk;
  const shadow =
    surface === 'foto'
      ? {
          shadowColor: '#000000',
          shadowBlur: 18,
          shadowOffsetX: 0,
          shadowOffsetY: 2,
          shadowOpacity: 0.45,
        }
      : {};
  // `==word==` runs: AT sets them yellow in Vollkorn Black Italic, DE in lime.
  const accent: TextAccent = isAt
    ? {
        fill: onLight ? theme.colors.secondary : theme.colors.accent,
        fontFamily: theme.fonts.quoteEmphasis,
        fontStyle: AT_EMPHASIS_STYLE,
      }
    : { fill: onLight ? KLEE : onGrass ? '#FFFFFF' : LIME };
  // DE `++passage++`: dark ink in a white box; mint on a white slide, where
  // white would vanish. Photos and dark colours take white — a dark box
  // disappears into the scrim. AT has none (see `foldMarkers`).
  const marker: TextMarker | null = isAt
    ? null
    : {
        fill: surface === 'weiss' ? SHAREPIC_COLOR_HEX.mint : '#FFFFFF',
        color: SHAREPIC_COLOR_HEX.dunkeltanne,
      };
  // A topic icon in a circle — DE Klee on light ground, Tanne on grass green,
  // lime on dark ground and photos; AT the yellow accent, its dark green on white.
  const badgeColors = isAt
    ? onLight
      ? { fill: theme.colors.primary, ink: '#FFFFFF' }
      : { fill: theme.colors.accent, ink: theme.colors.primary }
    : onLight
      ? { fill: KLEE, ink: '#FFFFFF' }
      : onGrass
        ? { fill: SHAREPIC_COLOR_HEX.tanne, ink: '#FFFFFF' }
        : { fill: LIME, ink: SHAREPIC_COLOR_HEX.dunkeltanne };
  const cardAccent: TextAccent = isAt
    ? { ...accent, fill: theme.colors.secondary }
    : { fill: KLEE };
  /**
   * The two sides of a contrast, as the posts set them: theirs (a comparison's
   * left, a fact check's claim) muted with ✗, ours on the accent with ✓.
   */
  const contrastPanel = (side: 'theirs' | 'ours') => {
    const muted = isAt && !onLight ? '#FFFFFF' : darkText;
    return side === 'theirs'
      ? {
          // DE: a pale panel that stays visible on pale ground; AT: a veil.
          fill: isAt
            ? muted
            : surface === 'hellgrau' || surface === 'weiss'
              ? SHAREPIC_COLOR_HEX.mint
              : SHAREPIC_COLOR_HEX.hellgrau,
          fillOpacity: isAt ? (onLight ? 0.08 : 0.15) : 1,
          ink: muted,
          inkOpacity: 0.7,
          accent: isAt ? accent : { fill: KLEE },
          marker: VERGLEICH_MARKER_IDS.links,
        }
      : {
          fill: isAt
            ? theme.colors.accent
            : onGrass
              ? SHAREPIC_COLOR_HEX.tanne
              : SHAREPIC_COLOR_HEX.grasgruen,
          fillOpacity: 1,
          ink: !isAt && onGrass ? '#FFFFFF' : darkText,
          inkOpacity: 1,
          // White on grasgruen is 2.2:1. Tanne in bold italic stays legible as
          // large text (4.1:1) and stands apart from the dunkeltanne body,
          // even from a fact set bold.
          accent: isAt
            ? { ...accent, fill: theme.colors.primary }
            : onGrass
              ? { fill: LIME }
              : ({ fill: SHAREPIC_COLOR_HEX.tanne, fontStyle: 'bold italic' } satisfies TextAccent),
          marker: VERGLEICH_MARKER_IDS.rechts,
        };
  };
  /** Lines a rich text takes — the same layout the editor's renderer runs. */
  const lineCount = (
    value: string,
    width: number,
    size: number,
    family: string,
    weight: NonNullable<TextAccent['fontStyle']>,
    runAccent: TextAccent = accent
  ) => {
    // The renderer's own run fonts, so a Vollkorn run is measured in the face it is drawn in.
    const measureRun: MeasureRun = (t, style) => {
      const run = runFont(family, weight, style, runAccent);
      return measure(t, size, run.fontFamily, run.fontStyle);
    };
    return layoutRichTextBlock(value, width, measureRun).length;
  };

  // Date circle: free in the bottom-right corner, as on the posts; the text
  // group ends above it and the place sits beside it. Under a photo strip the
  // panel is too short for that: the column runs beside the circle instead
  // and the place stacks bottom-left.
  const circle = spec.datum
    ? {
        x: canvas.width - DATE_CIRCLE.right - DATE_CIRCLE.radius,
        y: canvas.height - DATE_CIRCLE.bottom - DATE_CIRCLE.radius,
        radius: DATE_CIRCLE.radius,
      }
    : null;
  const columnBesideCircle = !!circle && bg.kind === 'foto-oben';
  if (circle && columnBesideCircle) {
    column = { ...column, width: circle.x - circle.radius - GAP - column.x };
  } else if (circle) {
    areaBottom = Math.min(areaBottom, circle.y - circle.radius - GAP);
  }

  // The headline keeps the full column; AT argument slides set centred
  // paragraphs narrower (~100 px side margins on the posts).
  const headColumn = column;
  if (isAt && column.align === 'center' && surface !== 'foto') {
    const width = canvas.width - 2 * AT_CENTRED_MARGIN;
    column = { ...column, x: AT_CENTRED_MARGIN, width };
  }
  const xAlign = column.align;

  // Logo: AT only on the last slide, only on a plain colour and never on a
  // quote (2 of 42 posts carry it, both so); DE never on a full-bleed photo. Enforced here — the
  // model sets `logo: true` far more often than the posts do.
  // The key sentence closes over the logo, as the posts end.
  const showLogo =
    (spec.logo || aufruf?.stil === 'kernsatz') &&
    (isAt ? !swipeOn && bg.kind === 'farbe' && !quoteSlide : bg.kind !== 'foto');
  const logo = LOGO[locale];
  /** DE always and AT next to a date circle set the logo bottom-left, at the margin. */
  const logoLeft = showLogo && (!isAt || !!spec.datum);
  const logoCentred = showLogo && !logoLeft;
  const arrow = ARROW[locale];
  const arrowLeft = canvas.width - arrow.right - arrow.size * arrow.glyph;
  /** Where place and source start: right of a bottom-left logo. */
  const footX = logoLeft ? MARGIN + logo.size + 24 : MARGIN;

  // Footer row: logo, arrow, place, source — the text group ends above it.
  const ortBesideCircle = !!spec.ort && !!circle && !columnBesideCircle;
  const footerUsed = showLogo || swipeOn || !!spec.ort || !!spec.quelle;
  if (footerUsed) {
    areaBottom = Math.min(
      areaBottom,
      canvas.height - FOOTER - (spec.ort && !ortBesideCircle ? spec.ort.lines.length * 48 : 0)
    );
  }
  // A large logo reaches above the footer row; the text stays clear of it.
  if (showLogo) areaBottom = Math.min(areaBottom, canvas.height - logo.bottom - logo.height - 20);

  // The AI label owns the bottom-left corner; place/source stack above it.
  const kiMode = options.kiLabel ?? 'full';
  const kiText = kiMode === 'none' ? null : KI_LABEL.texts[kiMode];
  const kiHeight = KI_LABEL.fontSize + 2 * KI_LABEL.paddingY;
  const kiTop = canvas.height - kiHeight - KI_LABEL.margin;
  const quelleSize = 24;
  // A centred logo owns the middle of the footer, the arrow the right: the
  // source wraps left of both.
  // The teaser beside the arrow, in the body face; the source wraps left of it.
  const weiter = swipeOn && spec.weiter ? spec.weiter : null;
  const weiterRight = arrowLeft - 14;
  // It shares the bottom row with the AI label: smaller type before it reaches the label.
  const weiterLeft = kiText
    ? KI_LABEL.margin +
      measure(kiText, KI_LABEL.fontSize, KI_LABEL.fontFamily, 'bold') +
      2 * KI_LABEL.paddingX +
      24
    : MARGIN;
  const weiterBase = isAt ? 34 : 30;
  const weiterSize = weiter
    ? Math.max(
        20,
        Math.min(
          weiterBase,
          Math.floor(
            (weiterBase * (weiterRight - weiterLeft)) /
              measure(weiter, weiterBase, theme.fonts.body, 'bold')
          )
        )
      )
    : weiterBase;
  // Still too long at the smallest size: it wraps and grows upward.
  const weiterLines = weiter
    ? wrapWords(weiter, weiterRight - weiterLeft, (l) =>
        measure(l, weiterSize, theme.fonts.body, 'bold')
      )
    : [];
  const weiterWidth = Math.max(
    0,
    ...weiterLines.map((l) => measure(l, weiterSize, theme.fonts.body, 'bold'))
  );
  const quelleRight = Math.min(
    logoCentred && !spec.ort ? canvas.width / 2 - logo.size / 2 - 20 : canvas.width - MARGIN - 190,
    swipeOn ? arrowLeft - 20 : canvas.width,
    weiter ? weiterRight - weiterWidth - 24 : canvas.width
  );
  const quelleWidth = quelleRight - footX;
  const quelleText = spec.quelle ? `Quelle: ${spec.quelle.replace(/^Quelle:\s*/i, '')}` : '';
  // The block's bottom sits just above the label, however many lines it wraps to.
  const quelleLines = spec.quelle
    ? wrapWords(quelleText, quelleWidth, (l) => measure(l, quelleSize, theme.fonts.body, 'normal'))
        .length
    : 0;
  const quelleY = kiText
    ? kiTop - KI_LABEL.gap - Math.max(1, quelleLines) * quelleSize * 1.2
    : canvas.height - 44;
  const ortBottom = kiText
    ? spec.quelle
      ? quelleY
      : kiTop - KI_LABEL.gap
    : canvas.height - FOOTER / 2 + 20;
  // The text group stops above the source, whatever its line count, and
  // never closer to the AI label than the gap between them.
  if (spec.quelle) areaBottom = Math.min(areaBottom, quelleY - 20);
  else if (kiText) areaBottom = Math.min(areaBottom, kiTop - KI_LABEL.gap - 20 + MARGIN);

  // ── The text group ───────────────────────────────────────────────────────
  const text = (
    id: string,
    value: string,
    y: number,
    fontSize: number,
    fontFamily: string,
    extra: Partial<AdditionalText> = {}
  ) => {
    out.additionalTexts.push({
      id,
      text: value,
      type: 'body',
      x: column.x,
      y,
      width: column.width,
      fontSize,
      fontFamily,
      fontStyle: 'normal',
      fill: textColor,
      align: xAlign,
      accent,
      ...(marker ? { marker } : {}),
      ...shadow,
      ...extra,
    });
    out.layerOrder.push(id);
  };

  /**
   * DE story slides: every line in its own box — white, or grass green for
   * the line that matters. Pills, so a box follows its text when edited.
   */
  const boxLines = (
    id: string,
    lines: { text: string; betont: boolean }[],
    size: number,
    family: string,
    fontStyle: 'normal' | 'bold'
  ): Placed => {
    const padX = Math.round(size * 0.28);
    const padY = Math.round(size * 0.12);
    const step = size + 2 * padY;
    return {
      height: lines.length * step,
      after: Math.round(size * 0.5),
      place: (y) => {
        lines.forEach((line, k) => {
          const lineId = `${id}-${k}`;
          const width = measure(line.text, size, family, fontStyle) + 2 * padX;
          out.pillBadgeInstances.push(
            createPillBadgeInstance('slider', {
              id: lineId,
              text: line.text,
              x: xAlign === 'center' ? column.x + column.width / 2 - width / 2 : column.x,
              y: y + k * step,
              fontSize: size,
              fontFamily: family,
              fontStyle,
              backgroundColor: line.betont ? SHAREPIC_COLOR_HEX.grasgruen : '#FFFFFF',
              textColor: SHAREPIC_COLOR_HEX.dunkeltanne,
              paddingX: padX,
              paddingY: padY,
              cornerRadius: 4,
            })
          );
          out.layerOrder.push(lineId);
        });
      },
    };
  };
  // Narrower than the column: the posts stack short lines, a box per phrase.
  const wrapBoxed = (value: string, size: number, family: string, fontStyle: 'normal' | 'bold') =>
    balancedWrap(stripMarks(value), column.width * 0.82 - size * 0.6, (l) =>
      measure(l, size, family, fontStyle)
    );

  // ── Headline size: fills its column, shrinks only when the block would not fit ──
  const headFamily = theme.fonts.headline;
  /** Width of a headline line at 100 px; AT accent lines in Vollkorn Black Italic at 0.95. */
  const lineWidth100 = (line: string, accented: boolean) =>
    isAt && accented
      ? measure(stripMarks(line), 95, theme.fonts.quoteEmphasis, AT_EMPHASIS_STYLE)
      : measure(stripMarks(line), 100, headFamily, 'normal');
  const coverSize = (h: HeadlineItem) => {
    const accented = accentLines(h.akzent);
    const widest = Math.max(...h.lines.map((l, i) => lineWidth100(l, accented.includes(i))));
    return Math.min(HEADLINE_COVER_MAX, (headColumn.width * HEADLINE_FILL * 100) / widest);
  };
  /** Splits a line at the word gap that balances its halves, never inside a mark. */
  const splitLine = (line: string, accented: boolean): [string, string] | null => {
    const words = line.split(' ');
    let best: [string, string] | null = null;
    let bestWidth = Number.POSITIVE_INFINITY;
    for (let k = 1; k < words.length; k++) {
      const left = words.slice(0, k).join(' ');
      const right = words.slice(k).join(' ');
      const open = (mark: RegExp) => (left.match(mark)?.length ?? 0) % 2 === 1;
      if (open(/==/g) || open(/\+\+/g)) continue;
      const width = Math.max(lineWidth100(left, accented), lineWidth100(right, accented));
      if (width < bestWidth) {
        bestWidth = width;
        best = [left, right];
      }
    }
    return best;
  };
  /**
   * A headline alone on a colour is the cover: the posts set it huge, a few
   * words per line, and it fills the upper ~60 % of the slide. Long lines are
   * split at their most balanced word gap while that makes the type larger.
   */
  const growCover = (h: HeadlineItem): HeadlineItem => {
    let best = h;
    let size = coverSize(h);
    for (let round = 0; round < 4; round++) {
      const accented = accentLines(best.akzent);
      const widest = best.lines
        .map((line, i) => ({ i, w: lineWidth100(line, accented.includes(i)) }))
        .sort((a, b) => b.w - a.w)[0];
      const halves = widest ? splitLine(best.lines[widest.i]!, accented.includes(widest.i)) : null;
      if (!widest || !halves) break;
      const lines = [
        ...best.lines.slice(0, widest.i),
        ...halves,
        ...best.lines.slice(widest.i + 1),
      ];
      const akzent = accented.flatMap((a) =>
        a < widest.i ? [a] : a === widest.i ? [a, a + 1] : [a + 1]
      );
      const next: HeadlineItem = { ...best, lines, ...(akzent.length ? { akzent } : {}) };
      const nextSize = coverSize(next);
      if (nextSize < size * 1.08 || lines.length * nextSize * 0.96 > canvas.height * COVER_SHARE)
        break;
      best = next;
      size = nextSize;
    }
    return best;
  };
  const items = headlineAlone
    ? spec.items.map((i) => (i.type === 'headline' ? growCover(i) : i))
    : spec.items;
  const headItem = items.find((i) => i.type === 'headline') ?? null;
  const headAccented = headItem?.type === 'headline' ? accentLines(headItem.akzent) : [];
  /** AT accent lines are Vollkorn Black Italic at 0.95 — wider than the headline face. */
  const headLineWidth = (line: string, i: number, size: number) =>
    isAt && headAccented.includes(i)
      ? measure(stripMarks(line), size * 0.95, theme.fonts.quoteEmphasis, AT_EMPHASIS_STYLE)
      : measure(stripMarks(line), size, headFamily, 'normal');
  // Next to a card (list, chart, comparison) or an icon list the headline is
  // a title, not the hero: the explainer posts set it at ~100–130 px.
  const headMax = headlineAlone
    ? HEADLINE_COVER_MAX
    : items.some((i) => CARD_ITEMS.includes(i.type))
      ? HEADLINE_WITH_CARD
      : HEADLINE_MAX;
  const headlineSizeAt = (headScale: number): number | null => {
    if (headItem?.type !== 'headline' || boxed) return null;
    const widest = Math.max(...headItem.lines.map((l, i) => headLineWidth(l, i, 100)));
    const target = Math.min(headMax, (headColumn.width * HEADLINE_FILL * 100) / widest);
    return largestSizeWordsFit(
      headItem.lines,
      Math.round(Math.max(48, target * headScale)),
      headColumn.width,
      0,
      (w, size) => measure(w, size, headFamily, 'bold')
    );
  };

  /**
   * A quote alone on a colour is the slide's hero, like a headline: it fills
   * ~25–30 % of the height (interview covers), not a caption-sized card.
   */
  const quoteAlone =
    bg.kind === 'farbe' &&
    items.some((i) => i.type === 'zitat') &&
    items.every((i) => i.type === 'zitat' || i.type === 'dachzeile');
  const quoteSize = (base: number, scale: number, cap: number) =>
    quoteAlone
      ? Math.min(Math.round(base * scale * 1.6), QUOTE_ALONE_MAX)
      : Math.min(Math.round(base * Math.min(scale, 1.5)), cap);

  // A hook: one short paragraph alone on the slide.
  const only = items.length === 1 ? items[0] : null;
  const shortHook = only?.type === 'absatz' && only.text.split(/\s+/).length <= 10;
  /**
   * The group at a paragraph scale; side-effect free until `place`. A chart
   * gives up `chartShrink` px of its height before any text shrinks.
   */
  const build = (scale: number, chartShrink = 0, headScale = 1): Placed[] => {
    const placed: Placed[] = [];
    const headSize = headlineSizeAt(headScale);
    /** Paragraphs never come closer than 1 : 1.8 to the headline. */
    const paraCap = headSize ? Math.floor(headSize / HEADLINE_RATIO) : Number.POSITIVE_INFINITY;
    const paraBase = isAt ? 70 : 48;
    items.forEach((item: SharepicItem, index) => {
      const id = `sc-${index}-${item.type}`;
      switch (item.type) {
        case 'dachzeile': {
          // Scales with the headline (≈ 0.4 on the photo posts, in the
          // headline face; smaller and in bold body text on a colour).
          const onPhoto = surface === 'foto';
          const family = onPhoto ? headFamily : theme.fonts.body;
          const fontStyle = onPhoto ? 'normal' : 'bold';
          const size = largestSizeWordsFit(
            [item.text],
            headSize ? Math.round(headSize * (onPhoto ? 0.4 : 0.3)) : 38,
            headColumn.width,
            0,
            (w, s) => measure(w, s, family, 'bold')
          );
          const lineHeight = onPhoto ? 1 : 1.15;
          const lines = lineCount(item.text, headColumn.width, size, family, fontStyle);
          placed.push({
            height: lines * size * lineHeight,
            after: Math.round(size * 0.15),
            place: (y) =>
              text(id, item.text, y, size, family, {
                fontStyle,
                lineHeight,
                x: headColumn.x,
                width: headColumn.width,
              }),
          });
          break;
        }
        case 'headline': {
          if (boxed) {
            placed.push(
              boxLines(
                id,
                item.lines.map((l, i) => ({
                  text: stripMarks(l),
                  betont: accentLines(item.akzent).includes(i),
                })),
                76,
                theme.fonts.body,
                'bold'
              )
            );
            break;
          }
          const family = headFamily;
          const lineHeight = isAt ? 0.95 : 0.96;
          const size = headSize ?? 72;
          const step = size * lineHeight;
          const col = headColumn;
          const centre = col.x + col.width / 2;
          // Consecutive plain lines share one text element; the accent line is its own.
          const segments: { lines: string[]; accent: boolean }[] = [];
          item.lines.forEach((l, i) => {
            const accent = headAccented.includes(i);
            const last = segments[segments.length - 1];
            if (last && !last.accent && !accent) last.lines.push(l);
            else segments.push({ lines: [l], accent });
          });
          // A line wider than the column still wraps at a small size: count the rows set.
          const rows = (lines: string[], accent: boolean) =>
            lines.reduce(
              (n, l) =>
                n +
                Math.max(
                  1,
                  accent && isAt
                    ? wrapWords(stripMarks(l), col.width, (t) =>
                        measure(
                          t,
                          Math.round(size * 0.95),
                          theme.fonts.quoteEmphasis,
                          AT_EMPHASIS_STYLE
                        )
                      ).length
                    : lineCount(l, col.width, size, family, 'normal')
                ),
              0
            );
          const height = segments.reduce((h, seg) => h + rows(seg.lines, seg.accent) * step, 0);
          placed.push({
            height,
            after: Math.round(size * 0.35),
            place: (y) => {
              let cursor = y;
              segments.forEach((segment, s) => {
                const segId = `${id}-${s}`;
                const value = segment.lines.join('\n');
                const at = { x: col.x, width: col.width };
                // An accent line is one accent already; a word accent inside it
                // would vanish (DE: lime on lime) — keep the plain words.
                const plain = stripMarks(value);
                if (segment.accent && isAt) {
                  text(segId, plain, cursor, Math.round(size * 0.95), theme.fonts.quoteEmphasis, {
                    ...at,
                    fontStyle: AT_EMPHASIS_STYLE,
                    fill: onLight ? theme.colors.secondary : theme.colors.accent,
                    lineHeight,
                    type: 'header',
                  });
                } else if (segment.accent) {
                  // DE marker: dark text on a box sized to the line, centred on
                  // the line's own column (not the canvas — a date circle or a
                  // side photo narrows it).
                  const w = measure(plain, size, family, 'normal') + size * 0.4;
                  const x = xAlign === 'center' ? centre - w / 2 : col.x - size * 0.15;
                  // Lime glows on dark ground; on mint it washes out — grass
                  // green there; on grass green itself a white box.
                  const markerColor = onGrass
                    ? '#FFFFFF'
                    : onLight
                      ? SHAREPIC_COLOR_HEX.grasgruen
                      : LIME;
                  const box = rect(`${segId}-box`, x, cursor + size * 0.04, w, step, markerColor);
                  box.rotation = -2;
                  addShape(box);
                  text(segId, plain, cursor, size, family, {
                    ...at,
                    fill: SHAREPIC_COLOR_HEX.dunkeltanne,
                    lineHeight,
                    type: 'header',
                    shadowOpacity: 0,
                  });
                } else {
                  text(segId, value, cursor, size, family, { ...at, lineHeight, type: 'header' });
                }
                cursor += rows(segment.lines, segment.accent) * step;
              });
            },
          });
          break;
        }
        case 'text': {
          if (boxed) {
            const size = 42;
            const lines = wrapBoxed(item.text, size, theme.fonts.body, 'normal');
            placed.push(
              boxLines(
                id,
                lines.map((l) => ({ text: l, betont: false })),
                size,
                theme.fonts.body,
                'normal'
              )
            );
            break;
          }
          // Grows with the fit loop, capped so a one-liner doesn't turn into a headline.
          const size = largestSizeWordsFit(
            [item.text],
            Math.min(Math.round(42 * Math.min(scale, 1.4)), paraCap),
            column.width,
            0,
            (w, s) => measure(w, s, theme.fonts.body, 'bold')
          );
          const lines = lineCount(item.text, column.width, size, theme.fonts.body, 'normal');
          placed.push({
            height: lines * size * 1.25,
            after: GAP,
            place: (y) => text(id, item.text, y, size, theme.fonts.body, { lineHeight: 1.25 }),
          });
          break;
        }
        case 'absatz': {
          // A story paragraph: larger than `text`. AT sets it in the headline
          // face, a stressed one in yellow Vollkorn; DE in regular body text
          // with `**…**` for the key words (design guide p. 14, the posts).
          if (boxed) {
            // Boxes grow less: a box per line must stay a phrase, not a word —
            // except on a short hook, which the posts set large.
            const size = Math.round(56 * Math.min(scale, shortHook ? 1.7 : 1.25));
            const lines = wrapBoxed(item.text, size, theme.fonts.body, 'bold');
            placed.push(
              boxLines(
                id,
                lines.map((l) => ({ text: l, betont: !!item.betont })),
                size,
                theme.fonts.body,
                'bold'
              )
            );
            break;
          }
          const wantedSize = Math.min(Math.round(paraBase * scale), paraCap);
          const lineHeight = isAt ? 1.08 : 1.22;
          const stressed = item.betont
            ? isAt
              ? {
                  family: theme.fonts.quoteEmphasis,
                  fontStyle: AT_EMPHASIS_STYLE,
                  fill: accent.fill,
                }
              : { family: theme.fonts.body, fontStyle: 'bold' as const, fill: accent.fill }
            : null;
          const family = stressed?.family ?? (isAt ? theme.fonts.headline : theme.fonts.body);
          const fontStyle = stressed?.fontStyle ?? 'normal';
          const size = largestSizeWordsFit([item.text], wantedSize, column.width, 0, (w, s) =>
            measure(w, s, family, 'bold')
          );
          const lines = lineCount(item.text, column.width, size, family, fontStyle);
          placed.push({
            height: lines * size * lineHeight,
            // AT stacks its paragraphs ~80 px apart on the posts.
            after: Math.round(size * (isAt ? 0.9 : 0.6)),
            place: (y) =>
              text(id, item.text, y, size, family, {
                fontStyle,
                lineHeight,
                ...(stressed ? { fill: stressed.fill } : {}),
              }),
          });
          break;
        }
        case 'zitat': {
          if (isAt) {
            // AT quote card (Gewessler posts): white poster sans, centred, a thin
            // outlined quote mark above, the name alone below — small, plain white.
            const family = headFamily;
            const size = largestSizeWordsFit(
              [stripMarks(item.text)],
              quoteSize(60, scale, 96),
              column.width,
              0,
              (w, s) => measure(w, s, family, 'bold')
            );
            const lineHeight = 1.08;
            const quoteHeight =
              lineCount(item.text, column.width, size, family, 'normal') * size * lineHeight;
            const markSize = 220;
            // The glyph fills the top ~45 % of its em box; the rest is air.
            const markHeight = Math.round(markSize * 0.45);
            const nameSize = 30;
            placed.push({
              height: markHeight + 28 + quoteHeight + 30 + nameSize * 1.2,
              after: GAP,
              place: (y) => {
                text(`${id}-mark`, '”', y - Math.round(markSize * 0.12), markSize, family, {
                  fill: 'transparent',
                  stroke: '#FFFFFF',
                  strokeWidth: 3,
                  lineHeight: 1,
                  shadowOpacity: 0,
                });
                text(id, item.text, y + markHeight + 28, size, family, { lineHeight });
                text(
                  `${id}-name`,
                  item.name,
                  y + markHeight + 28 + quoteHeight + 30,
                  nameSize,
                  theme.fonts.body,
                  { lineHeight: 1.2 }
                );
              },
            });
            break;
          }
          // A quote has its own cap: long ones must not explode.
          const size = largestSizeWordsFit(
            [stripMarks(item.text)],
            quoteSize(52, scale, 78),
            column.width,
            0,
            (w, s) => measure(w, s, theme.fonts.body, 'bold')
          );
          const mark = quoteAlone ? 140 : 90;
          const lines = wrapWords(stripMarks(item.text), column.width, (l) =>
            measure(l, size, theme.fonts.body, 'normal')
          );
          const quoteHeight = lines.length * size * 1.2;
          const nameSize = 38;
          // Name bold, the medium in regular after it; the role on its own line.
          const credit = item.quelle ? `**${item.name}** ${item.quelle}` : `**${item.name}**`;
          const signatureText = item.funktion ? `${credit}\n${item.funktion}` : credit;
          const signature =
            lineCount(signatureText, column.width, nameSize, theme.fonts.body, 'normal') *
            nameSize *
            1.25;
          placed.push({
            height: mark + 10 + quoteHeight + 24 + signature,
            after: GAP,
            place: (y) => {
              const markId = `${id}-mark`;
              out.assetInstances.push({
                id: markId,
                assetId: 'quote-mark-weiss',
                x: xAlign === 'center' ? column.x + column.width / 2 : column.x + mark / 2,
                y: y + mark / 2,
                scale: mark / 150,
                rotation: 0,
                opacity: 1,
              });
              out.layerOrder.push(markId);
              text(id, item.text, y + mark + 10, size, theme.fonts.body, { lineHeight: 1.2 });
              text(
                `${id}-name`,
                signatureText,
                y + mark + 10 + quoteHeight + 24,
                nameSize,
                theme.fonts.body,
                {
                  lineHeight: 1.25,
                }
              );
            },
          });
          break;
        }
        case 'frage': {
          // The interview question: bold, clearly smaller than the answer
          // paragraph under it; the medium's prefix in its own colour (DE Klee
          // on light ground, grass green on dark; AT the yellow accent).
          const value = item.von ? `==${item.von}:== ${item.text}` : item.text;
          const prefixAccent: TextAccent = isAt
            ? accent
            : { fill: darkInk ? KLEE : SHAREPIC_COLOR_HEX.grasgruen };
          const size = largestSizeWordsFit(
            [value],
            Math.min(Math.round(paraBase * 0.75 * Math.min(scale, 1.4)), paraCap),
            column.width,
            0,
            (w, s) => measure(w, s, theme.fonts.body, 'bold')
          );
          const lines = lineCount(
            value,
            column.width,
            size,
            theme.fonts.body,
            'bold',
            prefixAccent
          );
          placed.push({
            height: lines * size * 1.25,
            after: Math.round(size * 0.5),
            place: (y) =>
              text(id, value, y, size, theme.fonts.body, {
                fontStyle: 'bold',
                lineHeight: 1.25,
                accent: prefixAccent,
              }),
          });
          break;
        }
        case 'liste': {
          // Few points carry a demands slide on their own — they grow with it.
          const wantedSize = Math.round((item.items.length <= 3 ? 54 : 46) * Math.min(scale, 1.3));
          const isPlain = isAt && !onLight;
          const pad = 46;
          const listWidth = isPlain ? column.width : column.width - 2 * pad;
          const size = largestSizeWordsFit(
            item.items,
            wantedSize,
            listWidth,
            measure('• ', wantedSize, theme.fonts.body, 'normal'),
            (w, s) => measure(w, s, theme.fonts.body, 'bold')
          );
          if (isPlain) {
            // AT sets its lists straight on the green, white with the
            // keywords bold — the white card is a German pattern.
            const plainList = item.items.map((i) => `• ${i}`).join('\n');
            const lines = lineCount(plainList, column.width, size, theme.fonts.body, 'normal');
            placed.push({
              height: lines * size * 1.3,
              after: GAP,
              place: (y) =>
                text(id, plainList, y, size, theme.fonts.body, { lineHeight: 1.3, align: 'left' }),
            });
            break;
          }
          const inner = column.width - 2 * pad;
          const body = item.items.map((i) => `• ${i}`).join('\n');
          const lines = lineCount(body, inner, size, theme.fonts.body, 'normal', cardAccent);
          const height = lines * size * 1.3 + 2 * pad;
          placed.push({
            height,
            after: GAP,
            place: (y) => {
              const card = createShape(
                'rounded-rect',
                column.x + column.width / 2,
                y + height / 2,
                '#FFFFFF',
                '#FFFFFF'
              );
              Object.assign(card, {
                id: `${id}-card`,
                width: column.width,
                height,
                cornerRadius: 32,
              });
              addShape(card);
              out.additionalTexts.push({
                id,
                text: body,
                type: 'body',
                x: column.x + pad,
                y: y + pad,
                width: inner,
                fontSize: size,
                fontFamily: theme.fonts.body,
                fontStyle: 'normal',
                fill: darkText,
                lineHeight: 1.3,
                accent: cardAccent,
              });
              out.layerOrder.push(id);
            },
          });
          break;
        }
        case 'diagramm': {
          // Always on a white card: the chart renderer's axes and labels are
          // dark, and the DE explainer posts set their charts the same way.
          const pad = 40;
          const inner = column.width - 2 * pad;
          const titleSize = 36;
          const titleLines = item.titel
            ? lineCount(item.titel, inner, titleSize, theme.fonts.body, 'bold', cardAccent)
            : 0;
          const titleHeight = titleLines ? titleLines * titleSize * 1.2 + 16 : 0;
          const chartHeight = Math.max(
            CHART_MIN_HEIGHT,
            Math.round(inner * 0.55 * Math.min(scale, 1.2)) - chartShrink
          );
          const height = 2 * pad + titleHeight + chartHeight;
          const round = item.art === 'kreis' || item.art === 'donut';
          const sum = item.werte.reduce((total, w) => total + w.wert, 0);
          const data = item.werte.map((w) => ({ name: w.name, value: w.wert }));
          // Shares of a whole: what the values leave to 100 % is drawn too.
          const rest = round && item.einheit === '%' && sum < 99.5;
          if (rest) data.push({ name: 'Rest', value: Math.round((100 - sum) * 10) / 10 });
          const palette = CHART_PALETTE[locale];
          // A long bar or line series reads as one colour; a few parts get one each.
          const colors =
            round || data.length <= 3
              ? data.map((_, k) =>
                  rest && k === data.length - 1 ? CHART_REST : palette[k % palette.length]
                )
              : [palette[0]];
          placed.push({
            height,
            after: GAP,
            place: (y) => {
              const card = createShape(
                'rounded-rect',
                column.x + column.width / 2,
                y + height / 2,
                '#FFFFFF',
                '#FFFFFF'
              );
              Object.assign(card, {
                id: `${id}-card`,
                width: column.width,
                height,
                cornerRadius: 32,
              });
              addShape(card);
              if (item.titel) {
                const titleId = `${id}-titel`;
                out.additionalTexts.push({
                  id: titleId,
                  text: item.titel,
                  type: 'body',
                  x: column.x + pad,
                  y: y + pad,
                  width: inner,
                  fontSize: titleSize,
                  fontFamily: theme.fonts.body,
                  fontStyle: 'bold',
                  fill: darkText,
                  lineHeight: 1.2,
                  align: xAlign,
                  accent: cardAccent,
                });
                out.layerOrder.push(titleId);
              }
              const chartId = `chart-${id}`;
              out.chartInstances.push({
                ...createChartInstance(CHART_TYPE[item.art], canvas.width, canvas.height),
                id: chartId,
                x: column.x + pad,
                y: y + pad + titleHeight,
                width: inner / CHART_SCALE,
                height: chartHeight / CHART_SCALE,
                scale: CHART_SCALE,
                data,
                colors,
                ...(item.einheit ? { unit: item.einheit } : {}),
                showLegend: round,
                showGrid: false,
                showValues: true,
              });
              out.layerOrder.push(chartId);
            },
          });
          break;
        }
        case 'iconliste': {
          // A topic icon in a circle before each point.
          const texts = item.zeilen.map((z) => z.text);
          const wantedSize = Math.min(
            Math.round((texts.length <= 3 ? 54 : 46) * Math.min(scale, 1.3)),
            paraCap
          );
          const badgeAt = (s: number) => Math.round(s * 1.4);
          const indentAt = (s: number) => badgeAt(s) + Math.round(s * 0.5);
          const size = largestSizeWordsFit(
            texts,
            wantedSize,
            column.width,
            indentAt(wantedSize),
            (w, s) => measure(w, s, theme.fonts.body, 'bold')
          );
          const badge = badgeAt(size);
          const indent = indentAt(size);
          const textWidth = column.width - indent;
          const lineStep = size * 1.25;
          // The first line sits on the circle's middle.
          const textOffset = (badge - lineStep) / 2;
          const rows = texts.map((t) =>
            Math.max(
              badge,
              textOffset + lineCount(t, textWidth, size, theme.fonts.body, 'normal') * lineStep
            )
          );
          const rowGap = Math.round(size * 0.5);
          placed.push({
            height: rows.reduce((sum, r) => sum + r, 0) + rowGap * (rows.length - 1),
            after: GAP,
            place: (y) => {
              let rowTop = y;
              item.zeilen.forEach((zeile, k) => {
                const rowId = `${id}-${k}`;
                const cx = column.x + badge / 2;
                const cy = rowTop + badge / 2;
                const circle = createShape('circle', cx, cy, badgeColors.fill, badgeColors.fill);
                addShape(
                  Object.assign(circle, { id: `${rowId}-badge`, width: badge, height: badge })
                );
                addIcon(
                  `${rowId}-icon`,
                  SHAREPIC_ICON_IDS[zeile.icon],
                  cx,
                  cy,
                  badge * 0.6,
                  badgeColors.ink
                );
                text(rowId, zeile.text, rowTop + textOffset, size, theme.fonts.body, {
                  x: column.x + indent,
                  width: textWidth,
                  align: 'left',
                  lineHeight: 1.25,
                });
                rowTop += rows[k]! + rowGap;
              });
            },
          });
          break;
        }
        case 'infografik': {
          // Each point: its painted illustration (an icon on a circle when none
          // was painted), a bold title and a short text — in a grid, as steps
          // in order, or standing on a ground line, sized by their value.
          const body = theme.fonts.body;
          // Gotham Book has no bold cut: AT titles take the display face.
          const titleFamily = isAt ? theme.fonts.headline : body;
          const titleStyle = isAt ? 'normal' : 'bold';
          const punkte = item.punkte;
          const s = Math.min(scale, 1.2);
          const art = (
            artId: string,
            punkt: (typeof punkte)[number],
            x: number,
            y: number,
            size: number
          ) => {
            if (punkt.bild) {
              out.userImageInstances.push({
                id: artId,
                src: options.photoSrc(punkt.bild),
                fileName: punkt.titel,
                x,
                y,
                width: size,
                height: size,
                rotation: 0,
                scale: 1,
                opacity: 1,
              });
              out.layerOrder.push(artId);
              return;
            }
            const d = size * 0.78;
            const cx = x + size / 2;
            const cy = y + size / 2;
            const disc = createShape('circle', cx, cy, badgeColors.fill, badgeColors.fill);
            addShape(Object.assign(disc, { id: `${artId}-badge`, width: d, height: d }));
            addIcon(
              `${artId}-icon`,
              SHAREPIC_ICON_IDS[punkt.icon],
              cx,
              cy,
              d * 0.55,
              badgeColors.ink
            );
          };
          const titleFit = (width: number, wanted: number) =>
            largestSizeWordsFit(
              punkte.map((p) => p.titel),
              Math.min(wanted, paraCap),
              width,
              0,
              (w, size) => measure(w, size, titleFamily, titleStyle)
            );
          const titleHeight = (titel: string, width: number, size: number) =>
            lineCount(titel, width, size, titleFamily, titleStyle) * size * 1.15;
          /**
           * Title and text of one point, `width` wide; returns the height. A
           * `titleH` taller than its own title keeps texts in one row level.
           */
          const caption = (
            pid: string,
            punkt: (typeof punkte)[number],
            width: number,
            titleSize: number,
            textSize: number,
            place: { x: number; y: number; align: 'left' | 'center' } | null,
            titleH = titleHeight(punkt.titel, width, titleSize)
          ): number => {
            const textGap = Math.round(textSize * 0.35);
            const textH = punkt.text
              ? textGap + lineCount(punkt.text, width, textSize, body, 'normal') * textSize * 1.3
              : 0;
            if (place) {
              text(`${pid}-titel`, punkt.titel, place.y, titleSize, titleFamily, {
                x: place.x,
                width,
                align: place.align,
                fontStyle: titleStyle,
                lineHeight: 1.15,
              });
              if (punkt.text) {
                // As narrow as keeps its line count, so no word hangs alone
                // ("… mittlerem / Einkommen").
                const lines = balancedWrap(punkt.text, width, (l) =>
                  measure(l, textSize, body, 'normal')
                );
                const textWidth = Math.min(
                  width,
                  Math.ceil(Math.max(...lines.map((l) => measure(l, textSize, body, 'normal')))) + 2
                );
                text(`${pid}-text`, punkt.text, place.y + titleH + textGap, textSize, body, {
                  x: place.align === 'center' ? place.x + (width - textWidth) / 2 : place.x,
                  width: textWidth,
                  align: place.align,
                  lineHeight: 1.3,
                });
              }
            }
            return titleH + textH;
          };

          if (item.form === 'raster') {
            const n = punkte.length;
            const cols = n === 4 ? 2 : Math.min(n, 3);
            const colGap = 32;
            const cw = (column.width - colGap * (cols - 1)) / cols;
            const artSize = Math.round(Math.min(cw * 0.86, 300 * scale));
            const titleSize = titleFit(cw, Math.round(44 * s));
            const textSize = Math.max(22, Math.round(titleSize * 0.66));
            const artGap = Math.round(titleSize * 0.4);
            const rowsN = Math.ceil(n / cols);
            const rowTitleH = Array.from({ length: rowsN }, (_, r) =>
              Math.max(
                ...punkte
                  .slice(r * cols, r * cols + cols)
                  .map((p) => titleHeight(p.titel, cw, titleSize))
              )
            );
            const cellH = punkte.map(
              (p, k) =>
                artSize +
                artGap +
                caption('', p, cw, titleSize, textSize, null, rowTitleH[Math.floor(k / cols)])
            );
            const rowH = Array.from({ length: rowsN }, (_, r) =>
              Math.max(...cellH.slice(r * cols, r * cols + cols))
            );
            const rowGap = Math.round(40 * s);
            placed.push({
              height: rowH.reduce((a, b) => a + b, 0) + rowGap * (rowsN - 1),
              after: GAP,
              place: (y) => {
                let rowTop = y;
                rowH.forEach((h, r) => {
                  const inRow = punkte.slice(r * cols, r * cols + cols);
                  // A short last row sits centred under the full ones.
                  const offset = ((cols - inRow.length) * (cw + colGap)) / 2;
                  inRow.forEach((punkt, c) => {
                    const pid = `${id}-${r * cols + c}`;
                    const cellX = column.x + offset + c * (cw + colGap);
                    art(`${pid}-bild`, punkt, cellX + (cw - artSize) / 2, rowTop, artSize);
                    caption(
                      pid,
                      punkt,
                      cw,
                      titleSize,
                      textSize,
                      { x: cellX, y: rowTop + artSize + artGap, align: 'center' },
                      rowTitleH[r]
                    );
                  });
                  rowTop += h + rowGap;
                });
              },
            });
            break;
          }

          if (item.form === 'ablauf') {
            // Steps top to bottom: a numbered circle on a line, the
            // illustration, then title and text.
            const badge = Math.round(60 * s);
            const artSize = Math.round(Math.min(column.width * 0.3, 240 * scale));
            const textX = column.x + badge + 24 + artSize + 28;
            const textW = column.x + column.width - textX;
            const titleSize = titleFit(textW, Math.round(40 * s));
            const textSize = Math.max(22, Math.round(titleSize * 0.7));
            const rowH = punkte.map((p) =>
              Math.max(artSize, caption('', p, textW, titleSize, textSize, null))
            );
            const rowGap = Math.round(28 * s);
            placed.push({
              height: rowH.reduce((a, b) => a + b, 0) + rowGap * (rowH.length - 1),
              after: GAP,
              place: (y) => {
                const centres: number[] = [];
                let rowTop = y;
                punkte.forEach((punkt, k) => {
                  const pid = `${id}-${k}`;
                  const h = rowH[k]!;
                  const cy = rowTop + h / 2;
                  centres.push(cy);
                  art(
                    `${pid}-bild`,
                    punkt,
                    column.x + badge + 24,
                    rowTop + (h - artSize) / 2,
                    artSize
                  );
                  const capH = caption(pid, punkt, textW, titleSize, textSize, null);
                  caption(pid, punkt, textW, titleSize, textSize, {
                    x: textX,
                    y: rowTop + (h - capH) / 2,
                    align: 'left',
                  });
                  rowTop += h + rowGap;
                });
                // The line first, so the circles sit on top of it.
                const line = rect(
                  `${id}-linie`,
                  column.x + badge / 2 - 3,
                  centres[0]!,
                  6,
                  centres[centres.length - 1]! - centres[0]!,
                  badgeColors.fill
                );
                addShape(line);
                centres.forEach((cy, k) => {
                  const pid = `${id}-${k}`;
                  const disc = createShape(
                    'circle',
                    column.x + badge / 2,
                    cy,
                    badgeColors.fill,
                    badgeColors.fill
                  );
                  addShape(
                    Object.assign(disc, { id: `${pid}-nummer-kreis`, width: badge, height: badge })
                  );
                  const size = Math.round(badge * 0.55);
                  text(`${pid}-nummer`, String(k + 1), cy - size * 0.6, size, titleFamily, {
                    x: column.x,
                    width: badge,
                    align: 'center',
                    fontStyle: titleStyle,
                    fill: badgeColors.ink,
                    lineHeight: 1.2,
                  });
                });
              },
            });
            break;
          }

          if (item.form === 'zahl') {
            // One figure, huge, under the thing it counts: the illustration
            // above, the figure as large as the width allows, one line below.
            const punkt = punkte[0]!;
            const artSize = Math.round(Math.min(column.width * 0.46, 400 * scale));
            const titleSize = Math.floor(
              Math.min(
                Math.round(240 * s),
                (column.width * 100) / measure(punkt.titel, 100, titleFamily, titleStyle)
              )
            );
            const textSize = Math.max(26, Math.round(titleSize * 0.3));
            const artGap = Math.round(titleSize * 0.2);
            const capH = caption('', punkt, column.width, titleSize, textSize, null);
            placed.push({
              height: artSize + artGap + capH,
              after: GAP,
              place: (y) => {
                art(`${id}-0-bild`, punkt, column.x + (column.width - artSize) / 2, y, artSize);
                caption(`${id}-0`, punkt, column.width, titleSize, textSize, {
                  x: column.x,
                  y: y + artSize + artGap,
                  align: 'center',
                });
              },
            });
            break;
          }

          if (item.form === 'anteil') {
            // Shares as pictogram rows: `wert` of `von` units in the accent, the
            // rest as outlines — "9 von 10" is counted, not estimated. 100 is a 10 × 10
            // grid. The figure is the message, so it may outgrow the paragraphs.
            const titleSize = Math.floor(
              Math.min(
                Math.round(140 * s),
                ...punkte.map(
                  (p) => (column.width * 100) / measure(p.titel, 100, titleFamily, titleStyle)
                )
              )
            );
            const textSize = Math.max(24, Math.round(titleSize * 0.36));
            const blocks = punkte.map((p) => {
              const von = p.von ?? 10;
              // Up to five in a row; six to ten in two rows, read in fives.
              const perRow = von === 100 ? 10 : von <= 5 ? von : Math.ceil(von / 2);
              const rows = Math.ceil(von / perRow);
              // A hundred units sit closer, or the grid shrinks to specks.
              const gap = von === 100 ? ANTEIL_GAP / 2 : ANTEIL_GAP;
              const byWidth = column.width / (perRow + (perRow - 1) * gap);
              const unit = Math.round(Math.min(byWidth, (von === 100 ? 90 : 150) * scale));
              return {
                von,
                perRow,
                unit,
                gap,
                capH: caption('', p, column.width, titleSize, textSize, null),
                gridH: rows * unit + (rows - 1) * unit * gap,
              };
            });
            const inner = Math.round(titleSize * 0.4);
            const blockGap = Math.round(56 * s);
            placed.push({
              height:
                blocks.reduce((sum, b) => sum + b.capH + inner + b.gridH, 0) +
                blockGap * (blocks.length - 1),
              after: GAP,
              place: (y) => {
                let top = y;
                punkte.forEach((punkt, k) => {
                  const b = blocks[k]!;
                  const pid = `${id}-${k}`;
                  caption(pid, punkt, column.width, titleSize, textSize, {
                    x: column.x,
                    y: top,
                    align: 'center',
                  });
                  top += b.capH + inner;
                  const step = b.unit * (1 + b.gap);
                  const rowW = b.perRow * b.unit + (b.perRow - 1) * b.unit * b.gap;
                  const left = column.x + (column.width - rowW) / 2;
                  // Counted units solid; the rest of the whole as outlines at full ink,
                  // so the whole stays visible (a faint solid reads as missing).
                  const solid = SHAREPIC_ICON_FILLED[punkt.icon];
                  const outline = SHAREPIC_ICON_IDS[punkt.icon];
                  for (let u = 0; u < b.von; u++) {
                    const counted = u < (punkt.wert ?? 0);
                    addIcon(
                      `${pid}-einheit-${u}`,
                      counted ? (solid ?? outline) : outline,
                      left + (u % b.perRow) * step + b.unit / 2,
                      top + Math.floor(u / b.perRow) * step + b.unit / 2,
                      b.unit,
                      badgeColors.fill,
                      counted ? 1 : solid ? ANTEIL_REST_OPACITY : ANTEIL_REST_OPACITY / 2
                    );
                  }
                  top += b.gridH + blockGap;
                });
              },
            });
            break;
          }

          // mengen: the illustration's area follows the value, so its side
          // follows the square root — a doubled value looks doubled.
          const top = Math.max(...punkte.map((p) => p.wert ?? 0)) || 1;
          const rel = punkte.map((p) => Math.max(MENGEN_MIN_SIDE, Math.sqrt((p.wert ?? 0) / top)));
          // The figures are the point: large, as on the posters, and never
          // broken between number and unit.
          const evenCol = column.width / punkte.length;
          const titleSize = Math.floor(
            Math.min(
              Math.round(80 * s),
              paraCap,
              ...punkte.map(
                (p) =>
                  ((evenCol - CAPTION_GUTTER) * 100) /
                  measure(p.titel, 100, titleFamily, titleStyle)
              )
            )
          );
          const textSize = Math.max(24, Math.round(titleSize * 0.42));
          const capW = punkte.map(
            (p) =>
              Math.max(
                measure(p.titel, titleSize, titleFamily, titleStyle),
                p.text ? measure(p.text, textSize, body, 'normal') : 0
              ) + CAPTION_GUTTER
          );
          // Columns as wide as their figure or their caption needs: a small
          // value leaves its room to the large one, which may then outgrow an
          // even third.
          const colsFor = (art: number) =>
            rel.map((r, k) => Math.max(r * art + MENGEN_ART_GAP, capW[k]!));
          const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
          let maxArt = Math.round(Math.min(MENGEN_MAX_ART * scale, column.width));
          while (maxArt > 80 && sum(colsFor(maxArt)) > column.width) maxArt -= 4;
          const slack = (column.width - sum(colsFor(maxArt))) / punkte.length;
          const cols = colsFor(maxArt).map((w) => w + Math.max(0, slack));
          const sizes = rel.map((r) => Math.round(maxArt * r));
          const ground = 8;
          const below = Math.round(titleSize * 0.4);
          const capH = Math.max(
            ...punkte.map((p, k) =>
              caption('', p, cols[k]! - CAPTION_GUTTER, titleSize, textSize, null)
            )
          );
          placed.push({
            height: maxArt + ground + below + capH,
            after: GAP,
            place: (y) => {
              const baseline = y + maxArt;
              addShape(
                rect(`${id}-boden`, column.x, baseline, column.width, ground, badgeColors.fill)
              );
              let cellX = column.x;
              punkte.forEach((punkt, k) => {
                const pid = `${id}-${k}`;
                const cw = cols[k]!;
                const size = sizes[k]!;
                art(`${pid}-bild`, punkt, cellX + (cw - size) / 2, baseline - size, size);
                caption(pid, punkt, cw - CAPTION_GUTTER, titleSize, textSize, {
                  x: cellX + CAPTION_GUTTER / 2,
                  y: baseline + ground + below,
                  align: 'center',
                });
                cellX += cw;
              });
            },
          });
          break;
        }
        case 'vergleich': {
          // Two panels side by side: the opponent's plan left, ours right.
          const sides = [
            { key: 'links' as const, side: item.links, ...contrastPanel('theirs') },
            { key: 'rechts' as const, side: item.rechts, ...contrastPanel('ours') },
          ];
          const panelGap = 24;
          const pad = 36;
          const panelWidth = (column.width - panelGap) / 2;
          const inner = panelWidth - 2 * pad;
          const titleSize = largestSizeWordsFit(
            [item.links.titel, item.rechts.titel],
            Math.round(46 * Math.min(scale, 1.2)),
            inner,
            0,
            (w, s) => measure(w, s, headFamily, 'bold')
          );
          const titleLeading = 1.05;
          const titleHeight = Math.max(
            ...sides.map(
              (s) =>
                lineCount(s.side.titel, inner, titleSize, headFamily, 'normal', s.accent) *
                titleSize *
                titleLeading
            )
          );
          const markerAt = (s: number) => Math.round(s * 1.1);
          const indentAt = (s: number) => markerAt(s) + Math.round(s * 0.4);
          const wantedPoint = Math.round(34 * Math.min(scale, 1.2));
          const pointSize = largestSizeWordsFit(
            [...item.links.punkte, ...item.rechts.punkte],
            wantedPoint,
            inner,
            indentAt(wantedPoint),
            (w, s) => measure(w, s, theme.fonts.body, 'bold')
          );
          const marker = markerAt(pointSize);
          const indent = indentAt(pointSize);
          const lineStep = pointSize * 1.25;
          const pointGap = Math.round(pointSize * 0.6);
          const rowsOf = (s: (typeof sides)[number]) =>
            s.side.punkte.map(
              (p) =>
                lineCount(p, inner - indent, pointSize, theme.fonts.body, 'normal', s.accent) *
                lineStep
            );
          const pointsTop = pad + titleHeight + Math.round(titleSize * 0.5);
          const height =
            pointsTop +
            Math.max(
              ...sides.map((s) => {
                const rows = rowsOf(s);
                return rows.reduce((sum, r) => sum + r, 0) + pointGap * (rows.length - 1);
              })
            ) +
            pad;
          placed.push({
            height,
            after: GAP,
            place: (y) => {
              sides.forEach((s, i) => {
                const sideId = `${id}-${s.key}`;
                const x = column.x + i * (panelWidth + panelGap);
                const panel = createShape(
                  'rounded-rect',
                  x + panelWidth / 2,
                  y + height / 2,
                  s.fill,
                  s.fill
                );
                Object.assign(panel, {
                  id: `${sideId}-card`,
                  width: panelWidth,
                  height,
                  cornerRadius: 32,
                  opacity: s.fillOpacity,
                });
                addShape(panel);
                const inPanel = {
                  type: 'body' as const,
                  fill: s.ink,
                  opacity: s.inkOpacity,
                  accent: s.accent,
                };
                out.additionalTexts.push({
                  ...inPanel,
                  id: `${sideId}-titel`,
                  text: s.side.titel,
                  x: x + pad,
                  y: y + pad,
                  width: inner,
                  fontSize: titleSize,
                  fontFamily: headFamily,
                  fontStyle: 'normal',
                  lineHeight: titleLeading,
                  align: 'center',
                });
                out.layerOrder.push(`${sideId}-titel`);
                const rows = rowsOf(s);
                let rowTop = y + pointsTop;
                s.side.punkte.forEach((punkt, k) => {
                  const pointId = `${sideId}-${k}`;
                  addIcon(
                    `${pointId}-marker`,
                    s.marker,
                    x + pad + marker / 2,
                    rowTop + lineStep / 2,
                    marker,
                    s.ink,
                    s.inkOpacity
                  );
                  out.additionalTexts.push({
                    ...inPanel,
                    id: pointId,
                    text: punkt,
                    x: x + pad + indent,
                    y: rowTop,
                    width: inner - indent,
                    fontSize: pointSize,
                    fontFamily: theme.fonts.body,
                    fontStyle: 'normal',
                    lineHeight: 1.25,
                  });
                  out.layerOrder.push(pointId);
                  rowTop += rows[k]! + pointGap;
                });
              });
            },
          });
          break;
        }
        case 'faktencheck': {
          // Each claim above its correction, full width: the claim faint with ✗
          // under „Mythos“, the fact on the accent with ✓ under „Fakt“.
          const pad = 32;
          const inner = column.width - 2 * pad;
          const labelSize = Math.round(32 * Math.min(scale, 1.2));
          const marker = Math.round(labelSize * 1.15);
          const textSize = largestSizeWordsFit(
            item.paare.flatMap((p) => [p.mythos, p.fakt]),
            Math.round(38 * Math.min(scale, 1.2)),
            inner,
            0,
            (w, size) => measure(w, size, theme.fonts.body, 'bold')
          );
          const labelGap = Math.round(textSize * 0.45);
          const cards = item.paare.flatMap((paar, k) =>
            (['theirs', 'ours'] as const).map((side) => {
              const style = contrastPanel(side);
              const text = side === 'theirs' ? paar.mythos : paar.fakt;
              // Measured in the weight it is set in: the fact is bold.
              const weight = side === 'ours' ? 'bold' : 'normal';
              const textH =
                lineCount(text, inner, textSize, theme.fonts.body, weight, style.accent) *
                textSize *
                1.25;
              return {
                id: `${id}-${k}-${side === 'theirs' ? 'mythos' : 'fakt'}`,
                label: side === 'theirs' ? 'Mythos' : 'Fakt',
                text,
                style,
                height: pad + marker + labelGap + textH + pad,
                pairEnd: side === 'ours',
              };
            })
          );
          const cardGap = 12;
          const pairGap = Math.round(36 * Math.min(scale, 1.2));
          const gaps = cards.slice(0, -1).map((c) => (c.pairEnd ? pairGap : cardGap));
          placed.push({
            height: cards.reduce((sum, c) => sum + c.height, 0) + gaps.reduce((a, b) => a + b, 0),
            after: GAP,
            place: (y) => {
              let top = y;
              cards.forEach((card, k) => {
                const { style } = card;
                const panel = createShape(
                  'rounded-rect',
                  column.x + column.width / 2,
                  top + card.height / 2,
                  style.fill,
                  style.fill
                );
                Object.assign(panel, {
                  id: `${card.id}-card`,
                  width: column.width,
                  height: card.height,
                  cornerRadius: 28,
                  opacity: style.fillOpacity,
                });
                addShape(panel);
                addIcon(
                  `${card.id}-marker`,
                  style.marker,
                  column.x + pad + marker / 2,
                  top + pad + marker / 2,
                  marker,
                  style.ink,
                  style.inkOpacity
                );
                const inCard = {
                  type: 'body' as const,
                  fill: style.ink,
                  opacity: style.inkOpacity,
                  accent: style.accent,
                  fontFamily: theme.fonts.body,
                };
                out.additionalTexts.push({
                  ...inCard,
                  id: `${card.id}-label`,
                  text: card.label,
                  x: column.x + pad + marker + 12,
                  y: top + pad + (marker - labelSize * 1.2) / 2,
                  width: inner - marker - 12,
                  fontSize: labelSize,
                  fontStyle: 'bold',
                  lineHeight: 1.2,
                  align: 'left',
                });
                out.layerOrder.push(`${card.id}-label`);
                out.additionalTexts.push({
                  ...inCard,
                  id: `${card.id}-text`,
                  text: card.text,
                  x: column.x + pad,
                  y: top + pad + marker + labelGap,
                  width: inner,
                  fontSize: textSize,
                  fontStyle: card.label === 'Fakt' ? 'bold' : 'normal',
                  lineHeight: 1.25,
                  align: 'left',
                });
                out.layerOrder.push(`${card.id}-text`);
                top += card.height + (gaps[k] ?? 0);
              });
            },
          });
          break;
        }
        case 'aufruf': {
          const family = headFamily;
          const lineHeight = isAt ? 0.98 : 1;
          const size = largestSizeWordsFit(
            [item.text],
            Math.round(Math.min(item.stil === 'kernsatz' ? 120 : 104, 82 * scale)),
            column.width,
            0,
            (w, s) => measure(w, s, family, 'bold')
          );
          const lines = lineCount(item.text, column.width, size, family, 'normal');
          const accentInk = isAt
            ? onLight
              ? theme.colors.secondary
              : theme.colors.accent
            : onLight
              ? KLEE
              : onGrass
                ? '#FFFFFF'
                : LIME;
          if (item.stil === 'ausruf') {
            // A huge "!" over the demand, in the accent — the posts' closing call.
            const bang = Math.round(Math.min(size * 3.6, 460));
            placed.push({
              height: bang * 0.82,
              after: Math.round(size * 0.2),
              place: (y) =>
                text(`${id}-ausruf`, '!', y - bang * 0.12, bang, family, {
                  fill: accentInk,
                  lineHeight: 1,
                  type: 'header',
                }),
            });
          }
          if (item.adressat) {
            const small = Math.round(size * 0.42);
            const adressat = item.adressat;
            placed.push({
              height:
                lineCount(adressat, column.width, small, theme.fonts.body, 'bold') * small * 1.15,
              after: Math.round(size * 0.18),
              place: (y) =>
                text(`${id}-adressat`, adressat, y, small, theme.fonts.body, {
                  fontStyle: 'bold',
                  lineHeight: 1.15,
                }),
            });
          }
          placed.push({
            height: lines * size * lineHeight,
            after: Math.round(size * 0.4),
            place: (y) => text(id, item.text, y, size, family, { lineHeight, type: 'header' }),
          });
          if (item.hinweis && item.stil === 'petition' && !isAt) {
            // DE: the hint as a pill under the call — where to sign.
            const pillSize = Math.round(Math.min(46, size * 0.5));
            const hint = item.hinweis;
            const pill = createPillBadgeInstance('slider', {
              id: `${id}-hinweis`,
              text: hint,
              fontSize: pillSize,
              fontFamily: theme.fonts.headline,
              backgroundColor: onLight ? theme.colors.primary : isAt ? theme.colors.accent : LIME,
              textColor: onLight
                ? '#FFFFFF'
                : isAt
                  ? theme.colors.primary
                  : SHAREPIC_COLOR_HEX.dunkeltanne,
              paddingX: 36,
              paddingY: 18,
              cornerRadius: 60,
            });
            const height = pillSize + 2 * pill.paddingY;
            const width =
              measure(hint, pillSize, theme.fonts.headline, 'normal') + 2 * pill.paddingX;
            placed.push({
              height,
              after: GAP,
              place: (y) => {
                const x = xAlign === 'center' ? column.x + column.width / 2 - width / 2 : column.x;
                out.pillBadgeInstances.push({ ...pill, x, y });
                out.layerOrder.push(`${id}-hinweis`);
              },
            });
          } else if (item.hinweis) {
            // AT has no pills: the hint is a line, on a petition in the yellow serif.
            const petitionAt = isAt && item.stil === 'petition';
            const small = Math.round(size * (petitionAt ? 0.55 : 0.4));
            const hint = item.hinweis;
            placed.push({
              height: small * 1.2,
              after: GAP,
              place: (y) =>
                petitionAt
                  ? text(`${id}-hinweis`, hint, y, small, theme.fonts.quoteEmphasis, {
                      fontStyle: AT_EMPHASIS_STYLE,
                      fill: accentInk,
                      lineHeight: 1.2,
                    })
                  : text(`${id}-hinweis`, hint, y, small, theme.fonts.body, {
                      fontStyle: 'bold',
                      lineHeight: 1.2,
                    }),
            });
          }
          break;
        }
        case 'button': {
          const size = 44;
          const pill = createPillBadgeInstance('slider', {
            id,
            text: item.text,
            fontSize: size,
            fontFamily: theme.fonts.headline,
            backgroundColor: onLight ? theme.colors.primary : isAt ? theme.colors.accent : LIME,
            textColor: onLight
              ? '#FFFFFF'
              : isAt
                ? theme.colors.primary
                : SHAREPIC_COLOR_HEX.dunkeltanne,
            paddingX: 36,
            paddingY: 18,
            cornerRadius: 60,
          });
          const height = size + 2 * pill.paddingY;
          const width =
            measure(item.text, size, theme.fonts.headline, 'normal') + 2 * pill.paddingX;
          placed.push({
            height,
            after: GAP,
            place: (y) => {
              const x = xAlign === 'center' ? column.x + column.width / 2 - width / 2 : column.x;
              out.pillBadgeInstances.push({ ...pill, x, y });
              out.layerOrder.push(id);
            },
          });
          break;
        }
      }
    });
    return placed;
  };

  const heightOf = (group: Placed[]) =>
    group.reduce((sum, p) => sum + p.height + p.after, 0) - (group[group.length - 1]?.after ?? 0);
  // A centred block would rise into the top corner of a DE Störer: keep at
  // least its smallest circle free (a bottom block reaches it only when full).
  const stoererCorner =
    spec.stoerer && position === 'mitte' && !isAt
      ? areaTop + MARGIN + 2 * STOERER_RADII.at(-1)! - 30 + GAP
      : 0;
  const top = Math.max(
    (areaTop === 0 ? TOP_PAD[locale] : areaTop + MARGIN) +
      (spec.stoerer && position === 'oben' ? 40 : 0),
    stoererCorner
  );
  const bottom = areaBottom - MARGIN;
  // Story and argument slides fill the frame like the posts do (measured:
  // the block takes 60–70 % of the height on a colour): paragraphs grow until
  // it reaches the target share of the free height.
  const room = bottom - top;
  const target = quoteAlone
    ? 0.55
    : boxed
      ? 0.6
      : bg.kind === 'foto-unten'
        ? 0.92
        : bg.kind === 'foto'
          ? 0.55
          : 0.85;
  let placed: Placed[] | null = null;
  // Fine steps: coarse ones drop a size too far when one step just misses.
  for (let scale = 1.8; scale > 1 && !placed; scale -= 0.05) {
    const group = build(scale);
    if (heightOf(group) <= room * target) placed = group;
  }
  // Too tall at the base scale: a chart gives up height first, then the
  // headline, then the rest.
  const chartShrink = spec.items.some((i) => i.type === 'diagramm')
    ? Math.max(0, heightOf(build(1)) - room)
    : 0;
  for (let headScale = 1; headScale >= 0.6 && !placed; headScale -= 0.05) {
    const group = build(1, chartShrink, headScale);
    if (heightOf(group) <= room) placed = group;
  }
  for (let scale = 0.95; scale >= 0.6 && !placed; scale -= 0.05) {
    const group = build(scale, chartShrink, 0.6);
    if (heightOf(group) <= room) placed = group;
  }
  placed ??= build(0.6, chartShrink, 0.6);
  const total = heightOf(placed);
  // A block on a plain colour slide sits in the middle, not pinned to the top
  // margin (AT always, DE when short); `unten` stays (logo/arrow layouts are
  // built around it), and a headline alone stays at the top.
  const centred =
    bg.kind === 'farbe' &&
    position !== 'unten' &&
    !headlineAlone &&
    (isAt || total < (bottom - top) * 0.5);
  let y =
    position === 'oben' && !centred
      ? top
      : position === 'unten'
        ? Math.max(top, bottom - total)
        : Math.max(top, (top + bottom) / 2 - total / 2);
  const blockTop = y;
  for (const item of placed) {
    item.place(y);
    y += item.height + item.after;
  }
  // Top/bottom text: dense across the measured block plus a gutter, from the
  // slide edge nearest the block — position and text side are independent, so
  // the block can sit away from `textSeite`; a block near the middle keeps it.
  if (scrimSide) {
    const centre = blockTop + total / 2;
    const side =
      Math.abs(centre - canvas.height / 2) < canvas.height * 0.1
        ? scrimSide
        : centre < canvas.height / 2
          ? 'oben'
          : 'unten';
    setScrim(
      side,
      side === 'unten' ? canvas.height - blockTop + SCRIM_GUTTER : blockTop + total + SCRIM_GUTTER
    );
  }

  // ── Extras ───────────────────────────────────────────────────────────────
  if (spec.stoerer) {
    // Opposite corner from the text group, so it never covers it.
    const atBottom = position === 'oben';
    const centreAt = (r: number) => ({
      x: canvas.width - MARGIN - r + 30,
      y: atBottom ? canvas.height - FOOTER - r : areaTop + MARGIN + r - 30,
    });
    // DE grows towards the posts' Störer (about 40 % of the width) as far as
    // the text block leaves room, and shrinks below 125 rather than cover a
    // block that reaches its corner; the block counts as full width.
    const clearsBlock = (r: number) =>
      atBottom ? centreAt(r).y - r >= blockTop + total : centreAt(r).y + r <= blockTop;
    const stoererText = spec.stoerer.text;
    const fitted = new Map<string, ReturnType<typeof fitStoererText>>();
    const fitAt = (r: number, minSize = STOERER_MIN_READABLE) => {
      const key = `${r}:${minSize}`;
      if (!fitted.has(key)) {
        fitted.set(
          key,
          fitStoererText(
            stoererText,
            r,
            (l, s) => measure(l, s, theme.fonts.headline, 'bold'),
            Math.round(r * STOERER_MAX_SIZE_SHARE),
            minSize
          )
        );
      }
      return fitted.get(key) ?? null;
    };
    // A long text gets smaller type before its circle covers the block; only
    // a text that fits no circle beside the block (one long word) takes the
    // largest circle that holds it.
    const radius = isAt
      ? 125
      : (STOERER_RADII.find((r) => clearsBlock(r) && fitAt(r)) ??
        STOERER_RADII.find((r) => clearsBlock(r) && fitAt(r, 20)) ??
        STOERER_RADII[0]!);
    // AT keeps its own Störer. DE follows the current posts: Grasgrün with
    // Dunkeltanne text (Tanne with white on a grass-green surface), 7°
    // ascending (Konva turns clockwise, so negative), text within 90 %.
    const deColors = onGrass
      ? { background: COLORS.TANNE, text: '#FFFFFF' }
      : { background: theme.colors.stoerer, text: SHAREPIC_COLOR_HEX.dunkeltanne };
    const { lines, size } = isAt
      ? {
          lines: wrapWords(spec.stoerer.text, radius * 1.45, (l) =>
            measure(l, 38, theme.fonts.headline, 'normal')
          ).slice(0, 3),
          size: 38,
        }
      : (fitAt(radius) ??
        fitAt(radius, 20) ??
        fitAt(radius, 1) ?? { lines: [stoererText], size: 1 });
    out.circleBadgeInstances.push(
      createCircleBadgeInstance('default', {
        id: 'sc-stoerer',
        ...centreAt(radius),
        radius,
        rotation: isAt ? -8 : -7,
        backgroundColor: isAt ? theme.colors.stoerer : deColors.background,
        textColor: isAt ? '#FFFFFF' : deColors.text,
        textLines: lines.map((value, i) => ({
          text: value,
          yOffset: (i - (lines.length - 1) / 2) * size * STOERER_LINE_STEP,
          fontFamily: theme.fonts.headline,
          fontSize: size,
          fontWeight: 'bold' as const,
        })),
      })
    );
    out.layerOrder.push('sc-stoerer');
  }

  if (spec.datum && circle) {
    // DE: Tanne on light and grass-green ground, grass green on dark ground
    // and photos — never a third colour. AT keeps its magenta.
    const circleColors = isAt
      ? { background: theme.colors.stoerer, text: VERANSTALTUNG_CONFIG.circle.textColor }
      : surface === 'foto' || surface === 'tanne' || surface === 'dunkeltanne'
        ? { background: SHAREPIC_COLOR_HEX.grasgruen, text: COLORS.TANNE }
        : { background: COLORS.TANNE, text: '#ffffff' };
    const c = VERANSTALTUNG_CONFIG.circle;
    const t = VERANSTALTUNG_CONFIG.circleText;
    // The template's type is set for its radius; a smaller circle scales it.
    const k = circle.radius / c.radius;
    // Only what is present, centred on the circle: three lines keep the
    // template offsets, a pair or a single line sits symmetrically.
    const { weekday, date, time } = spec.datum;
    const present = [
      ...(weekday === undefined
        ? []
        : [{ text: weekday, spec: t.weekday, fontWeight: 'bold' as const }]),
      ...(date === undefined ? [] : [{ text: date, spec: t.date, fontWeight: 'normal' as const }]),
      ...(time === undefined ? [] : [{ text: time, spec: t.time, fontWeight: 'bold' as const }]),
    ];
    const pairOffsets = [-35, 40];
    const circleLines = present.map((line, i) => ({
      text: line.text,
      yOffset: Math.round(
        (present.length === 3 ? line.spec.yOffset : present.length === 2 ? pairOffsets[i]! : 0) * k
      ),
      // AT sets the whole circle in the poster face (Dc_L5vriG5z), which is
      // its own weight — a synthetic bold on top would only smear it.
      fontFamily: isAt ? theme.fonts.headline : theme.fonts.body,
      fontSize: Math.round(line.spec.fontSize * k),
      fontWeight: isAt ? ('normal' as const) : line.fontWeight,
    }));
    out.circleBadgeInstances.push(
      createCircleBadgeInstance('default', {
        id: 'sc-datum',
        x: circle.x,
        y: circle.y,
        radius: circle.radius,
        rotation: c.rotation,
        backgroundColor: circleColors.background,
        textColor: circleColors.text,
        textLines: circleLines,
      })
    );
    out.layerOrder.push('sc-datum');
  }

  if (spec.ort) {
    const size = 38;
    const height = spec.ort.lines.length * size * 1.25;
    // Beside a free date circle the place reads with it: right-aligned to the
    // circle, on its middle. Otherwise it stacks bottom-left above the label.
    const beside = ortBesideCircle && circle;
    const right = circle ? circle.x - circle.radius - 30 : canvas.width - MARGIN - 200;
    out.additionalTexts.push({
      id: 'sc-ort',
      text: spec.ort.lines.join('\n'),
      type: 'body',
      x: footX,
      y: beside ? circle.y - height / 2 : ortBottom - height,
      width: right - footX,
      fontSize: size,
      fontFamily: theme.fonts.body,
      fontStyle: 'normal',
      fill: textColor,
      lineHeight: 1.25,
      ...(beside ? { align: 'right' as const } : {}),
      ...shadow,
    });
    out.layerOrder.push('sc-ort');
  }

  if (showLogo) {
    out.assetInstances.push({
      id: 'sc-logo',
      assetId: isAt
        ? footerOnLight
          ? 'gruene-at-logo-gruen'
          : 'gruene-at-logo-weiss'
        : footerOnLight
          ? 'sunflower-green'
          : 'sunflower',
      x: logoCentred ? canvas.width / 2 : MARGIN + logo.size / 2,
      // x/y is the centre.
      y: canvas.height - logo.bottom - logo.height / 2,
      scale: logo.size / ASSET_TARGET_SIZE,
      rotation: 0,
      opacity: 1,
    });
    out.layerOrder.push('sc-logo');
  }
  if (swipeOn) {
    // Bottom-right, centred on x/y: AT a long brush stroke, DE a small arrow
    // near the corner.
    const { size, right, bottom, glyph } = arrow;
    const x = canvas.width - right - (size * glyph) / 2;
    const y = canvas.height - bottom - size * 0.08;
    if (isAt) {
      out.assetInstances.push({
        id: 'sc-pfeil',
        assetId: footerOnLight ? BRUSH_ARROW.onLight : BRUSH_ARROW.onDark,
        x,
        y,
        // The asset is drawn edge to edge; its width is the longer side.
        scale: (size * glyph) / ASSET_TARGET_SIZE,
        rotation: 0,
        opacity: 1,
      });
    } else {
      out.selectedIcons.push('sc-pfeil');
      out.iconStates['sc-pfeil'] = {
        iconId: ARROW_ICON,
        x,
        y,
        scale: size / 120,
        rotation: 0,
        color: footerDarkInk ? darkText : '#FFFFFF',
      };
    }
    out.layerOrder.push('sc-pfeil');
    if (weiter) {
      // Right-aligned against the arrow, on its line.
      out.additionalTexts.push({
        id: 'sc-weiter',
        text: weiterLines.join('\n'),
        type: 'body',
        x: weiterRight - weiterWidth - 4,
        y: y - weiterSize * 0.6 - (weiterLines.length - 1) * weiterSize * 1.2,
        width: weiterWidth + 8,
        fontSize: weiterSize,
        fontFamily: theme.fonts.body,
        fontStyle: 'bold',
        fill: footerDarkInk ? darkText : '#FFFFFF',
        align: 'right',
        lineHeight: 1.2,
        ...shadow,
      });
      out.layerOrder.push('sc-weiter');
    }
  }

  if (page) {
    // Top corner, clear of a Störer: right unless the Störer owns it.
    const ink = darkInk ? darkText : '#FFFFFF';
    const stoererTop = !!spec.stoerer && position !== 'oben';
    const y = 44;
    if (page.style === 'bruch') {
      const label = `${page.index + 1}/${page.count}`;
      const size = 30;
      const width = measure(label, size, theme.fonts.body, 'bold') + 8;
      out.additionalTexts.push({
        id: 'sc-seite',
        text: label,
        type: 'body',
        x: stoererTop ? MARGIN : canvas.width - MARGIN - width,
        y,
        width,
        fontSize: size,
        fontFamily: theme.fonts.body,
        fontStyle: 'bold',
        fill: ink,
        opacity: 0.85,
        align: stoererTop ? 'left' : 'right',
        lineHeight: 1,
        ...shadow,
      });
      out.layerOrder.push('sc-seite');
    } else {
      // A row of dots, the current one full.
      const dot = 14;
      const gap = 12;
      const rowWidth = page.count * dot + (page.count - 1) * gap;
      const startX = canvas.width / 2 - rowWidth / 2;
      for (let k = 0; k < page.count; k++) {
        const current = k === page.index;
        const disc = createShape(
          'circle',
          startX + k * (dot + gap) + dot / 2,
          y + dot / 2,
          ink,
          ink
        );
        addShape(
          Object.assign(disc, {
            id: `sc-seite-${k}`,
            width: dot,
            height: dot,
            opacity: current ? 1 : 0.35,
          })
        );
      }
    }
  }

  if (spec.quelle) {
    const size = quelleSize;
    out.additionalTexts.push({
      id: 'sc-quelle',
      text: quelleText,
      type: 'body',
      x: footX,
      y: quelleY,
      width: quelleWidth,
      fontSize: size,
      fontFamily: theme.fonts.body,
      fontStyle: 'normal',
      fill: textColor,
      opacity: 0.8,
      lineHeight: 1.2,
      ...shadow,
    });
    out.layerOrder.push('sc-quelle');
  }

  if (kiText) {
    const { fontSize, margin, paddingX, paddingY, radius } = KI_LABEL;
    const width = measure(kiText, fontSize, KI_LABEL.fontFamily, 'bold') + 2 * paddingX;
    const plate = createShape(
      'rounded-rect',
      margin + width / 2,
      kiTop + kiHeight / 2,
      '#2B2B2B',
      '#2B2B2B'
    );
    Object.assign(plate, {
      id: 'sc-ki-label-bg',
      width,
      height: kiHeight,
      cornerRadius: radius,
      // Lighter on dark ground and photos; light ground keeps the server
      // label's plate, or the white text would lose its contrast.
      opacity: darkInk ? 0.55 : 0.4,
    });
    addShape(plate);
    out.additionalTexts.push({
      id: 'sc-ki-label',
      text: kiText,
      type: 'body',
      x: margin + paddingX,
      y: kiTop + paddingY,
      width: width - 2 * paddingX + 4,
      fontSize,
      fontFamily: KI_LABEL.fontFamily,
      fontStyle: 'bold',
      fill: '#FFFFFF',
      opacity: 0.85,
      lineHeight: 1,
    });
    out.layerOrder.push('sc-ki-label');
  }

  return out;
}
