/**
 * Zitat Full Canvas Configuration
 * Quote sharepic with background image and gradient overlay
 *
 * Uses createImageTwoTextCanvas factory + Phase A/B helpers.
 */

import { ZITAT_CONFIG, calculateZitatLayout } from '../utils/zitatLayout';

import {
  createAiCapabilities,
  createImageTwoTextCanvas,
  createPrimaryText,
  createSecondaryText,
  fromLayout,
  wrapWithAi,
  type ImageTwoTextActions,
  type ImageTwoTextState,
} from './factory';

import type { ImageElementConfig, LayoutResult } from './types';

type ZitatState = ImageTwoTextState<'quote' | 'name'>;

const calculateLayout = (state: ZitatState): LayoutResult => {
  const quote = state.quote || '';
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

const quoteMarkElement: ImageElementConfig<ZitatState> = {
  id: 'quote-mark',
  type: 'image',
  x: fromLayout('quote-mark', 'x', ZITAT_CONFIG.quotationMark.x),
  y: fromLayout('quote-mark', 'y', ZITAT_CONFIG.quotationMark.y),
  order: 2,
  width: fromLayout('quote-mark', 'width', 100),
  height: fromLayout('quote-mark', 'height', 100),
  src: ZITAT_CONFIG.quotationMark.src,
  listening: true,
  draggable: true,
  offsetKey: 'quoteMarkOffset',
  opacityStateKey: 'quoteMarkOpacity',
};

const quoteTextElement = createPrimaryText<ZitatState>({
  id: 'quote-text',
  textKey: 'quote',
  order: 3,
  width: ZITAT_CONFIG.quote.maxWidth,
  fontFamily: ZITAT_CONFIG.quote.fontFamily,
  fontStyle: ZITAT_CONFIG.quote.fontStyle,
  lineHeight: ZITAT_CONFIG.quote.lineHeightRatio,
  defaultColor: ZITAT_CONFIG.quote.color,
  layoutFallback: { x: ZITAT_CONFIG.quote.x, y: 800, fontSize: ZITAT_CONFIG.quote.fontSize },
});

const nameTextElement = createSecondaryText<ZitatState>({
  id: 'name-text',
  textKey: 'name',
  order: 4,
  width: ZITAT_CONFIG.quote.maxWidth,
  fontFamily: ZITAT_CONFIG.author.fontFamily,
  fontStyle: ZITAT_CONFIG.author.fontStyle,
  defaultColor: ZITAT_CONFIG.author.color,
  layoutFallback: { x: ZITAT_CONFIG.author.x, y: 1000, fontSize: 40 },
});

const baseZitatConfig = createImageTwoTextCanvas({
  id: 'zitat',
  canvas: {
    width: ZITAT_CONFIG.canvas.width,
    height: ZITAT_CONFIG.canvas.height,
  },
  primaryField: { key: 'quote', label: 'Zitat' },
  secondaryField: { key: 'name', label: 'Name' },
  calculateLayout,
  elements: [quoteMarkElement, quoteTextElement, nameTextElement],
  features: { icons: true, shapes: true, illustrations: true },
  gradientOpacity: ZITAT_CONFIG.gradient.bottomOpacity,
  getCanvasText: (state) => {
    const quote = state.quote || '';
    const name = state.name || '';
    return `„${quote}"\n— ${name}`.trim();
  },
});

const zitatAiCapabilities = createAiCapabilities<ZitatState, ImageTwoTextActions>({
  id: 'zitat',
  errorLabel: 'Zitat',
  fields: [
    {
      field: 'quote',
      label: 'Zitat',
      read: (s) => s.quote || '',
      setter: (a) => a.setPrimary,
    },
    {
      field: 'name',
      label: 'Name',
      read: (s) => s.name || '',
      setter: (a) => a.setSecondary,
    },
  ],
});

export const zitatFullConfig = wrapWithAi(baseZitatConfig, 'zitat', zitatAiCapabilities);

export type ZitatFullState = ZitatState;
export type { ImageTwoTextActions as ZitatFullActions } from './factory';
