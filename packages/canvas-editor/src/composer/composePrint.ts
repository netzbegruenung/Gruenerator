/**
 * Print spec → freeform canvas pages in a print format (business card front
 * and back, typo poster), the same output shape as `composeSharepic`, so the
 * editor, persistence and undo treat a print draft like any other freeform
 * canvas.
 *
 * Layouts follow the CD patterns (DE styleguide 2024 p. 26/32, AT CD 2026
 * p. 95) as the design lab rebuilt them (`free-design-lab/public/print.js`):
 * one type unit `u` = short trim side / 24, a margin of 1.6 u (DE, at least
 * 4 mm) or 6 % of the short side (AT). Planes are the page background, which
 * covers the whole canvas and so the bleed; text and logos stay inside the
 * margin, which lies inside the safe zone.
 *
 * Pure: no React, no Konva. Text is measured through the injected `measure`.
 */
import {
  type PrintFormatId,
  type PrintImpressum,
  type PrintSpec,
  type PrintTypoSlots,
  type PrintVisitenkarteSlots,
} from '@gruenerator/contracts';

import { getBrandTheme, type BrandTheme } from '../brand/theme';
import {
  getCanvasFormat,
  isPrintFormat,
  mmToPx,
  printGeometry,
  type PrintCanvasFormat,
  type PrintRect,
} from '../formats';
import { ASSET_TARGET_SIZE } from '../utils/canvasAssets';
import { type TextAccent } from '../utils/textUtils';

import {
  AT_EMPHASIS_STYLE,
  DE_WORDMARK,
  defaultMeasure,
  layoutTextLines,
  LIME,
  SHAREPIC_COLOR_HEX,
  type MeasureText,
} from './chromeParts';
import { type ComposedSlide } from './composeSharepic';

import type { AdditionalText } from '../configs/types';

export interface ComposePrintOptions {
  measure?: MeasureText;
}

export interface ComposedPrint {
  templateType: 'freeform' | 'freeform-at';
  format: PrintFormatId;
  /** One page per printed side, front first. */
  slides: ComposedSlide[];
}

/** Element id of the poster's V.i.S.d.P. / Impressum line; later steps find and update it by this. */
export const PRINT_IMPRESSUM_ID = 'impressum';

/** Longer side ÷ shorter side of the logo and flower artwork (`apps/web/public`). */
const ART = {
  deLogo: { w: 710, h: 379 },
  atLogo: { w: 1410, h: 1239 },
  sunflower: { w: 2000, h: 2015 },
} as const;

const PT_IN_MM = 25.4 / 72;
const WHITE = '#FFFFFF';
/** Headline leading of the lab: GrueneTypeNeue 1.05, Gotham Ultra 1. */
const HEAD_LEADING = { 'de-DE': 1.05, 'de-AT': 1 } as const;
const BODY_LEADING = 1.3;
/** Contact lines: the letter in bold, then the value (CD p. 32 / p. 95). */
const KONTAKT = [
  ['T', 'telefon'],
  ['M', 'mobil'],
  ['E', 'mail'],
  ['W', 'web'],
] as const;

interface Page {
  out: ComposedSlide;
  text: (props: AdditionalText) => void;
  /** An asset centred on x/y whose longer side is `size` px. */
  asset: (id: string, assetId: string, x: number, y: number, size: number) => void;
}

function page(backgroundColor: string): Page {
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
  };
}

