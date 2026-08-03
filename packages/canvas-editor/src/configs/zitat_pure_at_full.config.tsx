/**
 * ZitatPure AT Full Canvas Configuration (Österreich / de-AT)
 *
 * Zitat auf einfarbiger Fläche — mittig, weißes Anführungszeichen, weißes
 * Zitat in Gotham Narrow Ultra, gelber Name.
 *
 * Eigene Geometrie über ZITAT_PURE_AT_CONFIG. Die deutsche ZITAT_PURE_CONFIG
 * setzt bei 81–97 px in ein 930er Satzmaß und schätzt die Zeilenzahl mit einer
 * Zeichenbreiten-Heuristik, die bei den schmalen AT-Schnitten um mehrere
 * Zeilen danebenliegt — der Name schwebte dadurch frei unter dem Zitat.
 */

import { getBrandTheme } from '../brand/theme';
import { ZITAT_PURE_AT_CONFIG, calculateZitatPureAtLayout } from '../utils/zitatPureAtLayout';

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
const Z = ZITAT_PURE_AT_CONFIG;

type ZitatPureAtState = ColorTwoTextState<'quote' | 'name'>;

const metaFontColor = (_state: ZitatPureAtState, layout: LayoutResult) =>
  (layout._meta as { fontColor?: string } | undefined)?.fontColor;

const calculateLayout = (state: ZitatPureAtState): LayoutResult => {
  const l = calculateZitatPureAtLayout(
    state.quote || '',
    state.name || '',
    state.customPrimaryFontSize
  );
  const fontColor = AT.textColorMap[state.backgroundColor] ?? AT.colors.textOnDark;

  return {
    'quote-mark': {
      x: l.quoteMarkX,
      y: l.quoteMarkY,
      width: l.quoteMarkSize,
      height: l.quoteMarkSize,
    },
    'quote-text': {
      x: Z.margin,
      y: l.quoteY,
      width: Z.maxWidth,
      fontSize: l.quoteFontSize,
      lineHeight: l.lineHeight,
    },
    'name-text': {
      x: Z.margin,
      y: l.authorY,
      width: Z.maxWidth,
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
  x: fromLayout('quote-mark', 'x', (Z.canvas.width - 106) / 2),
  y: fromLayout('quote-mark', 'y', 400),
  order: 1,
  width: fromLayout('quote-mark', 'width', 106),
  height: fromLayout('quote-mark', 'height', 106),
  src: Z.quotationMark.src,
  listening: true,
  draggable: true,
  offsetKey: 'quoteMarkOffset',
  opacityStateKey: 'quoteMarkOpacity',
};

const quoteTextElement = createPrimaryText<ZitatPureAtState>({
  id: 'quote-text',
  textKey: 'quote',
  order: 2,
  width: Z.maxWidth,
  fontFamily: Z.quote.fontFamily,
  fontStyle: 'normal',
  lineHeight: Z.quote.lineHeightRatio,
  align: 'center',
  defaultColor: AT.colors.textOnDark,
  fillFallback: metaFontColor,
  layoutFallback: { x: Z.margin, y: 500, fontSize: Z.quote.fontSize },
});

const nameTextElement = createSecondaryText<ZitatPureAtState>({
  id: 'name-text',
  textKey: 'name',
  order: 3,
  positionStateKey: 'namePosition',
  width: Z.maxWidth,
  fontFamily: AT.fonts.body,
  fontStyle: 'normal',
  align: 'center',
  // Name is always the accent colour (Gelb), independent of background.
  defaultColor: AT.colors.accent,
  layoutFallback: { x: Z.margin, y: 850, fontSize: 34 },
});

const baseZitatPureAtConfig = createColorTwoTextCanvas({
  id: 'zitat-pure-at',
  canvas: {
    width: Z.canvas.width,
    height: Z.canvas.height,
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
