/**
 * Info Full Canvas Configuration
 * Info sharepic with header, arrow, and body text.
 *
 * Uses createColorTwoTextCanvas factory + Phase A/B helpers.
 */

import { INFO_CONFIG, calculateInfoLayout } from '../utils/infoLayout';

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
  { id: 'tanne', label: 'Tanne', color: '#005538' },
  { id: 'sand', label: 'Sand', color: '#F5F1E9' },
];

const TEXT_COLORS: Record<string, string> = {
  '#005538': '#ffffff',
  '#F5F1E9': '#005538',
};

const BACKGROUND_IMAGES: Record<string, string> = {
  '#005538': '/Info_bg_tanne.png',
  '#F5F1E9': '/Info_bg_sand.png',
};

type InfoState = ColorTwoTextState<'header' | 'body'>;

const metaFontColor = (_state: InfoState, layout: LayoutResult) =>
  (layout._meta as { fontColor?: string } | undefined)?.fontColor;

const calculateLayout = (state: InfoState): LayoutResult => {
  const headerFontSize = state.customPrimaryFontSize ?? INFO_CONFIG.header.fontSize;
  const bodyFontSize = state.customSecondaryFontSize ?? INFO_CONFIG.body.fontSize;
  const layout = calculateInfoLayout(headerFontSize, bodyFontSize);

  const fontColor = TEXT_COLORS[state.backgroundColor] ?? '#ffffff';

  const header = state.header || '';
  const headerLineHeight = headerFontSize * INFO_CONFIG.header.lineHeightRatio;
  const estimatedHeaderLines = Math.ceil(header.length / 30);
  const headerHeight = estimatedHeaderLines * headerLineHeight;
  const arrowY = layout.header.y + headerHeight + INFO_CONFIG.header.bottomSpacing;

  return {
    'header-text': {
      x: layout.header.x,
      y: layout.header.y,
      width: layout.header.maxWidth,
      fontSize: headerFontSize,
    },
    arrow: {
      x: INFO_CONFIG.arrow.x,
      y: arrowY,
      width: INFO_CONFIG.arrow.size,
      height: INFO_CONFIG.arrow.size,
    },
    'body-text': {
      x: layout.body.x,
      y: layout.body.y,
      width: layout.body.maxWidth,
      fontSize: bodyFontSize,
    },
    _meta: {
      fontColor,
    } as Record<string, unknown>,
  };
};

const sunflowerElement: ImageElementConfig<InfoState> = {
  id: 'sunflower',
  type: 'image',
  x: INFO_CONFIG.sunflower.x,
  y: INFO_CONFIG.sunflower.y,
  order: 1,
  width: INFO_CONFIG.sunflower.size,
  height: INFO_CONFIG.sunflower.size,
  src: INFO_CONFIG.sunflower.src,
  draggable: true,
  opacity: () => 0.04,
};

const headerTextElement = createPrimaryText<InfoState>({
  id: 'header-text',
  textKey: 'header',
  order: 2,
  width: INFO_CONFIG.header.maxWidth,
  fontFamily: INFO_CONFIG.header.fontFamily,
  fontStyle: INFO_CONFIG.header.fontStyle,
  lineHeight: INFO_CONFIG.header.lineHeightRatio,
  defaultColor: '#ffffff',
  fillFallback: metaFontColor,
  layoutFallback: {
    x: INFO_CONFIG.header.x,
    y: INFO_CONFIG.margin.headerStartY,
    fontSize: INFO_CONFIG.header.fontSize,
  },
});

const arrowElement: ImageElementConfig<InfoState> = {
  id: 'arrow',
  type: 'image',
  x: fromLayout('arrow', 'x', INFO_CONFIG.arrow.x),
  y: fromLayout('arrow', 'y', 400),
  order: 3,
  width: INFO_CONFIG.arrow.size,
  height: INFO_CONFIG.arrow.size,
  src: INFO_CONFIG.arrow.src,
  draggable: true,
  opacityStateKey: 'arrowOpacity',
};

const bodyTextElement = createSecondaryText<InfoState>({
  id: 'body-text',
  textKey: 'body',
  order: 4,
  width: INFO_CONFIG.body.maxWidth,
  fontFamily: INFO_CONFIG.body.remainingFont,
  lineHeight: INFO_CONFIG.body.lineHeightRatio,
  defaultColor: '#ffffff',
  fillFallback: metaFontColor,
  layoutFallback: {
    x: INFO_CONFIG.body.leftMargin,
    y: 400,
    fontSize: INFO_CONFIG.body.fontSize,
  },
});

const baseInfoConfig = createColorTwoTextCanvas({
  id: 'info',
  canvas: {
    width: INFO_CONFIG.canvas.width,
    height: INFO_CONFIG.canvas.height,
  },
  primaryField: { key: 'header', label: 'Überschrift' },
  secondaryField: { key: 'body', label: 'Text' },
  backgroundColors: BACKGROUND_COLORS,
  defaultBackgroundColor: '#005538',
  textColorMap: TEXT_COLORS,
  backgroundImageMap: BACKGROUND_IMAGES,
  calculateLayout,
  elements: [sunflowerElement, headerTextElement, arrowElement, bodyTextElement],
  features: { icons: true, shapes: true, illustrations: true },
  getCanvasText: (state) => {
    const header = state.header || '';
    const body = state.body || '';
    return `${header}\n${body}`.trim();
  },
});

const infoAiCapabilities = createAiCapabilities<InfoState, ColorTwoTextActions>({
  id: 'info',
  errorLabel: 'Info',
  fields: [
    {
      field: 'header',
      label: 'Überschrift',
      read: (s) => s.header || '',
      setter: (a) => a.setPrimary,
    },
    {
      field: 'body',
      label: 'Text',
      read: (s) => s.body || '',
      setter: (a) => a.setSecondary,
    },
  ],
  background: { read: (s) => s.backgroundColor as `#${string}` },
});

export const infoFullConfig = wrapWithAi(baseInfoConfig, 'info', infoAiCapabilities);

export type InfoFullState = InfoState;
export type { ColorTwoTextActions as InfoFullActions } from './factory';
