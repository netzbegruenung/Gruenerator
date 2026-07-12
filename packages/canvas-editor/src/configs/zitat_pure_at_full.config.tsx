/**
 * ZitatPure AT Full Canvas Configuration (Österreich / de-AT)
 * Quote sharepic on a solid dark-green background — centred, weißes
 * Anführungszeichen, weißes Zitat (Gotham), gelber Name (CI 2026).
 *
 * Reuses the DE zitat-pure geometry (ZITAT_PURE_CONFIG / calculateZitatPureLayout)
 * and only swaps brand tokens from getBrandTheme('de-AT').
 */

import { getBrandTheme } from '../brand/theme';
import { SYSTEM_ASSETS } from '../utils/canvasAssets';
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

const AT = getBrandTheme('de-AT');

const CANVAS_W = ZITAT_PURE_CONFIG.canvas.width;
const QUOTE_MARK_CENTER_X = (CANVAS_W - ZITAT_PURE_CONFIG.quotationMark.size) / 2;

type ZitatPureAtState = ColorTwoTextState<'quote' | 'name'>;

const metaFontColor = (_state: ZitatPureAtState, layout: LayoutResult) =>
  (layout._meta as { fontColor?: string } | undefined)?.fontColor;

const calculateLayout = (state: ZitatPureAtState): LayoutResult => {
  const quote = state.quote || '';
  const l = calculateZitatPureLayout(quote);
  const fontColor = AT.textColorMap[state.backgroundColor] ?? AT.colors.textOnDark;

  return {
    'quote-mark': {
      x: QUOTE_MARK_CENTER_X,
      y: l.quoteMarkY,
      width: ZITAT_PURE_CONFIG.quotationMark.size,
      height: ZITAT_PURE_CONFIG.quotationMark.size,
    },
    'quote-text': {
      x: ZITAT_PURE_CONFIG.quote.x,
      y: l.quoteY,
      width: ZITAT_PURE_CONFIG.quote.maxWidth,
      fontSize: state.customPrimaryFontSize ?? l.quoteFontSize,
    },
    'name-text': {
      x: ZITAT_PURE_CONFIG.author.x,
      y: l.authorY,
      width: ZITAT_PURE_CONFIG.quote.maxWidth,
      fontSize: state.customSecondaryFontSize ?? l.authorFontSize,
    },
    _meta: {
      fontColor,
      quoteFontSize: l.quoteFontSize,
      authorFontSize: l.authorFontSize,
    } as Record<string, unknown>,
  };
};

const quoteMarkElement: ImageElementConfig<ZitatPureAtState> = {
  id: 'quote-mark',
  type: 'image',
  x: fromLayout('quote-mark', 'x', QUOTE_MARK_CENTER_X),
  y: fromLayout('quote-mark', 'y', 120),
  order: 1,
  width: ZITAT_PURE_CONFIG.quotationMark.size,
  height: ZITAT_PURE_CONFIG.quotationMark.size,
  src: SYSTEM_ASSETS.quote.white.src,
  listening: true,
  draggable: true,
  offsetKey: 'quoteMarkOffset',
  opacityStateKey: 'quoteMarkOpacity',
};

const quoteTextElement = createPrimaryText<ZitatPureAtState>({
  id: 'quote-text',
  textKey: 'quote',
  order: 2,
  width: ZITAT_PURE_CONFIG.quote.maxWidth,
  fontFamily: AT.fonts.quoteShort,
  fontStyle: 'normal',
  lineHeight: ZITAT_PURE_CONFIG.quote.lineHeight,
  align: 'center',
  defaultColor: AT.colors.textOnDark,
  fillFallback: metaFontColor,
  layoutFallback: {
    x: ZITAT_PURE_CONFIG.quote.x,
    y: 200,
    fontSize: ZITAT_PURE_CONFIG.quote.fontSize,
  },
});

const nameTextElement = createSecondaryText<ZitatPureAtState>({
  id: 'name-text',
  textKey: 'name',
  order: 3,
  positionStateKey: 'namePosition',
  width: ZITAT_PURE_CONFIG.quote.maxWidth,
  fontFamily: AT.fonts.body,
  fontStyle: 'normal',
  align: 'center',
  // Name is always the accent colour (Gelb), independent of background.
  defaultColor: AT.colors.accent,
  layoutFallback: {
    x: ZITAT_PURE_CONFIG.author.x,
    y: 500,
    fontSize: ZITAT_PURE_CONFIG.author.fontSize,
  },
});

const baseZitatPureAtConfig = createColorTwoTextCanvas({
  id: 'zitat-pure-at',
  canvas: {
    width: ZITAT_PURE_CONFIG.canvas.width,
    height: ZITAT_PURE_CONFIG.canvas.height,
  },
  primaryField: { key: 'quote', label: 'Zitat' },
  secondaryField: { key: 'name', label: 'Name' },
  backgroundColors: AT.backgroundColors,
  defaultBackgroundColor: AT.defaultBackgroundColor,
  textColorMap: AT.textColorMap,
  calculateLayout,
  passthroughStateKeys: ['namePosition', 'quoteMarkOffset', 'quoteMarkOpacity'],
  elements: [quoteMarkElement, quoteTextElement, nameTextElement],
  features: { icons: true, shapes: true, illustrations: true },
  getCanvasText: (state) => {
    const quote = state.quote || '';
    const name = state.name || '';
    return `„${quote}"\n— ${name}`.trim();
  },
});

const zitatPureAtAiCapabilities = createAiCapabilities<ZitatPureAtState, ColorTwoTextActions>({
  id: 'zitat-pure-at',
  errorLabel: 'Zitat-Pur (AT)',
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

export const zitatPureAtFullConfig = wrapWithAi(
  baseZitatPureAtConfig,
  'zitat-pure-at',
  zitatPureAtAiCapabilities
);

export type ZitatPureAtFullState = ZitatPureAtState;
export type { ColorTwoTextActions as ZitatPureAtFullActions } from './factory';
