/**
 * Zitat AT Full Canvas Configuration (Österreich / de-AT)
 *
 * Foto vollflächig, darüber ein leichter grauer Verlauf, darauf mittig das
 * gelbe Anführungszeichen, das weiße Zitat und der gelbe Name; Logo rechts
 * oben.
 *
 * Eigene Geometrie über ZITAT_AT_CONFIG — die deutsche ZITAT_CONFIG setzt
 * linksbündig am Bildboden und trägt kein Logo, was mit der CI 2026 nicht
 * zusammengeht.
 */

import { getBrandTheme } from '../brand/theme';
import { ZITAT_AT_CONFIG, calculateZitatAtLayout } from '../utils/zitatAtLayout';

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
const Z = ZITAT_AT_CONFIG;

type ZitatAtState = ImageTwoTextState<'quote' | 'name'>;

const calculateLayout = (state: ZitatAtState): LayoutResult => {
  const layout = calculateZitatAtLayout(
    state.quote || '',
    state.name || '',
    state.customPrimaryFontSize ?? Z.quote.fontSize,
    AT.fonts.quoteShort
  );

  return {
    'quote-mark': {
      x: layout.quoteMarkX,
      y: layout.quoteMarkY,
      width: layout.quoteMarkSize,
      height: layout.quoteMarkSize,
    },
    'quote-text': {
      x: Z.margin,
      y: layout.quoteY,
      width: Z.maxWidth,
      fontSize: layout.quoteFontSize,
      lineHeight: layout.lineHeight,
    },
    'name-text': {
      x: Z.margin,
      y: layout.authorY,
      width: Z.maxWidth,
      fontSize: state.customSecondaryFontSize ?? layout.authorFontSize,
    },
  };
};

const quoteMarkElement: ImageElementConfig<ZitatAtState> = {
  id: 'quote-mark',
  type: 'image',
  x: fromLayout('quote-mark', 'x', (Z.canvas.width - 64) / 2),
  y: fromLayout('quote-mark', 'y', 500),
  order: 2,
  width: fromLayout('quote-mark', 'width', 64),
  height: fromLayout('quote-mark', 'height', 64),
  src: Z.quotationMark.src,
  listening: true,
  draggable: true,
  offsetKey: 'quoteMarkOffset',
  opacityStateKey: 'quoteMarkOpacity',
};

const quoteTextElement = createPrimaryText<ZitatAtState>({
  id: 'quote-text',
  textKey: 'quote',
  order: 3,
  width: Z.maxWidth,
  fontFamily: AT.fonts.quoteShort,
  fontStyle: 'normal',
  lineHeight: Z.quote.lineHeightRatio,
  align: 'center',
  defaultColor: AT.colors.textOnDark,
  layoutFallback: { x: Z.margin, y: 600, fontSize: Z.quote.fontSize },
});

const nameTextElement = createSecondaryText<ZitatAtState>({
  id: 'name-text',
  textKey: 'name',
  order: 4,
  width: Z.maxWidth,
  fontFamily: AT.fonts.body,
  fontStyle: 'normal',
  align: 'center',
  // Name is always the accent colour (Gelb).
  defaultColor: AT.colors.accent,
  layoutFallback: { x: Z.margin, y: 850, fontSize: 34 },
});

const logoElement: ImageElementConfig<ZitatAtState> = {
  id: 'logo',
  type: 'image',
  x: Z.canvas.width - Z.logo.margin - Z.logo.width,
  y: Z.logo.margin,
  order: 5,
  width: Z.logo.width,
  height: Z.logo.height,
  src: AT.logo?.src ?? '',
  draggable: true,
};

const baseZitatAtConfig = createImageTwoTextCanvas({
  id: 'zitat-at',
  canvas: {
    width: Z.canvas.width,
    height: Z.canvas.height,
  },
  primaryField: { key: 'quote', label: 'Zitat' },
  secondaryField: { key: 'name', label: 'Name' },
  calculateLayout,
  elements: [quoteMarkElement, quoteTextElement, nameTextElement, logoElement],
  features: { icons: true, shapes: true, illustrations: true },
  // Anders als beim deutschen Zitat kein schwarzer Verlauf für Textkontrast,
  // sondern nur ein leichter grauer Schleier — die österreichische CI kennt
  // keinen grünen oder schwarzen Verlauf.
  gradientOpacity: Z.gradient.bottomOpacity,
  gradientColor: Z.gradient.color,
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
