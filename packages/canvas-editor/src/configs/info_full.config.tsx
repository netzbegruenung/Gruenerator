/**
 * Info Full Canvas Configuration
 * Info sharepic with header, arrow, and body text.
 *
 * Uses createColorTwoTextCanvas factory + Phase A/B helpers.
 */

import { INFO_CONFIG } from '../utils/infoLayout';
import { wrapTextAccurate } from '../utils/textUtils';

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

type InfoState = ColorTwoTextState<'header' | 'body'>;

const metaFontColor = (_state: InfoState, layout: LayoutResult) =>
  (layout._meta as { fontColor?: string } | undefined)?.fontColor;

/** Measure the arrow Y (below the header) and the body's bottom edge for a font-size pair. */
const measureInfo = (
  header: string,
  body: string,
  headerFontSize: number,
  bodyFontSize: number
) => {
  const headerLines = header
    ? wrapTextAccurate(
        header,
        INFO_CONFIG.header.maxWidth,
        headerFontSize,
        INFO_CONFIG.header.fontFamily,
        INFO_CONFIG.header.fontStyle
      ).length
    : 0;
  const headerHeight = headerLines * headerFontSize * INFO_CONFIG.header.lineHeightRatio;
  const arrowY =
    INFO_CONFIG.margin.headerStartY +
    headerHeight +
    (header ? INFO_CONFIG.header.bottomSpacing : 0);

  const bodyLines = body
    ? wrapTextAccurate(
        body,
        INFO_CONFIG.body.maxWidth,
        bodyFontSize,
        INFO_CONFIG.body.remainingFont
      ).length
    : 0;
  const bodyBottom = arrowY + bodyLines * bodyFontSize * INFO_CONFIG.body.lineHeightRatio;

  return { arrowY, bodyBottom };
};

const calculateLayout = (state: InfoState): LayoutResult => {
  const fontColor = TEXT_COLORS[state.backgroundColor] ?? '#ffffff';
  const header = state.header || '';
  const body = state.body || '';

  // Respect manual font-size overrides; only auto-fit the dimensions the user hasn't pinned.
  const hasCustomHeader = state.customPrimaryFontSize != null;
  const hasCustomBody = state.customSecondaryFontSize != null;

  let headerFontSize = state.customPrimaryFontSize ?? INFO_CONFIG.header.fontSize;
  let bodyFontSize = state.customSecondaryFontSize ?? INFO_CONFIG.body.fontSize;

  // Shrink to keep the body above the sunflower — mirrors the server renderer's auto-fit.
  let m = measureInfo(header, body, headerFontSize, bodyFontSize);
  if (!hasCustomBody) {
    while (
      m.bodyBottom > INFO_CONFIG.content.bottomY &&
      bodyFontSize > INFO_CONFIG.body.minFontSize
    ) {
      bodyFontSize = Math.max(INFO_CONFIG.body.minFontSize, bodyFontSize - 2);
      m = measureInfo(header, body, headerFontSize, bodyFontSize);
    }
  }
  if (!hasCustomHeader) {
    while (
      m.bodyBottom > INFO_CONFIG.content.bottomY &&
      headerFontSize > INFO_CONFIG.header.minFontSize
    ) {
      headerFontSize = Math.max(INFO_CONFIG.header.minFontSize, headerFontSize - 4);
      m = measureInfo(header, body, headerFontSize, bodyFontSize);
    }
  }

  return {
    'header-text': {
      x: INFO_CONFIG.header.x,
      y: INFO_CONFIG.margin.headerStartY,
      width: INFO_CONFIG.header.maxWidth,
      fontSize: headerFontSize,
    },
    arrow: {
      x: INFO_CONFIG.arrow.x,
      y: m.arrowY,
      width: INFO_CONFIG.arrow.size,
      height: INFO_CONFIG.arrow.size,
    },
    'body-text': {
      x: INFO_CONFIG.body.leftMargin,
      // Body starts at the arrow's Y (to its right), mirroring the backend info_canvas.
      y: m.arrowY,
      width: INFO_CONFIG.body.maxWidth,
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
  calculateLayout,
  passthroughStateKeys: ['arrowOpacity'],
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
