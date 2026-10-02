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
  layoutRichTextBlock,
  type MeasureRun,
  type SharepicColor,
  type SharepicCreatorLocale,
  type SharepicItem,
  type SharepicPhotoAttribution,
  type SharepicSlide,
  type KiLabelMode,
  type SharepicSpec,
  type SharepicTextSide,
} from '@gruenerator/contracts';

import { getBrandTheme } from '../brand/theme';
import { ASSET_TARGET_SIZE, type AssetInstance } from '../utils/canvasAssets';
import { createCircleBadgeInstance } from '../utils/circleBadgeUtils';
import { COLORS, DREIZEILEN_CONFIG } from '../utils/dreizeilenLayout';
import { createPillBadgeInstance } from '../utils/pillBadgeUtils';
import { createShape, type ShapeInstance } from '../utils/shapes';
import { measureTextWidthWithFont, type TextAccent } from '../utils/textUtils';
import { VERANSTALTUNG_CONFIG } from '../utils/veranstaltungLayout';

import type { IconState } from '../configs/factory/baseTypes';
import type { AdditionalText } from '../configs/types';
import type { CircleBadgeInstance } from '../utils/circleBadgeUtils';
import type { PillBadgeInstance } from '../utils/pillBadgeUtils';

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
  imageAttribution: SharepicPhotoAttribution | null;
  additionalTexts: AdditionalText[];
  pillBadgeInstances: PillBadgeInstance[];
  circleBadgeInstances: CircleBadgeInstance[];
  shapeInstances: ShapeInstance[];
  assetInstances: AssetInstance[];
  selectedIcons: string[];
  iconStates: Record<string, IconState>;
  layerOrder: string[];
};

export interface ComposedSharepic {
  templateType: 'freeform' | 'freeform-at';
  /** One page per slide, in order. */
  slides: ComposedSlide[];
}

const WIDTH = DREIZEILEN_CONFIG.canvas.width;
const HEIGHT = DREIZEILEN_CONFIG.canvas.height;
/** 6.5 % of the width — the margin the posts use. */
const MARGIN = 70;
const GAP = 30;
const FOOTER = 130;
/**
 * Logo: longer side and gap to the bottom edge, measured on the posts. The AT
 * logo (1410 × 1239) sits large and well clear of the edge.
 */
const LOGO = {
  'de-DE': { size: 150, height: 150, bottom: 50 },
  'de-AT': { size: 240, height: (240 * 1239) / 1410, bottom: 95 },
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

/** Scrim alpha under the text, per photo tone. */
const SCRIM_TEXT_ALPHA: Record<PhotoTone, number> = { dunkel: 0.6, mittel: 0.75, hell: 0.88 };
/** Dense scrim reaches this far past the text before it fades. */
const SCRIM_GUTTER = 48;
/** Length of the fade-out beyond the dense part. */
const SCRIM_FADE = 240;

/** Gradient angle per side: offset 0 on the picture side. */
const SCRIM_ANGLE: Record<SharepicTextSide, number> = {
  unten: 90,
  oben: 270,
  links: 180,
  rechts: 0,
};

const LIGHT: readonly SharepicColor[] = ['mint', 'weiss'];

/** DE accent: a lime marker box. AT accent: a yellow Vollkorn line. */
const LIME = '#BEFF60';
/** DE accent words on light ground — lime would vanish there. */
const KLEE = '#008939';

/** The "swipe on" arrows — icons from the editor's own sets, so they stay swappable. */
const ARROW_ICON = { 'de-DE': 'tabler:arrow-narrow-right', 'de-AT': 'heroicons:arrow-long-right' };

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
    .replace(/\*\*|__|==|\*/g, '')
    .split(/\s+/)
    .filter(Boolean);
  let fitted = size;
  while (fitted > minSize && words.some((w) => indent + measureWord(w, fitted) > width)) fitted--;
  return fitted;
}

