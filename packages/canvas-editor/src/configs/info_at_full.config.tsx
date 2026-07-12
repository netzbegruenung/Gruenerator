/**
 * Info AT Full Canvas Configuration (Österreich / de-AT)
 *
 * Headline-Sujet auf dunkelgrüner Fläche (CI 2026): weiße Gotham-Headline,
 * gelbe Vollkorn-Betonungszeile, weiße Subline, weißes Ein-Balken-Logo.
 *
 * Built on createColorTwoTextCanvas (headline + body) plus a third editable
 * accent text zone (textKey 'accent' auto-persists via passthroughStateKeys /
 * on-canvas textKey writeback).
 */

import { getBrandTheme } from '../brand/theme';
import { HEADLINE_AT_CONFIG, calculateHeadlineAtLayout } from '../utils/headlineAtLayout';

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

import type { ImageElementConfig, LayoutResult, TextElementConfig } from './types';

const AT = getBrandTheme('de-AT');
const H = HEADLINE_AT_CONFIG;
const CENTER_X = H.margin.x;

type InfoAtState = ColorTwoTextState<'headline' | 'body'>;

const calculateLayout = (state: InfoAtState): LayoutResult => {
  const headline = state.headline || '';
  const accent = (state.accent as string) || '';
  const body = state.body || '';

  const [hZone, aZone, bZone] = calculateHeadlineAtLayout([
    {
      text: headline,
      fontSize: H.headline.fontSize,
      fontFamily: H.headline.fontFamily,
      fontStyle: H.headline.fontStyle,
    },
    {
      text: accent,
      fontSize: H.accent.fontSize,
      fontFamily: H.accent.fontFamily,
      fontStyle: H.accent.fontStyle,
    },
    {
      text: body,
      fontSize: H.body.fontSize,
      fontFamily: H.body.fontFamily,
      fontStyle: H.body.fontStyle,
    },
  ]);

  return {
    'headline-text': {
      x: CENTER_X,
      y: hZone.y,
      width: H.maxWidth,
      fontSize: state.customPrimaryFontSize ?? hZone.fontSize,
    },
    'accent-text': {
      x: CENTER_X,
      y: aZone.y,
      width: H.maxWidth,
      fontSize: aZone.fontSize,
    },
    'body-text': {
      x: CENTER_X,
      y: bZone.y,
      width: H.maxWidth,
      fontSize: state.customSecondaryFontSize ?? bZone.fontSize,
    },
    logo: {
      x: H.logo.x,
      y: H.logo.y,
      width: H.logo.width,
      height: H.logo.height,
    },
    _meta: { fontColor: AT.colors.textOnDark } as Record<string, unknown>,
  };
};

const headlineElement = createPrimaryText<InfoAtState>({
  id: 'headline-text',
  textKey: 'headline',
  order: 2,
  width: H.maxWidth,
  fontFamily: H.headline.fontFamily,
  fontStyle: H.headline.fontStyle,
  lineHeight: H.lineHeightRatio,
  align: 'center',
  defaultColor: AT.colors.textOnDark,
  layoutFallback: { x: CENTER_X, y: H.margin.top, fontSize: H.headline.fontSize },
});

// Third (accent) zone — gelbe Vollkorn-Betonung. Edited on-canvas; textKey
// 'accent' persists through passthroughStateKeys.
const accentElement: TextElementConfig<InfoAtState> = {
  id: 'accent-text',
  type: 'text',
  x: fromLayout('accent-text', 'x', CENTER_X),
  y: fromLayout('accent-text', 'y', 400),
  order: 3,
  textKey: 'accent',
  width: H.maxWidth,
  fontSize: fromLayout('accent-text', 'fontSize', H.accent.fontSize),
  fontFamily: `${H.accent.fontFamily}, Georgia, serif`,
  fontStyle: H.accent.fontStyle,
  align: 'center',
  lineHeight: H.lineHeightRatio,
  wrap: 'word',
  padding: 0,
  editable: true,
  draggable: true,
  fill: AT.colors.accent,
};

const bodyElement = createSecondaryText<InfoAtState>({
  id: 'body-text',
  textKey: 'body',
  order: 4,
  width: H.maxWidth,
  fontFamily: H.body.fontFamily,
  fontStyle: H.body.fontStyle,
  lineHeight: 1.2,
  align: 'center',
  defaultColor: AT.colors.textOnDark,
  layoutFallback: { x: CENTER_X, y: 700, fontSize: H.body.fontSize },
});

const logoElement: ImageElementConfig<InfoAtState> = {
  id: 'logo',
  type: 'image',
  x: fromLayout('logo', 'x', H.logo.x),
  y: fromLayout('logo', 'y', H.logo.y),
  order: 5,
  width: H.logo.width,
  height: H.logo.height,
  src: H.logo.src,
  draggable: true,
};

const baseInfoAtConfig = createColorTwoTextCanvas({
  id: 'info-at',
  canvas: { width: H.canvas.width, height: H.canvas.height },
  primaryField: { key: 'headline', label: 'Headline' },
  secondaryField: { key: 'body', label: 'Subline' },
  backgroundColors: AT.backgroundColors,
  defaultBackgroundColor: AT.defaultBackgroundColor,
  textColorMap: AT.textColorMap,
  calculateLayout,
  passthroughStateKeys: ['accent'],
  elements: [headlineElement, accentElement, bodyElement, logoElement],
  features: { icons: true, shapes: true, illustrations: true },
  getCanvasText: (state) => {
    const headline = state.headline || '';
    const accent = (state.accent as string) || '';
    const body = state.body || '';
    return [headline, accent, body].filter(Boolean).join('\n');
  },
});

const infoAtAiCapabilities = createAiCapabilities<InfoAtState, ColorTwoTextActions>({
  id: 'info-at',
  errorLabel: 'Info (AT)',
  fields: [
    {
      field: 'headline',
      label: 'Headline',
      read: (s) => s.headline || '',
      setter: (a) => a.setPrimary,
    },
    { field: 'body', label: 'Subline', read: (s) => s.body || '', setter: (a) => a.setSecondary },
  ],
  background: { read: (s) => s.backgroundColor as `#${string}` },
});

export const infoAtFullConfig = wrapWithAi(baseInfoAtConfig, 'info-at', infoAtAiCapabilities);

export type InfoAtFullState = InfoAtState;
export type { ColorTwoTextActions as InfoAtFullActions } from './factory';
