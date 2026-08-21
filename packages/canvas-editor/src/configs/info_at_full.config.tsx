/**
 * Info AT Full Canvas Configuration (Österreich / de-AT)
 *
 * Farbfläche, Logo rechts oben, darunter mittig eine kleine Introline
 * (Gotham Book, weiß), der Infotext (Gotham Ultra, weiß) und eine gelbe
 * Vollkorn-Schlusszeile.
 *
 * Eigene Geometrie über INFO_AT_CONFIG — mit der deutschen Info-Vorlage
 * (Header / Subheader / Body, linksbündig, Sonnenblume) hat das Sujet außer
 * dem Namen nichts gemeinsam.
 *
 * Gebaut auf createColorTwoTextCanvas: primary ist der Infotext, secondary die
 * Introline; `accent` fährt über passthroughStateKeys mit und bekommt unten
 * einen eigenen Setter.
 */

import { getBrandTheme } from '../brand/theme';
import { INFO_AT_CONFIG, calculateInfoAtLayout } from '../utils/infoAtLayout';

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
import { getPlaceholder } from './placeholders';

import type {
  FullCanvasConfig,
  ImageElementConfig,
  LayoutResult,
  TextElementConfig,
} from './types';

const AT = getBrandTheme('de-AT');
const I = INFO_AT_CONFIG;

type InfoAtState = ColorTwoTextState<'text' | 'introline'>;

const calculateLayout = (state: InfoAtState): LayoutResult => {
  const l = calculateInfoAtLayout(
    state.introline || '',
    state.text || '',
    (state.accent as string) || ''
  );
  const [intro, text, accent] = l.zones;

  return {
    'introline-text': {
      x: I.margin,
      y: intro.y,
      width: I.maxWidth,
      fontSize: state.customSecondaryFontSize ?? intro.fontSize,
    },
    'text-text': {
      x: I.margin,
      y: text.y,
      width: I.maxWidth,
      fontSize: state.customPrimaryFontSize ?? text.fontSize,
    },
    'accent-text': { x: I.margin, y: accent.y, width: I.maxWidth, fontSize: accent.fontSize },
    _meta: { fontColor: AT.colors.textOnDark } as Record<string, unknown>,
  };
};

const logoElement: ImageElementConfig<InfoAtState> = {
  id: 'logo',
  type: 'image',
  x: I.canvas.width - I.logo.margin - I.logo.width,
  y: I.logo.margin,
  order: 1,
  width: I.logo.width,
  height: I.logo.height,
  src: I.logo.src,
  draggable: true,
  opacityStateKey: 'logoOpacity',
  offsetKey: 'logoOffset',
};

const introlineElement = createSecondaryText<InfoAtState>({
  id: 'introline-text',
  textKey: 'introline',
  order: 2,
  width: I.maxWidth,
  fontFamily: I.introline.fontFamily,
  fontStyle: I.introline.fontStyle,
  lineHeight: I.introline.lineHeightRatio,
  align: 'center',
  defaultColor: I.introline.color,
  layoutFallback: { x: I.margin, y: 420, fontSize: I.introline.fontSize },
});

const textElement = createPrimaryText<InfoAtState>({
  id: 'text-text',
  textKey: 'text',
  order: 3,
  width: I.maxWidth,
  fontFamily: I.text.fontFamily,
  fontStyle: I.text.fontStyle,
  lineHeight: I.text.lineHeightRatio,
  align: 'center',
  defaultColor: I.text.color,
  layoutFallback: { x: I.margin, y: 480, fontSize: I.text.fontSize },
});

