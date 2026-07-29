/**
 * Dreizeilen-Overlay AT Full Canvas Configuration (Österreich / de-AT)
 *
 * Foto vollflächig, darauf eine zentrierte quadratische Farbfläche (Dunkel-
 * oder Hellgrün) mit zentrierter dreizeiliger Headline (Zeile 1 + 3 weiß Gotham
 * Ultra, Zeile 2 gelbe Vollkorn-Betonung), Subline und mittigem Logo.
 *
 * Built on createImageTwoTextCanvas (photo background + pan/scale/lock) with
 * line1 as the primary and the subline as the secondary field; `accent`,
 * `line3` and `boxColor` ride along via passthroughStateKeys and get their own
 * setters below.
 */

import { getBrandTheme } from '../brand/theme';
import { OVERLAY_AT_CONFIG, calculateOverlayAtLayout } from '../utils/overlayAtLayout';

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
import { getPlaceholder } from './placeholders';

import type {
  FullCanvasConfig,
  ImageElementConfig,
  LayoutResult,
  RectElementConfig,
  TextElementConfig,
} from './types';

const AT = getBrandTheme('de-AT');
const O = OVERLAY_AT_CONFIG;
/** Text is centred within the box's measure, so every zone shares this x. */
const TEXT_X = O.box.x + O.padding;

type OverlayAtState = ImageTwoTextState<'line1' | 'subline'>;

const boxColorOf = (state: OverlayAtState): string =>
  (state.boxColor as string) || AT.defaultBackgroundColor;

const calculateLayout = (state: OverlayAtState): LayoutResult => {
  const layout = calculateOverlayAtLayout([
    {
      text: state.line1 || '',
      fontSize: O.headline.fontSize,
      fontFamily: O.headline.fontFamily,
      fontStyle: O.headline.fontStyle,
    },
    {
      text: (state.accent as string) || '',
      fontSize: O.accent.fontSize,
      fontFamily: O.accent.fontFamily,
      fontStyle: O.accent.fontStyle,
    },
    {
      text: (state.line3 as string) || '',
      fontSize: O.headline.fontSize,
      fontFamily: O.headline.fontFamily,
      fontStyle: O.headline.fontStyle,
    },
    {
      text: state.subline || '',
      fontSize: O.subline.fontSize,
      fontFamily: O.subline.fontFamily,
      fontStyle: O.subline.fontStyle,
      lineHeightRatio: O.subline.lineHeightRatio,
    },
  ]);
  const [z1, z2, z3, zSub] = layout.zones;

  return {
    'line1-text': { x: TEXT_X, y: z1.y, width: O.maxWidth, fontSize: z1.fontSize },
    'accent-text': { x: TEXT_X, y: z2.y, width: O.maxWidth, fontSize: z2.fontSize },
    'line3-text': { x: TEXT_X, y: z3.y, width: O.maxWidth, fontSize: z3.fontSize },
    'subline-text': {
      x: TEXT_X,
      y: zSub.y,
      width: O.maxWidth,
      fontSize: state.customSecondaryFontSize ?? zSub.fontSize,
    },
    logo: layout.logo,
    _meta: { fontColor: AT.colors.textOnDark } as Record<string, unknown>,
  };
};

/**
 * Solid fallback UNDER the photo. The image factory contributes only the photo
 * element, so before a picture is chosen the canvas was transparent and the
 * green box floated on nothing — the napi route already fell back to
 * Dunkelgrün, the editor did not. Negative order keeps it below the photo,
 * where it is invisible as soon as one is set.
 */
const canvasFallbackElement: RectElementConfig<OverlayAtState> = {
  id: 'canvas-fallback',
  type: 'rect',
  order: -1,
  x: 0,
  y: 0,
  width: O.canvas.width,
  height: O.canvas.height,
  fill: AT.colors.primary,
  listening: false,
};

const boxElement: RectElementConfig<OverlayAtState> = {
  id: 'overlay-box',
  type: 'rect',
  order: 1,
  x: O.box.x,
  y: O.box.y,
  width: O.box.width,
  height: O.box.height,
  fill: boxColorOf,
  listening: false,
};

const line1Element = createPrimaryText<OverlayAtState>({
  id: 'line1-text',
  textKey: 'line1',
  order: 2,
  width: O.maxWidth,
  fontFamily: O.headline.fontFamily,
  fontStyle: O.headline.fontStyle,
  lineHeight: O.lineHeightRatio,
  align: 'center',
  defaultColor: AT.colors.textOnDark,
  layoutFallback: { x: TEXT_X, y: O.box.y + O.padding, fontSize: O.headline.fontSize },
});

const accentElement: TextElementConfig<OverlayAtState> = {
  id: 'accent-text',
  type: 'text',
  x: fromLayout('accent-text', 'x', TEXT_X),
  y: fromLayout('accent-text', 'y', O.box.y + 200),
  order: 3,
  textKey: 'accent',
  width: O.maxWidth,
  fontSize: fromLayout('accent-text', 'fontSize', O.accent.fontSize),
  fontFamily: `${O.accent.fontFamily}, Georgia, serif`,
  fontStyle: O.accent.fontStyle,
  align: 'center',
  lineHeight: O.lineHeightRatio,
  wrap: 'word',
  padding: 0,
  editable: true,
  draggable: true,
  fill: AT.colors.accent,
};

