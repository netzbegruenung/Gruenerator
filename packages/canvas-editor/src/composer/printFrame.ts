/**
 * What every print layout builds on: the page in trim, bleed and margin
 * (`frame`), the page being filled (`page`), stacks of text measured in the
 * brand fonts, and the turned V.i.S.d.P. / Impressum line.
 *
 * Pure: no React, no Konva. Text is measured through the injected `measure`.
 */
import { type PrintImpressum } from '@gruenerator/contracts';

import { getBrandTheme, type BrandTheme } from '../brand/theme';
import { mmToPx, printGeometry, type PrintCanvasFormat, type PrintRect } from '../formats';
import { type CircleBadgeInstance } from '../primitives/CircleBadge';
import { ASSET_TARGET_SIZE } from '../utils/canvasAssets';
import { type ShapeInstance } from '../utils/shapes';
import { type UserImageInstance } from '../utils/userImageUtils';

import { layoutTextLines, type MeasureText } from './chromeParts';
import { type ComposedSlide } from './composeSharepic';

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
      props: { ...block.props, fontSize: wordsFit(f, text, fontSize, width, fontFamily) },
    };
    const item = { ...sized.props, x: f.inner.x, y: cursor, width };
    cursor += blockHeight(f, sized, width);
    return item;
  });
  return { items, bottom: cursor };
}

/** Largest size ≤ `size` at which every word of `text` fits `width` on its own. */
export function wordsFit(
  f: Frame,
  text: string,
  size: number,
  width: number,
  family: string
): number {
  const words = text
    .replace(/\*\*|==/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const widest = Math.max(1, ...words.map((w) => f.measure(w, size, family, 'normal')));
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
    x: trim.x + inset - (size * lineHeight) / 2,
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
