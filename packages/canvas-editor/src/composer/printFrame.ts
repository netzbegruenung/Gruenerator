/**
 * What every print layout builds on: the page in trim, bleed and margin
 * (`frame`), the page being filled (`page`), stacks of text measured in the
 * brand fonts, and the turned V.i.S.d.P. / Impressum line.
 *
 * Pure: no React, no Konva. Text is measured through the injected `measure`.
 */
import { type PrintImpressum, type PrintKontakt } from '@gruenerator/contracts';

import { getBrandTheme, type BrandTheme } from '../brand/theme';
import { mmToPx, printGeometry, type PrintCanvasFormat, type PrintRect } from '../formats';
import { type CircleBadgeInstance } from '../primitives/CircleBadge';
import { ASSET_TARGET_SIZE } from '../utils/canvasAssets';
import { createCircleBadgeInstance } from '../utils/circleBadgeUtils';
import { createShape, type ShapeInstance } from '../utils/shapes';
import { type TextAccent } from '../utils/textUtils';
import { type UserImageInstance } from '../utils/userImageUtils';

import { layoutTextLines, type MeasureText } from './chromeParts';
import { fitStoererText, STOERER_LINE_STEP, type ComposedSlide } from './composeSharepic';

import type { AdditionalText } from '../configs/types';

/** Element id of the poster's V.i.S.d.P. / Impressum line; later steps find and update it by this. */
export const PRINT_IMPRESSUM_ID = 'impressum';

/** Longer side ÷ shorter side of the logo and flower artwork (`apps/web/public`). */
export const ART = {
  deLogo: { w: 710, h: 379 },
  atLogo: { w: 1410, h: 1239 },
  sunflower: { w: 2000, h: 2015 },
} as const;

const PT_IN_MM = 25.4 / 72;
export const WHITE = '#FFFFFF';
/** DE styleguide p. 11. */
export const KLEE = '#008939';
export const SAND = '#F5F1E9';
export const HIMMEL = '#0BA1DD';
/** Headline leading of the lab: GrueneTypeNeue 1.05, Gotham Ultra 1. */
export const HEAD_LEADING = { 'de-DE': 1.05, 'de-AT': 1 } as const;
export const BODY_LEADING = 1.3;

export interface Page {
  out: ComposedSlide;
  text: (props: AdditionalText) => void;
  /** An asset centred on x/y whose longer side is `size` px. */
  asset: (id: string, assetId: string, x: number, y: number, size: number) => void;
  shape: (shape: ShapeInstance) => void;
  badge: (badge: CircleBadgeInstance) => void;
  image: (image: UserImageInstance) => void;
}