const line3Element: TextElementConfig<OverlayAtState> = {
  id: 'line3-text',
  type: 'text',
  x: fromLayout('line3-text', 'x', TEXT_X),
  y: fromLayout('line3-text', 'y', O.box.y + 320),
  order: 4,
  textKey: 'line3',
  width: O.maxWidth,
  fontSize: fromLayout('line3-text', 'fontSize', O.headline.fontSize),
  fontFamily: `${O.headline.fontFamily}, Arial, sans-serif`,
  fontStyle: O.headline.fontStyle,
  align: 'center',
  lineHeight: O.lineHeightRatio,
  wrap: 'word',
  padding: 0,
  editable: true,
  draggable: true,
  fill: AT.colors.textOnDark,
};

const sublineElement = createSecondaryText<OverlayAtState>({
  id: 'subline-text',
  textKey: 'subline',
  order: 5,
  width: O.maxWidth,
  fontFamily: O.subline.fontFamily,
  fontStyle: O.subline.fontStyle,
  lineHeight: O.subline.lineHeightRatio,
  align: 'center',
  defaultColor: AT.colors.textOnDark,
  layoutFallback: { x: TEXT_X, y: O.box.y + 500, fontSize: O.subline.fontSize },
});

const logoElement: ImageElementConfig<OverlayAtState> = {
  id: 'logo',
  type: 'image',
  x: fromLayout('logo', 'x', O.box.x + (O.box.width - O.logo.width) / 2),
  y: fromLayout('logo', 'y', O.box.y + O.box.height - O.padding - O.logo.height),
  order: 6,
  width: O.logo.width,
  height: O.logo.height,
  src: O.logo.src,
  draggable: true,
};

const baseOverlayAtConfig = createImageTwoTextCanvas({
  id: 'dreizeilen-overlay-at',
  canvas: { width: O.canvas.width, height: O.canvas.height },
  primaryField: { key: 'line1', label: 'Zeile 1' },
  secondaryField: { key: 'subline', label: 'Subline' },
  calculateLayout,
  passthroughStateKeys: ['accent', 'line3', 'boxColor'],
  elements: [
    canvasFallbackElement,
    boxElement,
    line1Element,
    accentElement,
    line3Element,
    sublineElement,
    logoElement,
  ],
  features: { icons: true, shapes: true, illustrations: true },
  getCanvasText: (state) =>
    [
      state.line1 || '',
      (state.accent as string) || '',
      (state.line3 as string) || '',
      state.subline || '',
    ]
      .filter(Boolean)
      .join('\n'),
});

/**
 * The factory owns two text fields; this sujet has four plus a box colour.
 * Without these setters the extra zones would be invisible to the AI
 * capabilities below and unreachable from the sidebar.
 */
export interface OverlayAtFullActions extends ImageTwoTextActions {
  setAccent: (val: string) => void;
  setLine3: (val: string) => void;
  setBoxColor: (color: string) => void;
}

const overlayAtConfig: FullCanvasConfig<OverlayAtState, OverlayAtFullActions> = {
  ...baseOverlayAtConfig,
  multiPage: {
    enabled: true,
    maxPages: baseOverlayAtConfig.multiPage?.maxPages ?? 10,
    heterogeneous: true,
    defaultNewPageState: {
      ...baseOverlayAtConfig.multiPage?.defaultNewPageState,
      accent: getPlaceholder('accent'),
      line3: getPlaceholder('line3'),
    } as Partial<OverlayAtState>,
  },
  createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => {
    const base = baseOverlayAtConfig.createActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      callbacks
    );
    return {
      ...base,
      setAccent: (val: string) => {
        setState({ accent: val } as Partial<OverlayAtState>);
        callbacks.onAccentChange?.(val);
        debouncedSaveToHistory(getState());
      },
      setLine3: (val: string) => {
        setState({ line3: val } as Partial<OverlayAtState>);
        callbacks.onLine3Change?.(val);
        debouncedSaveToHistory(getState());
      },
      setBoxColor: (color: string) => {
        setState({ boxColor: color } as Partial<OverlayAtState>);
        saveToHistory(getState());
      },
    };
  },
};

const overlayAtAiCapabilities = createAiCapabilities<OverlayAtState, OverlayAtFullActions>({
  id: 'dreizeilen-overlay-at',
  errorLabel: '3 Zeilen Overlay (AT)',
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
      read: (s) => (s.line3 as string) || '',
      setter: (a) => a.setLine3,
    },
    {
      field: 'subline',
      label: 'Subline',
      read: (s) => s.subline || '',
      setter: (a) => a.setSecondary,
    },
  ],
});

export const dreizeilenOverlayAtFullConfig = wrapWithAi(
  overlayAtConfig,
  'dreizeilen-overlay-at',
  overlayAtAiCapabilities
);

export type DreizeilenOverlayAtFullState = OverlayAtState;
