/**
 * Zitat AT Full Canvas Configuration (Österreich / de-AT)
 * Quote sharepic over a user background image — weißes Anführungszeichen,
 * weißes Zitat (Gotham), gelber Name (CI 2026).
 *
 * Reuses the DE zitat geometry (ZITAT_CONFIG / calculateZitatLayout) and only
 * swaps brand tokens from getBrandTheme('de-AT').
 */

import { getBrandTheme } from '../brand/theme';
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

const AT = getBrandTheme('de-AT');

type ZitatAtState = ImageTwoTextState<'quote' | 'name'>;

const calculateLayout = (state: ZitatAtState): LayoutResult => {
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

const quoteMarkElement: ImageElementConfig<ZitatAtState> = {
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

const quoteTextElement = createPrimaryText<ZitatAtState>({
  id: 'quote-text',
  textKey: 'quote',
  order: 3,
  width: ZITAT_CONFIG.quote.maxWidth,
  fontFamily: AT.fonts.quoteShort,
  fontStyle: 'normal',
  lineHeight: ZITAT_CONFIG.quote.lineHeightRatio,
  defaultColor: AT.colors.textOnDark,
  layoutFallback: { x: ZITAT_CONFIG.quote.x, y: 800, fontSize: ZITAT_CONFIG.quote.fontSize },
});

const nameTextElement = createSecondaryText<ZitatAtState>({
  id: 'name-text',
  textKey: 'name',
  order: 4,
  width: ZITAT_CONFIG.quote.maxWidth,
  fontFamily: AT.fonts.body,
  fontStyle: 'normal',
  // Name is always the accent colour (Gelb).
  defaultColor: AT.colors.accent,
  layoutFallback: { x: ZITAT_CONFIG.author.x, y: 1000, fontSize: 40 },
});

const baseZitatAtConfig = createImageTwoTextCanvas({
  id: 'zitat-at',
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

const zitatAtAiCapabilities = createAiCapabilities<ZitatAtState, ImageTwoTextActions>({
  id: 'zitat-at',
  errorLabel: 'Zitat (AT)',
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

export const zitatAtFullConfig = wrapWithAi(baseZitatAtConfig, 'zitat-at', zitatAtAiCapabilities);

export type ZitatAtFullState = ZitatAtState;
export type { ImageTwoTextActions as ZitatAtFullActions } from './factory';