export function page(backgroundColor: string): Page {
  const out: ComposedSlide = {
    backgroundMode: 'color',
    backgroundColor,
    hasBackgroundImage: false,
    imageAttribution: null,
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
  return {
    out,
    text: (props) => {
      out.additionalTexts.push(props);
      out.layerOrder.push(props.id);
    },
    asset: (id, assetId, x, y, size) => {
      out.assetInstances.push({
        id,
        assetId,
        x,
        y,
        scale: size / ASSET_TARGET_SIZE,
        rotation: 0,
        opacity: 1,
      });
      out.layerOrder.push(id);
    },
    shape: (shape) => {
      out.shapeInstances.push(shape);
      out.layerOrder.push(shape.id);
    },
    badge: (badge) => {
      out.circleBadgeInstances.push(badge);
      out.layerOrder.push(badge.id);
    },
    image: (image) => {
      out.userImageInstances.push(image);
      out.layerOrder.push(image.id);
    },
  };
}

/** What every print layout measures against. */
export interface Frame {
  format: PrintCanvasFormat;
  isAt: boolean;
  theme: BrandTheme;
  measure: MeasureText;
  trim: PrintRect;
  /** The trim box less the margin: where text and logos go. */
  inner: PrintRect;
  margin: number;
  /** Type unit: short trim side / 24. */
  u: number;
  pt: (points: number) => number;
  shortSide: number;
}

export function frame(format: PrintCanvasFormat, isAt: boolean, measure: MeasureText): Frame {
  const px = (mm: number) => mmToPx(format, mm);
  const { trim, safe } = printGeometry(format);
  const shortMm = Math.min(format.print.trimMm.w, format.print.trimMm.h);
  const u = px(shortMm / 24);
  const cdMargin = isAt ? px(shortMm * 0.06) : Math.max(1.6 * u, px(4));
  const margin = Math.max(cdMargin, safe.x - trim.x);
  return {
    format,
    isAt,
    theme: getBrandTheme(isAt ? 'de-AT' : 'de-DE'),
    measure,
    trim,
    inner: {
      x: trim.x + margin,
      y: trim.y + margin,
      width: trim.width - 2 * margin,
      height: trim.height - 2 * margin,
    },
    margin,
    u,
    pt: (points) => px(points * PT_IN_MM),
    shortSide: px(shortMm),
  };
}

/** A text to stack: its props without position, and the height it takes at a width. */
export interface Block {
  props: Omit<AdditionalText, 'x' | 'y' | 'width'>;
  /** Space above, when something precedes it. */
  before: number;
}

export function blockHeight(f: Frame, block: Block, width: number): number {
  const { text, fontSize, fontFamily, fontStyle, lineHeight, accent } = block.props;
  const lines = layoutTextLines(
    f.measure,
    text,
    width,
    fontSize,
    fontFamily,
    fontStyle ?? 'normal',
    accent ?? null
  );
  return lines.length * fontSize * (lineHeight ?? 1.2);
}

export function stackHeight(f: Frame, blocks: Block[], width: number): number {
  return blocks.reduce(
    (sum, block, i) => sum + (i > 0 ? block.before : 0) + blockHeight(f, block, width),
    0
  );
}

/** Places `blocks` top-down from `y`; returns the bottom edge. */
export function placeStack(
  p: Page,
  f: Frame,
  blocks: Block[],
  x: number,
  y: number,
  width: number
) {
  let cursor = y;
  blocks.forEach((block, i) => {
    if (i > 0) cursor += block.before;
    p.text({ ...block.props, x, y: cursor, width });
    cursor += blockHeight(f, block, width);
  });
  return cursor;
}

/**
 * A stack laid out from `top`, each text as wide as `widthAt` allows where it
 * starts (narrower beside a flower), its type shrunk until every word fits.
 */
export function layoutStack(
  f: Frame,
  blocks: Block[],
  top: number,
  widthAt: (y: number) => number
): { items: AdditionalText[]; bottom: number } {
  let cursor = top;
  const items = blocks.map((block, i) => {
    if (i > 0) cursor += block.before;
    const width = widthAt(cursor);
    const { text, fontSize, fontFamily } = block.props;
    const sized: Block = {
      ...block,
      props: {
        ...block.props,
        fontSize: wordsFit(f, text, fontSize, width, fontFamily, block.props.accent ?? null),
      },
    };
    const item = { ...sized.props, x: f.inner.x, y: cursor, width };
    cursor += blockHeight(f, sized, width);
    return item;
  });
  return { items, bottom: cursor };
}

/**
 * Largest size ≤ `size` at which every word of `text` fits `width` on its own.
 * Words marked `==…==` are measured in the accent's face (AT: Vollkorn Black
 * Italic runs wider than Gotham).
 */
export function wordsFit(
  f: Frame,
  text: string,
  size: number,
  width: number,
  family: string,
  accent: TextAccent | null = null
): number {
  const measured = text
    .replace(/\*\*/g, '')
    .split(/(==[^=]*==)/)
    .flatMap((part) => {
      const marked = part.startsWith('==') && part.endsWith('==') && part.length > 4;
      const face = marked
        ? { family: accent?.fontFamily ?? family, style: accent?.fontStyle ?? 'normal' }
        : { family, style: 'normal' as const };
      return part
        .replace(/==/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => f.measure(w, size, face.family, face.style));
    });
  const widest = Math.max(1, ...measured);
  return widest > width ? (size * width) / widest : size;
}

/** The headline with its accent words marked `==…==` (first occurrence; absent: unmarked). */
export function withAccent(headline: string, akzent: string | undefined): string {
  const word = akzent?.trim();
  if (!word || !headline.includes(word)) return headline;
  return headline.replace(word, `==${word}==`);
}

/**
 * The poster's V.i.S.d.P. / Impressum line: PT Sans / Gotham Book, 8 pt up to
 * A3 and 10 pt above (DE guide p. 10), turned to read bottom-up, centred in the
 * left margin, starting half a margin above the trim bottom. Rotation turns
 * around x/y, the text's top-left.
 */
export function impressumElement(f: Frame, text: string): AdditionalText {
  const { trim, theme } = f;
  const { w, h } = f.format.print.trimMm;
  const size = f.pt(w * h > 297 * 420 ? 10 : 8);
  const lineHeight = 1.2;
  // Centred in the margin, but never closer to the edge than the safe zone.
  const safe = mmToPx(f.format, f.format.print.safeMm);
  const inset = Math.max(f.margin / 2, safe + (size * lineHeight) / 2);
  const end = Math.max(f.margin / 2, safe);
  return {
    id: PRINT_IMPRESSUM_ID,
    text,
    type: 'body',
    // The folded flyer carries it on the back panel, along the fold to the title (CD p. 29).
    x:
      f.format.id === 'print-flyer-dinlang'
        ? trim.x + mmToPx(f.format, 197) - inset - (size * lineHeight) / 2
        : trim.x + inset - (size * lineHeight) / 2,
    y: trim.y + trim.height - end,
    // The billboard is pasted from four parts (CD p. 43): no text across its horizontal join.
    width:
      f.format.id === 'print-grossflaeche'
        ? trim.height / 2 - end - f.margin / 2
        : trim.height - 2 * end,
    fontSize: size,
    fontFamily: theme.fonts.body,
    fontStyle: 'normal',
    fill: WHITE,
    lineHeight,
    rotation: -90,
  };
}

export function impressumText(impressum: PrintImpressum): string {
  return impressum.art === 'visdp'
    ? `V.i.S.d.P.: ${impressum.name}, ${impressum.anschrift}`
    : `Impressum: ${impressum.medieninhaber}, ${impressum.anschrift}`;
}

// ── Poster parts ──────────────────────────────────────────────────────────────

/** Where a photo slot loads from. */
export type PhotoSrc = (foto: string) => string;

/** Share of the trim box: 0 and 1 reach into the bleed. */
export interface Area {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FULL: Area = { x0: 0, x1: 1, y0: 0, y1: 1 };

/** The area in canvas px; an edge at 0 or 1 runs out into the bleed. */
export function areaRect(f: Frame, a: Area): Rect {
  const { trim, format } = f;
  const x = a.x0 <= 0 ? 0 : trim.x + a.x0 * trim.width;
  const y = a.y0 <= 0 ? 0 : trim.y + a.y0 * trim.height;
  const right = a.x1 >= 1 ? format.width : trim.x + a.x1 * trim.width;
  const bottom = a.y1 >= 1 ? format.height : trim.y + a.y1 * trim.height;
  return { x, y, width: right - x, height: bottom - y };
}

export function rect(id: string, r: Rect, fill: string) {
  const shape = createShape('rect', r.x + r.width / 2, r.y + r.height / 2, fill, fill);
  return Object.assign(shape, { id, width: r.width, height: r.height });
}

/**
 * The photo behind everything, centred on the motif area, and the ground
 * panels around it. Moving the cover-fitted photo by half the panel width
 * never uncovers more than the panel hides.
 */
export function motif(
  p: Page,
  f: Frame,
  foto: string,
  area: Area,
  ground: string,
  src: PhotoSrc
): Rect {
  const r = areaRect(f, area);
  const { width, height } = f.format;
  Object.assign(p.out, {
    backgroundMode: 'image',
    backgroundColor: ground,
    hasBackgroundImage: true,
    currentImageSrc: src(foto),
    imageScale: 1,
    imageOffset: { x: r.x + r.width / 2 - width / 2, y: r.y + r.height / 2 - height / 2 },
  } satisfies Partial<ComposedSlide>);
  const panels: Rect[] = [
    { x: 0, y: 0, width, height: r.y },
    { x: 0, y: r.y + r.height, width, height: height - r.y - r.height },
    { x: 0, y: r.y, width: r.x, height: r.height },
    { x: r.x + r.width, y: r.y, width: width - r.x - r.width, height: r.height },
  ];
  panels
    .filter((panel) => panel.width > 0.5 && panel.height > 0.5)
    .forEach((panel, i) => p.shape(rect(`pr-grund-${i + 1}`, panel, ground)));
  return r;
}

/**
 * A fade from nothing to `rgb` at `alpha`: towards the foot of `r` (90°), or
 * towards its top (270°).
 */
export function scrim(p: Page, id: string, r: Rect, rgb: string, alpha: number, angle = 90) {
  const shape = rect(id, r, `rgba(${rgb},${alpha})`);
  shape.fillGradient = {
    type: 'linear',
    angle,
    stops: [0, 0.3, 0.6, 1].map((t) => ({
      offset: t,
      color: `rgba(${rgb},${(alpha * t * t * (3 - 2 * t)).toFixed(3)})`,
    })),
  };
  p.shape(shape);
}

export const hexRgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

/** The sunflower in Sonne (CD p. 21), centred on cx/cy as shares of the trim box. */
export function blume(p: Page, f: Frame, cx: number, cy: number, size: number) {
  const { trim } = f;
  const h = (size * ART.sunflower.h) / ART.sunflower.w;
  p.asset(
    'pr-blume',
    'sunflower',
    trim.x + cx * trim.width,
    trim.y + cy * trim.height,
    Math.max(size, h)
  );
}

/**
 * The Störer, its text within 90 % of the circle: DE Himmel with Sand type,
 * tilted 7° (CD p. 15); AT Magenta with white type, tilted 8°.
 */
export function stoerer(
  p: Page,
  f: Frame,
  id: string,
  text: string,
  x: number,
  y: number,
  r: number
) {
  const family = f.theme.fonts.headline;
  const fitted = fitStoererText(
    text,
    r,
    (line, size) => f.measure(line, size, family, 'bold'),
    Math.round(r * 0.6),
    1
  ) ?? { lines: [text], size: Math.round(r * 0.3) };
  p.badge(
    createCircleBadgeInstance('default', {
      id,
      x,
      y,
      radius: r,
      rotation: f.isAt ? -8 : -7,
      backgroundColor: f.isAt ? f.theme.colors.stoerer : HIMMEL,
      textColor: f.isAt ? WHITE : SAND,
      textLines: fitted.lines.map((line, i) => ({
        text: line,
        yOffset: (i - (fitted.lines.length - 1) / 2) * fitted.size * STOERER_LINE_STEP,
        fontFamily: family,
        fontSize: fitted.size,
        fontWeight: 'bold' as const,
      })),
    })
  );
}

/**
 * Each text sized so its longest word fits `width`, with 5 % to spare: the
 * editor breaks a word after a hyphen that the measure keeps on one line.
 */
export function fitWords(f: Frame, blocks: Block[], width: number): Block[] {
  return blocks.map((b) => ({
    ...b,
    props: {
      ...b.props,
      fontSize: wordsFit(
        f,
        b.props.text,
        b.props.fontSize,
        width * 0.95,
        b.props.fontFamily,
        b.props.accent ?? null
      ),
    },
  }));
}

/**
 * The largest stack `build(size)` makes that fits `width` × `maxHeight`, the
 * headline starting at `start` and shrinking in 4 % steps.
 */
export function fitStack(
  f: Frame,
  build: (size: number) => Block[],
  start: number,
  width: number,
  maxHeight: number
): Block[] {
  let size = start;
  let blocks = fitWords(f, build(size), width);
  while (size > start * 0.3 && stackHeight(f, blocks, width) > maxHeight) {
    size *= 0.96;
    blocks = fitWords(f, build(size), width);
  }
  return blocks;
}

/** `v` millimetres in canvas px. */
export const mm = (f: Frame, v: number) => mmToPx(f.format, v);

/** Contact lines: the letter in bold, then the value (CD p. 32 / p. 95). */
const KONTAKT = [
  ['T', 'telefon'],
  ['M', 'mobil'],
  ['E', 'mail'],
  ['W', 'web'],
] as const;

export function kontaktText(slots: PrintKontakt): string | null {
  const lines = KONTAKT.flatMap(([letter, key]) => {
    const value = slots[key];
    return value ? [`**${letter}** ${value}`] : [];
  });
  return lines.length ? lines.join('\n') : null;
}

/**
 * Body copy set in `columns` balanced columns of `width` × `height`, in the
 * editor's own line breaks; paragraphs (blank lines) stay apart. Returns each
 * column's text; what does not fit is cut.
 */
export function flowColumns(
  f: Frame,
  text: string,
  columns: number,
  width: number,
  height: number,
  size: number,
  family: string,
  lineHeight: number
): string[] {
  const fits = Math.max(1, Math.floor(height / (size * lineHeight)));
  const lines = text
    .split(/\n\s*\n/)
    .flatMap((paragraph, i) => [
      ...(i > 0 ? [''] : []),
      ...layoutTextLines(
        f.measure,
        paragraph.replace(/\s+/g, ' ').trim(),
        width,
        size,
        family,
        'normal',
        null
      ).map((line) => line.runs.map((run) => run.text).join('')),
    ]);
  // Balanced: short copy spreads over every column instead of filling the first.
  const perColumn = Math.min(fits, Math.ceil(lines.length / columns));
  return Array.from({ length: columns }, (_, c) =>
    lines
      .slice(c * perColumn, (c + 1) * perColumn)
      .join('\n')
      .replace(/^\n+|\n+$/g, '')
  );
}