/** What every print layout measures against. */
interface Frame {
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

function frame(format: PrintCanvasFormat, isAt: boolean, measure: MeasureText): Frame {
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
interface Block {
  props: Omit<AdditionalText, 'x' | 'y' | 'width'>;
  /** Space above, when something precedes it. */
  before: number;
}

function blockHeight(f: Frame, block: Block, width: number): number {
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

function stackHeight(f: Frame, blocks: Block[], width: number): number {
  return blocks.reduce(
    (sum, block, i) => sum + (i > 0 ? block.before : 0) + blockHeight(f, block, width),
    0
  );
}

/** Places `blocks` top-down from `y`; returns the bottom edge. */
function placeStack(p: Page, f: Frame, blocks: Block[], x: number, y: number, width: number) {
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
function layoutStack(
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
function wordsFit(f: Frame, text: string, size: number, width: number, family: string): number {
  const words = text
    .replace(/\*\*|==/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const widest = Math.max(1, ...words.map((w) => f.measure(w, size, family, 'normal')));
  return widest > width ? (size * width) / widest : size;
}

function kontaktText(slots: PrintVisitenkarteSlots): string | null {
  const lines = KONTAKT.flatMap(([letter, key]) => {
    const value = slots[key];
    return value ? [`**${letter}** ${value}`] : [];
  });
  return lines.length ? lines.join('\n') : null;
}

/** The headline with its accent words marked `==…==` (first occurrence; absent: unmarked). */
function withAccent(headline: string, akzent: string | undefined): string {
  const word = akzent?.trim();
  if (!word || !headline.includes(word)) return headline;
  return headline.replace(word, `==${word}==`);
}

/**
 * The poster's V.i.S.d.P. / Impressum line: PT Sans / Gotham Book 8 pt (DE
 * guide p. 10: 10 pt only above A3), turned to read bottom-up, centred in the
 * left margin, starting half a margin above the trim bottom. Rotation turns
 * around x/y, the text's top-left.
 */
function impressumElement(f: Frame, text: string): AdditionalText {
  const { trim, theme } = f;
  const size = f.pt(8);
  const lineHeight = 1.2;
  return {
    id: PRINT_IMPRESSUM_ID,
    text,
    type: 'body',
    x: trim.x + f.margin / 2 - (size * lineHeight) / 2,
    y: trim.y + trim.height - f.margin / 2,
    width: trim.height - f.margin,
    fontSize: size,
    fontFamily: theme.fonts.body,
    fontStyle: 'normal',
    fill: WHITE,
    lineHeight,
    rotation: -90,
  };
}

/** The impressum element of a poster in `formatId`, at its standard position (for re-adding a deleted one). */
export function composePrintImpressum(
  formatId: PrintFormatId,
  isAt: boolean,
  text: string
): AdditionalText {
  const format = getCanvasFormat(formatId);
  if (!format || !isPrintFormat(format)) {
    throw new Error(`composePrintImpressum: ${formatId} is not a print format`);
  }
  return impressumElement(frame(format, isAt, defaultMeasure), text);
}

function impressumText(impressum: PrintImpressum): string {
  return impressum.art === 'visdp'
    ? `V.i.S.d.P.: ${impressum.name}, ${impressum.anschrift}`
    : `Impressum: ${impressum.medieninhaber}, ${impressum.anschrift}`;
}

export function composePrint(spec: PrintSpec, options: ComposePrintOptions = {}): ComposedPrint {
  const format = getCanvasFormat(spec.format);
  if (!format || !isPrintFormat(format)) {
    throw new Error(`composePrint: ${spec.format} is not a print format`);
  }
  const isAt = spec.locale === 'de-AT';
  const f = frame(format, isAt, options.measure ?? defaultMeasure);
  const slides =
    spec.variante === 'visitenkarte'
      ? isAt
        ? visitenkarteAt(f, spec.slots)
        : visitenkarteDe(f, spec.slots)
      : [typo(f, spec.slots, spec.impressum)];
  return { templateType: isAt ? 'freeform-at' : 'freeform', format: spec.format, slides };
}

// ── Business card ───────────────────────────────────────────────────────────

/** Size steps for content that does not fit: the type shrinks, never below the print minimums. */
const FIT_STEPS = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6];

/** Small and body type on a card: 0.62 u / 0.85 u, at least 7 pt / 8 pt. */
function cardType(f: Frame, fit: number) {
  return {
    klein: Math.max(0.62 * f.u * fit, f.pt(7)),
    text: Math.max(0.85 * f.u * fit, f.pt(8)),
  };
}

/** The contact blocks of a card, one per filled slot, in reading order. */
function cardBlocks(
  f: Frame,
  slots: PrintVisitenkarteSlots,
  fit: number,
  width: number,
  ink: { name: string; funktion: string; body: string },
  align: 'left' | 'center'
): Block[] {
  const { theme, u } = f;
  const { klein, text } = cardType(f, fit);
  const nameBase = (f.isAt ? 1.7 : 2.4) * u * fit;
  const nameSize = wordsFit(f, slots.name, nameBase, width, theme.fonts.headline);
  const body = (id: string, value: string, before: number): Block => ({
    before,
    props: {
      id,
      text: value,
      type: 'body',
      fontSize: klein,
      fontFamily: theme.fonts.body,
      fontStyle: 'normal',
      fill: ink.body,
      lineHeight: BODY_LEADING,
      align,
    },
  });
  // DE: name and function one group (0.25 u), then the address group (1.2 u),
  // contacts 0.5 u below. AT: one centred stack, 0.9 u after the name.
  const groupGap = (f.isAt ? 0.9 : 1.2) * u * fit;
  const blocks: Block[] = [
    {
      before: 0,
      props: {
        id: 'pr-name',
        text: slots.name,
        type: 'header',
        fontSize: nameSize,
        fontFamily: theme.fonts.headline,
        fontStyle: 'normal',
        fill: ink.name,
        lineHeight: HEAD_LEADING[theme.locale],
        align,
      },
    },
  ];
  if (slots.funktion) {
    blocks.push(
      f.isAt
        ? body('pr-funktion', slots.funktion, groupGap)
        : {
            before: 0.25 * u * fit,
            props: {
              id: 'pr-funktion',
              text: slots.funktion,
              type: 'subheader',
              fontSize: text,
              fontFamily: theme.fonts.body,
              fontStyle: 'bold',
              fill: ink.funktion,
              lineHeight: BODY_LEADING,
              align,
            },
          }
    );
  }
  let next = f.isAt && slots.funktion ? 0 : groupGap;
  if (slots.organisation) {
    blocks.push(body('pr-organisation', slots.organisation, next));
    next = 0;
  }
  if (slots.adresse) {
    blocks.push(body('pr-adresse', slots.adresse, next));
    next = 0;
  }
  const kontakt = kontaktText(slots);
  if (kontakt) {
    const after = f.isAt ? 0 : 0.5 * u * fit;
    blocks.push(body('pr-kontakt', kontakt, next === 0 ? after : next));
  }
  return blocks;
}

/**
 * DE (CD p. 32): front Tanne, name in the headline face, function in mint,
 * address and contacts small, the colour logo bottom-right; back Tanne with a
 * large yellow sunflower cut by the edges.
 */
function visitenkarteDe(f: Frame, slots: PrintVisitenkarteSlots): ComposedSlide[] {
  const { inner, trim, u } = f;
  const tanne = SHAREPIC_COLOR_HEX.tanne;
  const ink = { name: WHITE, funktion: SHAREPIC_COLOR_HEX.mint, body: WHITE };

  const front = page(tanne);
  const logoW = 6 * u;
  const logoH = (logoW * ART.deLogo.h) / ART.deLogo.w;
  const logoTop = inner.y + inner.height - logoH;
  // Full width while the column ends above the logo; beside it otherwise.
  const narrow = inner.width - logoW - u;
  let chosen = { blocks: cardBlocks(f, slots, 1, inner.width, ink, 'left'), width: inner.width };
  for (const fit of FIT_STEPS) {
    const wide = cardBlocks(f, slots, fit, inner.width, ink, 'left');
    if (stackHeight(f, wide, inner.width) <= logoTop - 0.5 * u - inner.y) {
      chosen = { blocks: wide, width: inner.width };
      break;
    }
    const beside = cardBlocks(f, slots, fit, narrow, ink, 'left');
    chosen = { blocks: beside, width: narrow };
    if (stackHeight(f, beside, narrow) <= inner.height) break;
  }
  placeStack(front, f, chosen.blocks, inner.x, inner.y, chosen.width);
  front.asset(
    'pr-logo',
    DE_WORDMARK.farbe,
    inner.x + inner.width - logoW / 2,
    logoTop + logoH / 2,
    logoW
  );

  // Back: the lab's flower, relative to the trim box (quer: cut top and
  // right; hoch: cut left, right and bottom).
  const back = page(tanne);
  const hoch = trim.height > trim.width;
  const blume = hoch
    ? { left: -0.3, top: 0.22, width: 1.5 }
    : { left: 0.28, top: -0.22, width: 0.9 };
  const w = blume.width * trim.width;
  const h = (w * ART.sunflower.h) / ART.sunflower.w;
  back.asset(
    'pr-blume',
    'sunflower',
    trim.x + (blume.left * trim.width + w / 2),
    trim.y + blume.top * trim.height + h / 2,
    Math.max(w, h)
  );
  return [front.out, back.out];
}

/**
 * AT (CD p. 95): front Dunkelgrün with only the white logo in the middle;
 * back white, everything centred in Dunkelgrün — no sunflower.
 */
function visitenkarteAt(f: Frame, slots: PrintVisitenkarteSlots): ComposedSlide[] {
  const { inner, trim, theme } = f;
  const green = theme.colors.primary;

  const front = page(green);
  const logoW = 0.34 * f.shortSide;
  front.asset(
    'pr-logo',
    'gruene-at-logo-weiss',
    trim.x + trim.width / 2,
    trim.y + trim.height / 2,
    logoW
  );

  const back = page(WHITE);
  const ink = { name: green, funktion: green, body: green };
  let blocks = cardBlocks(f, slots, 1, inner.width, ink, 'center');
  for (const fit of FIT_STEPS) {
    blocks = cardBlocks(f, slots, fit, inner.width, ink, 'center');
    if (stackHeight(f, blocks, inner.width) <= inner.height) break;
  }
  const height = stackHeight(f, blocks, inner.width);
  placeStack(
    back,
    f,
    blocks,
    inner.x,
    inner.y + Math.max(0, (inner.height - height) / 2),
    inner.width
  );
  return [front.out, back.out];
}

// ── Typo poster ─────────────────────────────────────────────────────────────

/**
 * DE (CD p. 26): Tanne, a cut sunflower top-right, kicker, a huge headline
 * whose accent is lime (colour only, no marker box), subline, the web address
 * large, sender and logo at the bottom. AT: Dunkelgrün, the accent in yellow
 * Vollkorn Black Italic, logo bottom-right, no sunflower. Both: the
 * V.i.S.d.P. / Impressum turned −90° in the left margin.
 */
function typo(f: Frame, slots: PrintTypoSlots, impressum: PrintImpressum | null): ComposedSlide {
  const { inner, trim, theme, u, isAt } = f;
  const p = page(isAt ? theme.colors.primary : SHAREPIC_COLOR_HEX.tanne);
  const head = theme.fonts.headline;
  const hervor = isAt ? WHITE : SHAREPIC_COLOR_HEX.mint;
  const accent: TextAccent = isAt
    ? {
        fill: theme.colors.accent,
        fontFamily: theme.fonts.quoteEmphasis,
        fontStyle: AT_EMPHASIS_STYLE,
      }
    : { fill: LIME };
  const leading = HEAD_LEADING[theme.locale];
  const h3 = 1.7 * u;
  const gap = 1.2 * u;

  // A text starting above the flower's bottom edge (plus a gap) ends before
  // its left edge, as in the lab; below it the column runs full width.
  let widthAt = (_y: number) => inner.width;
  if (!isAt) {
    // Drawn first, so the text sits on it.
    const w = 0.4 * trim.width;
    const h = (w * ART.sunflower.h) / ART.sunflower.w;
    const cx = trim.x + trim.width * 1.14 - w / 2;
    const cy = trim.y - 0.08 * trim.height + h / 2;
    const size = Math.max(w, h);
    p.asset('pr-blume', 'sunflower', cx, cy, size);
    const flowerBottom = cy + size / 2;
    const beside = cx - size / 2 - u - inner.x;
    widthAt = (y) => (y < flowerBottom + gap ? beside : inner.width);
  }

  // Footer, bottom-up: logo bottom-right, the sender beside it, the web above.
  const logoW = isAt ? 0.18 * f.shortSide : 6 * u;
  const art = isAt ? ART.atLogo : ART.deLogo;
  const logoH = (logoW * art.h) / art.w;
  const bottom = inner.y + inner.height;
  const footer: Block[] = [];
  let rowHeight = logoH;
  const absenderWidth = inner.width - logoW - u;
  if (slots.absender) {
    const absender: Block = {
      before: 0,
      props: {
        id: 'pr-absender',
        text: slots.absender,
        type: 'body',
        fontSize: Math.max(0.85 * u, f.pt(8)),
        fontFamily: theme.fonts.body,
        fontStyle: 'normal',
        fill: hervor,
        lineHeight: BODY_LEADING,
      },
    };
    const height = blockHeight(f, absender, absenderWidth);
    rowHeight = Math.max(rowHeight, height);
    p.text({ ...absender.props, x: inner.x, y: bottom - height, width: absenderWidth });
  }
  let footerTop = bottom - rowHeight;
  if (slots.web) {
    const one = f.measure(slots.web, h3, head, 'normal');
    const size = one > inner.width ? (h3 * inner.width) / one : h3;
    const web: Block = {
      before: 0,
      props: {
        id: 'pr-web',
        text: slots.web,
        type: 'subheader',
        fontSize: size,
        fontFamily: head,
        fontStyle: 'normal',
        fill: WHITE,
        lineHeight: leading,
      },
    };
    footerTop -= 0.6 * u + blockHeight(f, web, inner.width);
    footer.push(web);
  }
  placeStack(p, f, footer, inner.x, footerTop, inner.width);

  // The block: kicker, headline, subline (0.6 u apart), shrinking the headline
  // until it fits between the top and the footer.
  const blockFor = (headSize: number): Block[] => {
    const blocks: Block[] = [];
    if (slots.dachzeile) {
      blocks.push({
        before: 0,
        props: {
          id: 'pr-dachzeile',
          text: slots.dachzeile,
          type: 'subheader',
          fontSize: wordsFit(f, slots.dachzeile, h3, inner.width, head),
          fontFamily: head,
          fontStyle: 'normal',
          fill: hervor,
          lineHeight: leading,
        },
      });
    }
    blocks.push({
      before: 0.6 * u,
      props: {
        id: 'pr-headline',
        text: withAccent(slots.headline, slots.akzent),
        type: 'header',
        fontSize: headSize,
        fontFamily: head,
        fontStyle: 'normal',
        fill: WHITE,
        lineHeight: leading,
        accent,
      },
    });
    if (slots.subline) {
      blocks.push({
        before: 0.6 * u,
        props: {
          id: 'pr-subline',
          text: slots.subline,
          type: 'subheader',
          fontSize: wordsFit(f, slots.subline, h3, inner.width, head),
          fontFamily: head,
          fontStyle: 'normal',
          fill: WHITE,
          lineHeight: leading,
        },
      });
    }
    return blocks;
  };
  // Fitted at the highest start, where the most text runs beside the flower;
  // any lower start only widens texts, so the block stays as tall or shrinks.
  const top = inner.y + gap;
  const room = footerTop - gap - top;
  const heightAt = (blocks: Block[], y: number) => layoutStack(f, blocks, y, widthAt).bottom - y;
  let headSize = 5 * u;
  while (headSize > 1.7 * u && heightAt(blockFor(headSize), top) > room) headSize *= 0.97;
  const blocks = blockFor(headSize);
  // The lab's spacers: 1.2 parts above the block, 1 part below. Moving down
  // can widen a text and shorten the block; settle in a few rounds.
  let y = top;
  for (let round = 0; round < 4; round++) {
    const free = Math.max(0, room - heightAt(blocks, y));
    y = top + (free * 1.2) / 2.2;
  }
  // A wider text may take its full size back and grow; then start at the top.
  if (y + heightAt(blocks, y) > top + room) y = top;
  for (const item of layoutStack(f, blocks, y, widthAt).items) p.text(item);

  p.asset(
    'pr-logo',
    isAt ? 'gruene-at-logo-weiss' : DE_WORDMARK.white,
    inner.x + inner.width - logoW / 2,
    bottom - logoH / 2,
    Math.max(logoW, logoH)
  );

  if (impressum) p.text(impressumElement(f, impressumText(impressum)));
  return p.out;
}
