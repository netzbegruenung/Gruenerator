/**
 * ZitatPure Full Canvas Configuration
 * Quote sharepic with solid color background
 *
 * Uses createColorTwoTextCanvas factory for shared infrastructure.
 */

import { ZITAT_PURE_CONFIG, calculateZitatPureLayout } from '../utils/zitatPureLayout';

import { createColorTwoTextCanvas } from './factory';

import type { ColorTwoTextState } from './factory';
import type { LayoutResult, TextElementConfig, ImageElementConfig } from './types';
import type { BackgroundColorOption } from '../sidebar/types';

// ============================================================================
// CONSTANTS
// ============================================================================

const BACKGROUND_COLORS: BackgroundColorOption[] = [
  { id: 'green', label: 'Grün', color: '#6CCD87' },
  { id: 'sand', label: 'Sand', color: '#F5F1E9' },
];

const FONT_COLORS: Record<string, string> = {
  '#6CCD87': '#005437',
  '#F5F1E9': '#262626',
};

// ============================================================================
// LAYOUT CALCULATOR
// ============================================================================

const calculateLayout = (state: ColorTwoTextState): LayoutResult => {
  const quote = (state.quote as string) || '';
  const layoutResult = calculateZitatPureLayout(quote);
  const fontColor = FONT_COLORS[state.backgroundColor] ?? FONT_COLORS['#6CCD87'];

  return {
    'quote-mark': {
      x: ZITAT_PURE_CONFIG.quotationMark.x,
      y: layoutResult.quoteMarkY,
      width: ZITAT_PURE_CONFIG.quotationMark.size,
      height: ZITAT_PURE_CONFIG.quotationMark.size,
    },
    'quote-text': {
      x: ZITAT_PURE_CONFIG.quote.x,
      y: layoutResult.quoteY,
      width: ZITAT_PURE_CONFIG.quote.maxWidth,
      fontSize: state.customPrimaryFontSize ?? layoutResult.quoteFontSize,
    },
    'name-text': {
      x: ZITAT_PURE_CONFIG.author.x,
      y: layoutResult.authorY,
      width: ZITAT_PURE_CONFIG.quote.maxWidth,
      fontSize: state.customSecondaryFontSize ?? layoutResult.authorFontSize,
    },
    sunflower: {
      x: ZITAT_PURE_CONFIG.sunflower.x,
      y: ZITAT_PURE_CONFIG.sunflower.y,
      width: ZITAT_PURE_CONFIG.sunflower.size,
      height: ZITAT_PURE_CONFIG.sunflower.size,
    },
    _meta: {
      fontColor,
      quoteFontSize: layoutResult.quoteFontSize,
      authorFontSize: layoutResult.authorFontSize,
    } as Record<string, unknown>,
  };
};

// ============================================================================
// CUSTOM ELEMENTS
// ============================================================================

const sunflowerElement: ImageElementConfig<ColorTwoTextState> = {
  id: 'sunflower',
  type: 'image',
  x: ZITAT_PURE_CONFIG.sunflower.x,
  y: ZITAT_PURE_CONFIG.sunflower.y,
  order: 1,
  width: ZITAT_PURE_CONFIG.sunflower.size,
  height: ZITAT_PURE_CONFIG.sunflower.size,
  src: ZITAT_PURE_CONFIG.sunflower.src,
  listening: true,
  draggable: true,
  constrainToBounds: false,
  opacity: () => ZITAT_PURE_CONFIG.sunflower.opacity,
};

const quoteMarkElement: ImageElementConfig<ColorTwoTextState> = {
  id: 'quote-mark',
  type: 'image',
  x: (_s, l) => (l['quote-mark'] as { x?: number })?.x ?? ZITAT_PURE_CONFIG.quotationMark.x,
  y: (_s, l) => (l['quote-mark'] as { y?: number })?.y ?? 120,
  order: 2,
  width: ZITAT_PURE_CONFIG.quotationMark.size,
  height: ZITAT_PURE_CONFIG.quotationMark.size,
  src: ZITAT_PURE_CONFIG.quotationMark.src,
  listening: true,
  draggable: true,
  offsetKey: 'quoteMarkOffset',
  opacityStateKey: 'quoteMarkOpacity',
};

