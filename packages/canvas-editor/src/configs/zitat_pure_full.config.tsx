/**
 * ZitatPure Full Canvas Configuration
 * Quote sharepic with solid color background.
 *
 * Uses createColorTwoTextCanvas factory + Phase A/B helpers.
 */

import { ZITAT_PURE_CONFIG, calculateZitatPureLayout } from '../utils/zitatPureLayout';

import {
  createAiCapabilities,
  createColorTwoTextCanvas,
  createPrimaryText,
  createSecondaryText,
  fromLayout,
  wrapWithAi,
  type ColorTwoTextActions,
  type ColorTwoTextState,
} from './factory';

import type { ImageElementConfig, LayoutResult } from './types';
import type { BackgroundColorOption } from '../sidebar/types';

const BACKGROUND_COLORS: BackgroundColorOption[] = [
  { id: 'green', label: 'Grün', color: '#6CCD87' },
  { id: 'sand', label: 'Sand', color: '#F5F1E9' },
];

const FONT_COLORS: Record<string, string> = {
  '#6CCD87': '#005437',
  '#F5F1E9': '#262626',
};

type ZitatPureState = ColorTwoTextState<'quote' | 'name'>;

const metaFontColor = (_state: ZitatPureState, layout: LayoutResult) =>
  (layout._meta as { fontColor?: string } | undefined)?.fontColor;

const calculateLayout = (state: ZitatPureState): LayoutResult => {
  const quote = state.quote || '';
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

const sunflowerElement: ImageElementConfig<ZitatPureState> = {
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

const quoteMarkElement: ImageElementConfig<ZitatPureState> = {
  id: 'quote-mark',
  type: 'image',
  x: fromLayout('quote-mark', 'x', ZITAT_PURE_CONFIG.quotationMark.x),
  y: fromLayout('quote-mark', 'y', 120),
  order: 2,
  width: ZITAT_PURE_CONFIG.quotationMark.size,
  height: ZITAT_PURE_CONFIG.quotationMark.size,
  src: ZITAT_PURE_CONFIG.quotationMark.src,
  listening: true,
  draggable: true,
  offsetKey: 'quoteMarkOffset',
  opacityStateKey: 'quoteMarkOpacity',
};

const quoteTextElement = createPrimaryText<ZitatPureState>({
  id: 'quote-text',
  textKey: 'quote',
  order: 3,
  width: ZITAT_PURE_CONFIG.quote.maxWidth,
  fontFamily: ZITAT_PURE_CONFIG.quote.fontFamily,
  fontStyle: ZITAT_PURE_CONFIG.quote.fontStyle,
  lineHeight: ZITAT_PURE_CONFIG.quote.lineHeight,
  defaultColor: '#005437',
  fillFallback: metaFontColor,
  layoutFallback: {
    x: ZITAT_PURE_CONFIG.quote.x,
    y: 200,
    fontSize: ZITAT_PURE_CONFIG.quote.fontSize,
  },
});

const nameTextElement = createSecondaryText<ZitatPureState>({
  id: 'name-text',
  textKey: 'name',
  order: 4,
  positionStateKey: 'namePosition',
  width: ZITAT_PURE_CONFIG.quote.maxWidth,
  fontFamily: ZITAT_PURE_CONFIG.author.fontFamily,
  fontStyle: ZITAT_PURE_CONFIG.author.fontStyle,
  defaultColor: '#005437',
  fillFallback: metaFontColor,
  layoutFallback: {
    x: ZITAT_PURE_CONFIG.author.x,
    y: 500,
    fontSize: ZITAT_PURE_CONFIG.author.fontSize,
  },
});

const baseZitatPureConfig = createColorTwoTextCanvas({
  id: 'zitat-pure',
  canvas: {
    width: ZITAT_PURE_CONFIG.canvas.width,
    height: ZITAT_PURE_CONFIG.canvas.height,
  },
  primaryField: { key: 'quote', label: 'Zitat' },
  secondaryField: { key: 'name', label: 'Name' },
  backgroundColors: BACKGROUND_COLORS,
  defaultBackgroundColor: ZITAT_PURE_CONFIG.background.color,
  textColorMap: FONT_COLORS,
  calculateLayout,
  passthroughStateKeys: ['namePosition', 'quoteMarkOffset', 'quoteMarkOpacity'],
  elements: [sunflowerElement, quoteMarkElement, quoteTextElement, nameTextElement],
  features: { icons: true, shapes: true, illustrations: true },
  getCanvasText: (state) => {
    const quote = state.quote || '';
    const name = state.name || '';
    return `„${quote}"\n— ${name}`.trim();
  },
});

const zitatPureAiCapabilities = createAiCapabilities<ZitatPureState, ColorTwoTextActions>({
  id: 'zitat-pure',
  errorLabel: 'Zitat-Pure',
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
  background: { read: (s) => s.backgroundColor as `#${string}` },
});

export const zitatPureFullConfig = wrapWithAi(
  baseZitatPureConfig,
  'zitat-pure',
  zitatPureAiCapabilities
);

export type ZitatPureFullState = ZitatPureState;
export type { ColorTwoTextActions as ZitatPureFullActions } from './factory';
