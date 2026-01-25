/**
 * Zitat Full Canvas Configuration
 * Quote sharepic with background image and gradient overlay
 *
 * Uses createImageTwoTextCanvas factory for shared infrastructure.
 */

import { ZITAT_CONFIG, calculateZitatLayout } from '../utils/zitatLayout';

import { createImageTwoTextCanvas } from './factory';

import type { ImageTwoTextState } from './factory';
import type {
  LayoutResult,
  TextElementConfig,
  RectElementConfig,
  ImageElementConfig,
} from './types';

// ============================================================================
// LAYOUT CALCULATOR
// ============================================================================

const calculateLayout = (state: ImageTwoTextState): LayoutResult => {
  const quote = (state.quote as string) || '';
  const fontSize = state.customPrimaryFontSize ?? ZITAT_CONFIG.quote.fontSize;
  const layout = calculateZitatLayout(quote, fontSize);

  return {
    'quote-mark': {
      x: ZITAT_CONFIG.quotationMark.x,
      y: layout.quoteMarkY,
      width: layout.quoteMarkSize,
      height: layout.quoteMarkSize,
    },
    'quote-text': {
      x: ZITAT_CONFIG.quote.x,
      y: layout.quoteY,
      width: ZITAT_CONFIG.quote.maxWidth,
      fontSize: layout.quoteFontSize,
      lineHeight: layout.lineHeight,
    },
    'name-text': {
      x: ZITAT_CONFIG.author.x,
      y: layout.authorY,
      width: ZITAT_CONFIG.quote.maxWidth,
      fontSize: state.customSecondaryFontSize ?? layout.authorFontSize,
    },
  };
};

// ============================================================================
// CUSTOM ELEMENTS
// ============================================================================

const gradientOverlay: RectElementConfig<ImageTwoTextState> = {
  id: 'gradient-overlay',
  type: 'rect',
  x: 0,
  y: 0,
  order: 1,
  width: ZITAT_CONFIG.canvas.width,
  height: ZITAT_CONFIG.canvas.height,
  fill: `rgba(0,0,0,${ZITAT_CONFIG.gradient.bottomOpacity})`,
  listening: false,
};

const quoteMarkElement: ImageElementConfig<ImageTwoTextState> = {
  id: 'quote-mark',
  type: 'image',
  x: (_s, l) => (l['quote-mark'] as { x?: number })?.x ?? ZITAT_CONFIG.quotationMark.x,
  y: (_s, l) => (l['quote-mark'] as { y?: number })?.y ?? ZITAT_CONFIG.quotationMark.y,
  order: 2,
  width: (_s, l) => (l['quote-mark'] as { width?: number })?.width ?? 100,
  height: (_s, l) => (l['quote-mark'] as { height?: number })?.height ?? 100,
  src: ZITAT_CONFIG.quotationMark.src,
  listening: true,
  draggable: true,
  offsetKey: 'quoteMarkOffset',
  opacityStateKey: 'quoteMarkOpacity',
};

const quoteTextElement: TextElementConfig<ImageTwoTextState> = {
  id: 'quote-text',
  type: 'text',
  x: (_s, l) => (l['quote-text'] as { x?: number })?.x ?? ZITAT_CONFIG.quote.x,
  y: (_s, l) => (l['quote-text'] as { y?: number })?.y ?? 800,
  order: 3,
  textKey: 'quote',
  width: ZITAT_CONFIG.quote.maxWidth,
  fontSize: (_s, l) =>
    (l['quote-text'] as { fontSize?: number })?.fontSize ?? ZITAT_CONFIG.quote.fontSize,
  fontFamily: `${ZITAT_CONFIG.quote.fontFamily}, Arial, sans-serif`,
  fontStyle: ZITAT_CONFIG.quote.fontStyle,
  align: 'left',
  lineHeight: ZITAT_CONFIG.quote.lineHeightRatio,
  wrap: 'word',
  padding: 0,
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customPrimaryFontSize',
  opacityStateKey: 'primaryOpacity',
  fill: (state) => (state.primaryColor as string) ?? ZITAT_CONFIG.quote.color,
  fillStateKey: 'primaryColor',
};

const nameTextElement: TextElementConfig<ImageTwoTextState> = {
  id: 'name-text',
  type: 'text',
  x: (_s, l) => (l['name-text'] as { x?: number })?.x ?? ZITAT_CONFIG.author.x,
  y: (_s, l) => (l['name-text'] as { y?: number })?.y ?? 1000,
  order: 4,
  textKey: 'name',
  width: ZITAT_CONFIG.quote.maxWidth,
  fontSize: (_s, l) => (l['name-text'] as { fontSize?: number })?.fontSize ?? 40,
  fontFamily: `${ZITAT_CONFIG.author.fontFamily}, Arial, sans-serif`,
  fontStyle: ZITAT_CONFIG.author.fontStyle,
  align: 'left',
  padding: 0,
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customSecondaryFontSize',
  opacityStateKey: 'secondaryOpacity',
  fill: (state) => (state.secondaryColor as string) ?? ZITAT_CONFIG.author.color,
  fillStateKey: 'secondaryColor',
};

// ============================================================================
// CONFIG EXPORT
// ============================================================================

export const zitatFullConfig = createImageTwoTextCanvas({
  id: 'zitat',

  canvas: {
    width: ZITAT_CONFIG.canvas.width,
    height: ZITAT_CONFIG.canvas.height,
  },

  primaryField: {
    key: 'quote',
    label: 'Zitat',
  },

  secondaryField: {
    key: 'name',
    label: 'Name',
  },

  calculateLayout,

  elements: [gradientOverlay, quoteMarkElement, quoteTextElement, nameTextElement],

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
export type ZitatFullState = ImageTwoTextState;
export type { ImageTwoTextActions as ZitatFullActions } from './factory';