const quoteTextElement: TextElementConfig<ColorTwoTextState> = {
  id: 'quote-text',
  type: 'text',
  x: (_s, l) => (l['quote-text'] as { x?: number })?.x ?? ZITAT_PURE_CONFIG.quote.x,
  y: (_s, l) => (l['quote-text'] as { y?: number })?.y ?? 200,
  order: 3,
  textKey: 'quote',
  width: ZITAT_PURE_CONFIG.quote.maxWidth,
  fontSize: (_s, l) =>
    (l['quote-text'] as { fontSize?: number })?.fontSize ?? ZITAT_PURE_CONFIG.quote.fontSize,
  fontFamily: `${ZITAT_PURE_CONFIG.quote.fontFamily}, Arial, sans-serif`,
  fontStyle: ZITAT_PURE_CONFIG.quote.fontStyle,
  align: 'left',
  lineHeight: ZITAT_PURE_CONFIG.quote.lineHeight,
  wrap: 'word',
  padding: 0,
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customPrimaryFontSize',
  opacityStateKey: 'primaryOpacity',
  fill: (s, l) =>
    (s.primaryColor as string) ?? (l._meta as { fontColor?: string })?.fontColor ?? '#005437',
  fillStateKey: 'primaryColor',
};

const nameTextElement: TextElementConfig<ColorTwoTextState> = {
  id: 'name-text',
  type: 'text',
  x: (_s, l) => (l['name-text'] as { x?: number })?.x ?? ZITAT_PURE_CONFIG.author.x,
  y: (_s, l) => (l['name-text'] as { y?: number })?.y ?? 500,
  order: 4,
  textKey: 'name',
  width: ZITAT_PURE_CONFIG.quote.maxWidth,
  fontSize: (_s, l) =>
    (l['name-text'] as { fontSize?: number })?.fontSize ?? ZITAT_PURE_CONFIG.author.fontSize,
  fontFamily: `${ZITAT_PURE_CONFIG.author.fontFamily}, Arial, sans-serif`,
  fontStyle: ZITAT_PURE_CONFIG.author.fontStyle,
  align: 'left',
  padding: 0,
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customSecondaryFontSize',
  opacityStateKey: 'secondaryOpacity',
  fill: (s, l) =>
    (s.secondaryColor as string) ?? (l._meta as { fontColor?: string })?.fontColor ?? '#005437',
  fillStateKey: 'secondaryColor',
};

// ============================================================================
// CONFIG EXPORT
// ============================================================================

export const zitatPureFullConfig = createColorTwoTextCanvas({
  id: 'zitat-pure',

  canvas: {
    width: ZITAT_PURE_CONFIG.canvas.width,
    height: ZITAT_PURE_CONFIG.canvas.height,
  },

  primaryField: {
    key: 'quote',
    label: 'Zitat',
  },

  secondaryField: {
    key: 'name',
    label: 'Name',
  },

  backgroundColors: BACKGROUND_COLORS,
  defaultBackgroundColor: ZITAT_PURE_CONFIG.background.color,
  textColorMap: FONT_COLORS,

  calculateLayout,

  elements: [sunflowerElement, quoteMarkElement, quoteTextElement, nameTextElement],

  features: {
    icons: true,
    shapes: true,
    illustrations: true,
  },

  getCanvasText: (state) => {
    const quote = (state.quote as string) || '';
    const name = (state.name as string) || '';
    return `„${quote}"\n— ${name}`.trim();
  },
});

// Re-export types for backward compatibility
export type ZitatPureFullState = ColorTwoTextState;
export type { ColorTwoTextActions as ZitatPureFullActions } from './factory';