const accentElement: TextElementConfig<InfoAtState> = {
  id: 'accent-text',
  type: 'text',
  x: fromLayout('accent-text', 'x', I.margin),
  y: fromLayout('accent-text', 'y', 900),
  order: 4,
  textKey: 'accent',
  width: I.maxWidth,
  fontSize: fromLayout('accent-text', 'fontSize', I.text.fontSize),
  fontFamily: `${I.accent.fontFamily}, Georgia, serif`,
  fontStyle: I.accent.fontStyle,
  align: 'center',
  lineHeight: I.accent.lineHeightRatio,
  wrap: 'word',
  padding: 0,
  editable: true,
  draggable: true,
  fill: I.accent.color,
  // Ohne diese vier Schluessel zeigt die Werkzeugleiste Farbe, Schriftgroesse
  // und Deckkraft an, ohne dass einer der Regler etwas schreibt, und der Zug
  // am Element verpufft. Die Fabrik-Texte bekommen sie automatisch.
  fillStateKey: 'accentColor',
  fontSizeStateKey: 'customAccentFontSize',
  opacityStateKey: 'accentOpacity',
  positionStateKey: 'accentPosition',
};

const baseInfoAtConfig = createColorTwoTextCanvas({
  id: 'info-at',
  canvas: { width: I.canvas.width, height: I.canvas.height },
  primaryField: { key: 'text', label: 'Infotext' },
  secondaryField: { key: 'introline', label: 'Introline' },
  backgroundColors: AT.backgroundColors,
  defaultBackgroundColor: AT.defaultBackgroundColor,
  textColorMap: AT.textColorMap,
  calculateLayout,
  passthroughStateKeys: [
    'accent',
    'accentColor',
    'customAccentFontSize',
    'accentOpacity',
    'accentPosition',
    'logoOpacity',
    'logoOffset',
  ],
  elements: [logoElement, introlineElement, textElement, accentElement],
  features: { icons: true, shapes: true, illustrations: true },
  getCanvasText: (state) =>
    [state.introline || '', state.text || '', (state.accent as string) || '']
      .filter(Boolean)
      .join('\n'),
});

/**
 * Die Faktory kennt zwei Textfelder; dieses Sujet hat drei. Ohne eigenen Setter
 * wäre die gelbe Schlusszeile weder aus der Seitenleiste noch für die KI
 * erreichbar — derselbe Fall wie beim Overlay-Dreizeiler.
 */
export interface InfoAtFullActions extends ColorTwoTextActions {
  setAccent: (val: string) => void;
}

const infoAtConfig: FullCanvasConfig<InfoAtState, InfoAtFullActions> = {
  ...baseInfoAtConfig,
  multiPage: {
    enabled: true,
    maxPages: baseInfoAtConfig.multiPage?.maxPages ?? 10,
    heterogeneous: true,
    defaultNewPageState: {
      ...baseInfoAtConfig.multiPage?.defaultNewPageState,
      accent: getPlaceholder('accent'),
    } as Partial<InfoAtState>,
  },
  createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => ({
    ...baseInfoAtConfig.createActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      callbacks
    ),
    setAccent: (val: string) => {
      setState({ accent: val } as Partial<InfoAtState>);
      callbacks.onAccentChange?.(val);
      debouncedSaveToHistory(getState());
    },
  }),
};

const infoAtAiCapabilities = createAiCapabilities<InfoAtState, InfoAtFullActions>({
  id: 'info-at',
  errorLabel: 'Info (AT)',
  fields: [
    {
      field: 'introline',
      label: 'Introline',
      read: (s) => s.introline || '',
      setter: (a) => a.setSecondary,
    },
    {
      field: 'text',
      label: 'Infotext',
      read: (s) => s.text || '',
      setter: (a) => a.setPrimary,
    },
    {
      field: 'accent',
      label: 'Schlusszeile (gelb)',
      read: (s) => (s.accent as string) || '',
      setter: (a) => a.setAccent,
    },
  ],
  background: { read: (s) => s.backgroundColor as `#${string}` },
});

export const infoAtFullConfig = wrapWithAi(infoAtConfig, 'info-at', infoAtAiCapabilities);

export type InfoAtFullState = InfoAtState;
