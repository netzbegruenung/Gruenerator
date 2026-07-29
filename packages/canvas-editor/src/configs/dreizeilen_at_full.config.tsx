/**
 * Dreizeilen AT Full Canvas Configuration (Österreich / de-AT)
 *
 * Dreizeilige Headline auf dunkelgrüner Fläche (CI 2026): Zeile 1 + 3 weiß
 * (Gotham Ultra), Zeile 2 gelbe Vollkorn-Betonung. Ohne Logo — die CI setzt
 * die Fläche als reine Typografie; das Logo trägt die Overlay-Variante.
 *
 * Built on createColorTwoTextCanvas (line1 + line3) plus a third editable
 * accent zone (line2, textKey 'accent').
 */

import { getBrandTheme } from '../brand/theme';
import { HEADLINE_AT_CONFIG, calculateHeadlineAtLayout } from '../utils/headlineAtLayout';
import { getPlaceholder } from './placeholders';

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

import type { FullCanvasConfig, LayoutResult, TextElementConfig } from './types';

const AT = getBrandTheme('de-AT');
const H = HEADLINE_AT_CONFIG;
const LEFT_X = H.margin.x;

type DreizeilenAtState = ColorTwoTextState<'line1' | 'line3'>;

const calculateLayout = (state: DreizeilenAtState): LayoutResult => {
  const line1 = state.line1 || '';
  const line2 = (state.accent as string) || '';
  const line3 = state.line3 || '';

  const [z1, z2, z3] = calculateHeadlineAtLayout([
    {
      text: line1,
      fontSize: H.headline.fontSize,
      fontFamily: H.headline.fontFamily,
      fontStyle: H.headline.fontStyle,
    },
    {
      text: line2,
      fontSize: H.accent.fontSize,
      fontFamily: H.accent.fontFamily,
      fontStyle: H.accent.fontStyle,
    },
    {
      text: line3,
      fontSize: H.headline.fontSize,
      fontFamily: H.headline.fontFamily,
      fontStyle: H.headline.fontStyle,
    },
  ]);

  return {
    'line1-text': {
      x: LEFT_X,
      y: z1.y,
      width: H.maxWidth,
      fontSize: state.customPrimaryFontSize ?? z1.fontSize,
    },
    'accent-text': { x: LEFT_X, y: z2.y, width: H.maxWidth, fontSize: z2.fontSize },
    'line3-text': {
      x: LEFT_X,
      y: z3.y,
      width: H.maxWidth,
      fontSize: state.customSecondaryFontSize ?? z3.fontSize,
    },
    _meta: { fontColor: AT.colors.textOnDark } as Record<string, unknown>,
  };
};

const line1Element = createPrimaryText<DreizeilenAtState>({
  id: 'line1-text',
  textKey: 'line1',
  order: 2,
  width: H.maxWidth,
  fontFamily: H.headline.fontFamily,
  fontStyle: H.headline.fontStyle,
  lineHeight: H.lineHeightRatio,
  align: 'left',
  defaultColor: AT.colors.textOnDark,
  layoutFallback: { x: LEFT_X, y: H.margin.top, fontSize: H.headline.fontSize },
});

const accentElement: TextElementConfig<DreizeilenAtState> = {
  id: 'accent-text',
  type: 'text',
  x: fromLayout('accent-text', 'x', LEFT_X),
  y: fromLayout('accent-text', 'y', 400),
  order: 3,
  textKey: 'accent',
  width: H.maxWidth,
  fontSize: fromLayout('accent-text', 'fontSize', H.accent.fontSize),
  fontFamily: `${H.accent.fontFamily}, Georgia, serif`,
  fontStyle: H.accent.fontStyle,
  align: 'left',
  lineHeight: H.lineHeightRatio,
  wrap: 'word',
  padding: 0,
  editable: true,
  draggable: true,
  fill: AT.colors.accent,
};

const line3Element = createSecondaryText<DreizeilenAtState>({
  id: 'line3-text',
  textKey: 'line3',
  order: 4,
  width: H.maxWidth,
  fontFamily: H.headline.fontFamily,
  fontStyle: H.headline.fontStyle,
  lineHeight: H.lineHeightRatio,
  align: 'left',
  defaultColor: AT.colors.textOnDark,
  layoutFallback: { x: LEFT_X, y: 600, fontSize: H.headline.fontSize },
});

const baseDreizeilenAtConfig = createColorTwoTextCanvas({
  id: 'dreizeilen-at',
  canvas: { width: H.canvas.width, height: H.canvas.height },
  primaryField: { key: 'line1', label: 'Zeile 1' },
  secondaryField: { key: 'line3', label: 'Zeile 3' },
  backgroundColors: AT.backgroundColors,
  defaultBackgroundColor: AT.defaultBackgroundColor,
  textColorMap: AT.textColorMap,
  calculateLayout,
  passthroughStateKeys: ['accent'],
  elements: [line1Element, accentElement, line3Element],
  features: { icons: true, shapes: true, illustrations: true },
  getCanvasText: (state) => {
    const line1 = state.line1 || '';
    const line2 = (state.accent as string) || '';
    const line3 = state.line3 || '';
    return [line1, line2, line3].filter(Boolean).join('\n');
  },
});

/**
 * The factory owns exactly two text fields, but the sujet has three. The gelbe
 * Betonungszeile therefore needs its own setter — without one it stayed absent
 * from the AI capabilities below, so the Studio's AI panel could rewrite lines
 * 1 and 3 but never the emphasis line that carries the message.
 */
export interface DreizeilenAtFullActions extends ColorTwoTextActions {
  setAccent: (val: string) => void;
}

const dreizeilenAtConfig: FullCanvasConfig<DreizeilenAtState, DreizeilenAtFullActions> = {
  ...baseDreizeilenAtConfig,
  // The factory seeds only its own two fields, so a new page came up with two
  // white lines and no gelbe Betonung at all.
  multiPage: {
    enabled: true,
    maxPages: baseDreizeilenAtConfig.multiPage?.maxPages ?? 10,
    heterogeneous: true,
    defaultNewPageState: {
      ...baseDreizeilenAtConfig.multiPage?.defaultNewPageState,
      accent: getPlaceholder('accent'),
    } as Partial<DreizeilenAtState>,
  },
  createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => ({
    ...baseDreizeilenAtConfig.createActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      callbacks
    ),
    setAccent: (val: string) => {
      setState({ accent: val } as Partial<DreizeilenAtState>);
      callbacks.onAccentChange?.(val);
      debouncedSaveToHistory(getState());
    },
  }),
};

const dreizeilenAtAiCapabilities = createAiCapabilities<DreizeilenAtState, DreizeilenAtFullActions>(
  {
    id: 'dreizeilen-at',
    errorLabel: '3 Zeilen (AT)',
    fields: [
      { field: 'line1', label: 'Zeile 1', read: (s) => s.line1 || '', setter: (a) => a.setPrimary },
      {
        field: 'accent',
        label: 'Zeile 2 (Betonung)',
        read: (s) => (s.accent as string) || '',
        setter: (a) => a.setAccent,
      },
      {
        field: 'line3',
        label: 'Zeile 3',
        read: (s) => s.line3 || '',
        setter: (a) => a.setSecondary,
      },
    ],
    background: { read: (s) => s.backgroundColor as `#${string}` },
  }
);

export const dreizeilenAtFullConfig = wrapWithAi(
  dreizeilenAtConfig,
  'dreizeilen-at',
  dreizeilenAtAiCapabilities
);

export type DreizeilenAtFullState = DreizeilenAtState;