/** `#RRGGBB` at zero alpha — the end of a fade into a photo. */
function transparent(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0)`;
}

const stripMarks = (text: string) => text.replace(/\*\*|__|==/g, '');

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
  return {
    templateType: spec.locale === 'de-AT' ? 'freeform-at' : 'freeform',
    slides: spec.slides.map((slide, index) =>
      composeSlide(
        slide,
        spec.locale,
        options,
        options.attributions?.[index] ?? null,
        index < count - 1
      )
    ),
  };
}

function composeSlide(
  spec: SharepicSlide,
  locale: SharepicCreatorLocale,
  options: ComposeOptions,
  attribution: SharepicPhotoAttribution | null,
  /** Not the last slide of a carousel: it gets the "swipe on" arrow. */
  swipeOn: boolean
): ComposedSlide {
  const measure = options.measure ?? defaultMeasure;
  const theme = getBrandTheme(locale);
  const isAt = locale === 'de-AT';
  const bg = spec.background;
  const darkText = isAt ? theme.colors.primary : SHAREPIC_COLOR_HEX.dunkeltanne;
  const boxed = !isAt && !!spec.zeilenboxen;

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
    selectedIcons: [],
    iconStates: {},
    layerOrder: [],
  };
  if (bg.kind !== 'farbe') out.currentImageSrc = options.photoSrc(bg.filename);

  const addShape = (shape: ShapeInstance) => {
    out.shapeInstances.push(shape);
    out.layerOrder.push(shape.id);
  };
  const rect = (id: string, x: number, y: number, w: number, h: number, fill: string) => {
    const shape = createShape('rect', x + w / 2, y + h / 2, fill, fill);
    return Object.assign(shape, { id, width: w, height: h });
  };

  // ── Surface: what the text sits on, and the planes that make it ──────────
  let areaTop = 0;
  let areaBottom: number = HEIGHT;
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
    const full = side === 'unten' || side === 'oben' ? HEIGHT : WIDTH;
    const depth = Math.min(full, denseTo + SCRIM_FADE);
    const fade = Math.max(0.01, 1 - denseTo / depth);
    // Picture-side offset 0; the edge itself a touch denser than the text level.
    const edge = Math.min(0.95, scrimLevel + 0.12);
    const x = side === 'rechts' ? WIDTH - depth : 0;
    const y = side === 'unten' ? HEIGHT - depth : 0;
    const w = side === 'links' || side === 'rechts' ? depth : WIDTH;
    const h = side === 'unten' || side === 'oben' ? depth : HEIGHT;
    Object.assign(scrim, { x: x + w / 2, y: y + h / 2, width: w, height: h });
    scrim.fillGradient = {
      type: 'linear',
      angle: SCRIM_ANGLE[side],
      stops: [
        { offset: 0, color: `rgba(${scrimDark},0)` },
        { offset: fade, color: `rgba(${scrimDark},${scrimLevel})` },
        { offset: 1, color: `rgba(${scrimDark},${edge})` },
      ],
    };
  };
  let column: Column = {
    x: MARGIN,
    width: WIDTH - 2 * MARGIN,
    align: spec.align === 'zentriert' ? 'center' : 'left',
  };

  if (bg.kind === 'farbe') {
    surface = bg.color;
    const gradient = GRADIENTS[bg.color];
    if (gradient) {
      const { stops } = gradient;
      const plane = rect('sc-bg', 0, 0, WIDTH, HEIGHT, stops[1]!);
      plane.fillGradient = {
        type: 'linear',
        angle: gradient.angle,
        stops: stops.map((color, i) => ({ offset: i / (stops.length - 1), color })),
      };
      addShape(plane);
    }
  } else if (bg.kind === 'foto-oben') {
    surface = bg.panelColor;
    areaTop = VERANSTALTUNG_CONFIG.photo.height;
    addShape(rect('sc-panel', 0, areaTop, WIDTH, HEIGHT - areaTop, out.backgroundColor));
  } else if (bg.kind === 'foto-unten') {
    // The colour carries the text at the top and fades into the photo below.
    surface = bg.panelColor;
    areaBottom = HEIGHT * 0.6;
    const solid = out.backgroundColor;
    const panel = rect('sc-panel', 0, 0, WIDTH, HEIGHT * 0.8, solid);
    panel.fillGradient = {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: solid },
        { offset: 0.72, color: solid },
        { offset: 1, color: transparent(solid) },
      ],
    };
    addShape(panel);
  } else if (!boxed || spec.items.some((i) => i.type === 'zitat' || i.type === 'frage')) {
    // Text on a photo: a gradient from the text side into the picture.
    // Line boxes bring their own contrast and need none — a quote or question
    // stays free text even on a boxed slide, so it needs the scrim.
    const side = bg.textSeite;
    const dark = isAt ? '27,94,44' : '0,38,26';
    const vertical = side === 'unten' || side === 'oben';
    scrimDark = dark;
    scrimLevel = SCRIM_TEXT_ALPHA[options.photoTone?.(bg.filename, side) ?? 'mittel'];
    // Real stops follow in `setScrim`, once the geometry is known.
    scrim = rect('sc-scrim', 0, 0, WIDTH, HEIGHT, 'transparent');
    addShape(scrim);
    if (vertical) {
      // Sized after layout, once the block's height is known.
      scrimSide = side;
    } else {
      const width = WIDTH * 0.52;
      column = { x: side === 'links' ? MARGIN : WIDTH - MARGIN - width, width, align: 'left' };
      // Dense across the column and a gutter, from the picture's edge outward.
      setScrim(side, MARGIN + width + SCRIM_GUTTER);
    }
  }

  const onLight = surface !== 'foto' && LIGHT.includes(surface);
  // DE grass green is bright: the posts set dark text on it, not white.
  const onGrass = !isAt && surface === 'grasgruen';
  const darkInk = onLight || onGrass;
  const textColor = darkInk ? darkText : '#FFFFFF';
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
  // `==word==` runs: AT sets them yellow in Vollkorn italic (the face the AT
  // templates use, Vollkorn-BoldItalic), DE in lime.
  const accent: TextAccent = isAt
    ? {
        fill: onLight ? theme.colors.secondary : theme.colors.accent,
        fontFamily: theme.fonts.quoteEmphasis,
        fontStyle: 'italic',
      }
    : { fill: onLight ? KLEE : onGrass ? '#FFFFFF' : LIME };
  const cardAccent: TextAccent = isAt
    ? { ...accent, fill: theme.colors.secondary }
    : { fill: KLEE };
  /** Lines a rich text takes — the same layout the editor's renderer runs. */
  const lineCount = (
    value: string,
    width: number,
    size: number,
    family: string,
    weight: 'normal' | 'bold',
    runAccent: TextAccent = accent
  ) => {
    const measureRun: MeasureRun = (t, style) =>
      style.accent
        ? measure(t, size, runAccent.fontFamily ?? family, runAccent.fontStyle ?? weight)
        : measure(t, size, family, style.italic ? 'italic' : style.bold ? 'bold' : weight);
    return layoutRichTextBlock(value, width, measureRun).length;
  };

  // The date circle's left edge sits at x 680; keep a gap to it.
  if (spec.datum) column = { ...column, width: Math.min(column.width, 560) };
  // AT argument slides set centred paragraphs in a narrower column (≈ 80 %
  // of the width on the posts) — more lines, larger type.
  if (isAt && column.align === 'center' && surface !== 'foto') {
    const width = Math.round(column.width * 0.82);
    column = { ...column, x: (WIDTH - width) / 2, width };
  }
  const xAlign = column.align;

  // Footer row: logo, arrow, place, source — the text group ends above it.
  const footerUsed = spec.logo || swipeOn || !!spec.ort || !!spec.quelle;
  if (footerUsed) {
    areaBottom = Math.min(
      areaBottom,
      HEIGHT - FOOTER - (spec.ort ? spec.ort.lines.length * 48 : 0)
    );
  }
  const logo = LOGO[locale];
  // A large logo reaches above the footer row; the text stays clear of it.
  if (spec.logo) areaBottom = Math.min(areaBottom, HEIGHT - logo.bottom - logo.height - 20);

  // The AI label owns the bottom-left corner; place/source stack above it.
  const kiMode = options.kiLabel ?? 'full';
  const kiText = kiMode === 'none' ? null : KI_LABEL.texts[kiMode];
  const kiHeight = KI_LABEL.fontSize + 2 * KI_LABEL.paddingY;
  const kiTop = HEIGHT - kiHeight - KI_LABEL.margin;
  const quelleSize = 24;
  // A centred logo owns the middle of the footer: the source wraps left of it.
  const quelleWidth =
    spec.logo && xAlign === 'center' && !spec.ort
      ? WIDTH / 2 - logo.size / 2 - 20 - MARGIN
      : WIDTH - 2 * MARGIN - 260;
  const quelleText = spec.quelle ? `Quelle: ${spec.quelle.replace(/^Quelle:\s*/i, '')}` : '';
  // The block's bottom sits just above the label, however many lines it wraps to.
  const quelleLines = spec.quelle
    ? wrapWords(quelleText, quelleWidth, (l) => measure(l, quelleSize, theme.fonts.body, 'normal'))
        .length
    : 0;
  const quelleY = kiText
    ? kiTop - KI_LABEL.gap - Math.max(1, quelleLines) * quelleSize * 1.2
    : HEIGHT - 44;
  const ortBottom = kiText
    ? spec.quelle
      ? quelleY
      : kiTop - KI_LABEL.gap
    : HEIGHT - FOOTER / 2 + 20;
  // The text group stops above the source, whatever its line count.
  if (spec.quelle) areaBottom = Math.min(areaBottom, quelleY - 20);

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
              x: xAlign === 'center' ? WIDTH / 2 - width / 2 : column.x,
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

  // A hook: one short paragraph alone on the slide.
  const only = spec.items.length === 1 ? spec.items[0] : null;
  const shortHook = only?.type === 'absatz' && only.text.split(/\s+/).length <= 10;
  /** The group at a paragraph scale; side-effect free until `place`. */
  const build = (scale: number): Placed[] => {
    const placed: Placed[] = [];
    spec.items.forEach((item: SharepicItem, index) => {
      const id = `sc-${index}-${item.type}`;
      switch (item.type) {
        case 'dachzeile': {
          const size = 38;
          placed.push({
            height: size * 1.2,
            after: 16,
            place: (y) => text(id, item.text, y, size, theme.fonts.body, { fontStyle: 'bold' }),
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
          const family = theme.fonts.headline;
          const lineHeight = isAt ? 0.95 : 0.92;
          // Fit: the longest line fills ~92 % of the column, within sane bounds.
          const widest = Math.max(
            ...item.lines.map((l) => measure(stripMarks(l), 100, family, 'normal'))
          );
          // The cap grows with the fit scale, so a short headline alone fills the slide.
          const maxSize = (item.lines.length <= 2 ? 190 : 150) * Math.min(scale, 1.4);
          const size = Math.round(
            Math.min(maxSize, Math.max(72, (column.width * 0.92 * 100) / widest))
          );
          const step = size * lineHeight;
          // Consecutive plain lines share one text element; the accent line is its own.
          const segments: { lines: string[]; accent: boolean }[] = [];
          const accented = accentLines(item.akzent);
          item.lines.forEach((l, i) => {
            const accent = accented.includes(i);
            const last = segments[segments.length - 1];
            if (last && !last.accent && !accent) last.lines.push(l);
            else segments.push({ lines: [l], accent });
          });
          placed.push({
            height: item.lines.length * step,
            after: Math.round(size * 0.35),
            place: (y) => {
              let cursor = y;
              segments.forEach((segment, s) => {
                const segId = `${id}-${s}`;
                const value = segment.lines.join('\n');
                // An accent line is one accent already; a word accent inside it
                // would vanish (DE: lime on lime) — keep the plain words.
                const plain = stripMarks(value);
                if (segment.accent && isAt) {
                  text(segId, plain, cursor, Math.round(size * 0.95), theme.fonts.quoteEmphasis, {
                    fontStyle: 'italic',
                    fill: onLight ? theme.colors.secondary : theme.colors.accent,
                    lineHeight,
                    type: 'header',
                  });
                } else if (segment.accent) {
                  // DE marker: dark text on a lime box sized to the line.
                  const w = measure(plain, size, family, 'normal') + size * 0.4;
                  const x = xAlign === 'center' ? WIDTH / 2 - w / 2 : column.x - size * 0.15;
                  // Lime glows on dark ground; on mint it washes out — grass green there.
                  const markerColor = onLight ? SHAREPIC_COLOR_HEX.grasgruen : LIME;
                  const box = rect(`${segId}-box`, x, cursor + size * 0.04, w, step, markerColor);
                  box.rotation = -2;
                  addShape(box);
                  text(segId, plain, cursor, size, family, {
                    fill: SHAREPIC_COLOR_HEX.dunkeltanne,
                    lineHeight,
                    type: 'header',
                    shadowOpacity: 0,
                  });
                } else {
                  text(segId, value, cursor, size, family, { lineHeight, type: 'header' });
                }
                cursor += segment.lines.length * step;
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
            Math.round(42 * Math.min(scale, 1.4)),
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
          // face, a stressed one in yellow Vollkorn; DE in bold body text.
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
          const wantedSize = Math.round((isAt ? 58 : 48) * scale);
          const lineHeight = isAt ? 1.08 : 1.22;
          const stressed = item.betont
            ? isAt
              ? {
                  family: theme.fonts.quoteEmphasis,
                  fontStyle: 'italic' as const,
                  fill: accent.fill,
                }
              : { family: theme.fonts.body, fontStyle: 'bold' as const, fill: accent.fill }
            : null;
          const family = stressed?.family ?? (isAt ? theme.fonts.headline : theme.fonts.body);
          const fontStyle = stressed?.fontStyle ?? (isAt ? 'normal' : 'bold');
          const size = largestSizeWordsFit([item.text], wantedSize, column.width, 0, (w, s) =>
            measure(w, s, family, 'bold')
          );
          const lines = lineCount(
            item.text,
            column.width,
            size,
            family,
            fontStyle === 'normal' ? 'normal' : 'bold'
          );
          placed.push({
            height: lines * size * lineHeight,
            after: Math.round(size * 0.6),
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
          // A quote has its own cap: long ones must not explode.
          const size = largestSizeWordsFit(
            [item.text],
            Math.round(52 * Math.min(scale, 1.5)),
            column.width,
            0,
            (w, s) => measure(w, s, theme.fonts.body, 'bold')
          );
          const mark = 90;
          const lines = wrapWords(item.text, column.width, (l) =>
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
                assetId: isAt ? 'quote-mark-gelb' : 'quote-mark-weiss',
                x: xAlign === 'center' ? WIDTH / 2 : column.x + mark / 2,
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
          // The interview question: bold, smaller than the answer paragraph under it.
          const value = item.von ? `${item.von}: ${item.text}` : item.text;
          const size = largestSizeWordsFit(
            [value],
            Math.round(44 * Math.min(scale, 1.4)),
            column.width,
            0,
            (w, s) => measure(w, s, theme.fonts.body, 'bold')
          );
          const lines = lineCount(value, column.width, size, theme.fonts.body, 'bold');
          placed.push({
            height: lines * size * 1.25,
            after: Math.round(size * 0.5),
            place: (y) =>
              text(id, value, y, size, theme.fonts.body, { fontStyle: 'bold', lineHeight: 1.25 }),
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
              const x = xAlign === 'center' ? WIDTH / 2 - width / 2 : column.x;
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
  // Story and argument slides fill the frame like the posts do: paragraphs
  // grow until the block takes about 70 % of the free height.
  const room = areaBottom - areaTop - 2 * MARGIN;
  let placed = build(1);
  // Fine steps: coarse ones drop a size too far when one step just misses.
  for (let scale = 1.8; scale > 1; scale -= 0.05) {
    const group = build(scale);
    // Line boxes stay a block in the middle of the photo; free text fills more.
    if (heightOf(group) <= room * (boxed ? 0.5 : bg.kind === 'foto-unten' ? 0.92 : 0.72)) {
      placed = group;
      break;
    }
  }
  const total = heightOf(placed);
  const top = areaTop + MARGIN + (spec.stoerer && spec.position === 'oben' ? 40 : 0);
  const bottom = areaBottom - MARGIN;
  // A short block on a plain colour slide sits in the middle, not pinned to
  // the top margin; `unten` stays (logo/arrow layouts are built around it).
  const centred = bg.kind === 'farbe' && spec.position !== 'unten' && total < (bottom - top) * 0.5;
  let y =
    spec.position === 'oben' && !centred
      ? top
      : spec.position === 'unten'
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
      Math.abs(centre - HEIGHT / 2) < HEIGHT * 0.1
        ? scrimSide
        : centre < HEIGHT / 2
          ? 'oben'
          : 'unten';
    setScrim(
      side,
      side === 'unten' ? HEIGHT - blockTop + SCRIM_GUTTER : blockTop + total + SCRIM_GUTTER
    );
  }

  // ── Extras ───────────────────────────────────────────────────────────────
  if (spec.stoerer) {
    const radius = 125;
    const size = 38;
    const lines = wrapWords(spec.stoerer.text, radius * 1.45, (l) =>
      measure(l, size, theme.fonts.headline, 'normal')
    ).slice(0, 3);
    // Opposite corner from the text group, so it never covers it.
    const atBottom = spec.position === 'oben';
    out.circleBadgeInstances.push(
      createCircleBadgeInstance('default', {
        id: 'sc-stoerer',
        x: WIDTH - MARGIN - radius + 30,
        y: atBottom ? HEIGHT - FOOTER - radius : areaTop + MARGIN + radius - 30,
        radius,
        rotation: -8,
        backgroundColor: theme.colors.stoerer,
        textColor: '#FFFFFF',
        textLines: lines.map((value, i) => ({
          text: value,
          yOffset: (i - (lines.length - 1) / 2) * size * 1.1,
          fontFamily: theme.fonts.headline,
          fontSize: size,
          fontWeight: 'bold' as const,
        })),
      })
    );
    out.layerOrder.push('sc-stoerer');
  }

  if (spec.datum) {
    const c = VERANSTALTUNG_CONFIG.circle;
    const t = VERANSTALTUNG_CONFIG.circleText;
    out.circleBadgeInstances.push(
      createCircleBadgeInstance('default', {
        id: 'sc-datum',
        x: c.centerX,
        y: bg.kind === 'foto-oben' ? c.centerY : HEIGHT / 2,
        radius: c.radius,
        rotation: c.rotation,
        backgroundColor: isAt ? theme.colors.stoerer : COLORS.HIMMEL,
        textColor: c.textColor,
        textLines: [
          {
            text: spec.datum.weekday,
            yOffset: t.weekday.yOffset,
            fontFamily: theme.fonts.body,
            fontSize: t.weekday.fontSize,
            fontWeight: 'bold',
          },
          {
            text: spec.datum.date,
            yOffset: t.date.yOffset,
            fontFamily: theme.fonts.body,
            fontSize: t.date.fontSize,
            fontWeight: 'normal',
          },
          {
            text: spec.datum.time,
            yOffset: t.time.yOffset,
            fontFamily: theme.fonts.body,
            fontSize: t.time.fontSize,
            fontWeight: 'bold',
          },
        ],
      })
    );
    out.layerOrder.push('sc-datum');
  }

  if (spec.ort) {
    const size = 38;
    const height = spec.ort.lines.length * size * 1.25;
    out.additionalTexts.push({
      id: 'sc-ort',
      text: spec.ort.lines.join('\n'),
      type: 'body',
      x: MARGIN,
      y: ortBottom - height,
      width: WIDTH - 2 * MARGIN - 200,
      fontSize: size,
      fontFamily: theme.fonts.body,
      fontStyle: 'normal',
      fill: textColor,
      lineHeight: 1.25,
      ...shadow,
    });
    out.layerOrder.push('sc-ort');
  }

  const footerY = HEIGHT - FOOTER / 2 - 10;
  if (spec.logo) {
    const centred = xAlign === 'center' && !spec.ort;
    out.assetInstances.push({
      id: 'sc-logo',
      assetId: isAt
        ? onLight
          ? 'gruene-at-logo-gruen'
          : 'gruene-at-logo-weiss'
        : onLight
          ? 'sunflower-green'
          : 'sunflower',
      x: centred ? WIDTH / 2 : WIDTH - MARGIN - logo.size / 2,
      // x/y is the centre.
      y: HEIGHT - logo.bottom - logo.height / 2,
      scale: logo.size / ASSET_TARGET_SIZE,
      rotation: 0,
      opacity: 1,
    });
    out.layerOrder.push('sc-logo');
  }
  if (swipeOn) {
    // A clean, straight arrow in the bottom-right corner, inside the margin —
    // AT a long one (where the posts have a brush stroke), DE a small one.
    const size = isAt ? 180 : 72;
    const nextToLogo = spec.logo && !(xAlign === 'center' && !spec.ort);
    out.selectedIcons.push('sc-pfeil');
    out.iconStates['sc-pfeil'] = {
      iconId: ARROW_ICON[locale],
      x: nextToLogo ? WIDTH - MARGIN - 200 - size / 2 : WIDTH - MARGIN - size / 2,
      y: footerY,
      scale: size / 120,
      rotation: 0,
      color: darkInk ? darkText : '#FFFFFF',
    };
    out.layerOrder.push('sc-pfeil');
  }

  if (spec.quelle) {
    const size = quelleSize;
    out.additionalTexts.push({
      id: 'sc-quelle',
      text: quelleText,
      type: 'body',
      x: MARGIN,
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
      opacity: 0.55,
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
