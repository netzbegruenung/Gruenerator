/**
 * Info Full Canvas Configuration
 * Info sharepic with header, arrow, and body text
 *
 * Uses createColorTwoTextCanvas factory for shared infrastructure.
 */

import { INFO_CONFIG, calculateInfoLayout } from '../utils/infoLayout';

import { createColorTwoTextCanvas } from './factory';

import type { ColorTwoTextState } from './factory';
import type { LayoutResult, TextElementConfig, ImageElementConfig } from './types';
import type { BackgroundColorOption } from '../sidebar/types';

// ============================================================================
// CONSTANTS
// ============================================================================

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

// ============================================================================
// LAYOUT CALCULATOR
// ============================================================================

const calculateLayout = (state: ColorTwoTextState): LayoutResult => {
  const headerFontSize = state.customPrimaryFontSize ?? INFO_CONFIG.header.fontSize;
  const bodyFontSize = state.customSecondaryFontSize ?? INFO_CONFIG.body.fontSize;
  const layout = calculateInfoLayout(headerFontSize, bodyFontSize);

  const fontColor = TEXT_COLORS[state.backgroundColor] ?? '#ffffff';

  // Estimate header height for arrow positioning
  const header = (state.header as string) || '';
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

// ============================================================================
// CUSTOM ELEMENTS
// ============================================================================

const sunflowerElement: ImageElementConfig<ColorTwoTextState> = {
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

const headerTextElement: TextElementConfig<ColorTwoTextState> = {
  id: 'header-text',
  type: 'text',
  x: (_s, l) => (l['header-text'] as { x?: number })?.x ?? INFO_CONFIG.header.x,
  y: (_s, l) => (l['header-text'] as { y?: number })?.y ?? INFO_CONFIG.margin.headerStartY,
  order: 2,
  textKey: 'header',
  width: INFO_CONFIG.header.maxWidth,
  fontSize: (_s, l) =>
    (l['header-text'] as { fontSize?: number })?.fontSize ?? INFO_CONFIG.header.fontSize,
  fontFamily: `${INFO_CONFIG.header.fontFamily}, Arial, sans-serif`,
  fontStyle: INFO_CONFIG.header.fontStyle,
  align: 'left',
  lineHeight: INFO_CONFIG.header.lineHeightRatio,
  wrap: 'word',
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customPrimaryFontSize',
  opacityStateKey: 'primaryOpacity',
  fill: (s, l) =>
    (s.primaryColor as string) ?? (l._meta as { fontColor?: string })?.fontColor ?? '#ffffff',
  fillStateKey: 'primaryColor',
};

const arrowElement: ImageElementConfig<ColorTwoTextState> = {
  id: 'arrow',
  type: 'image',
  x: (_s, l) => (l['arrow'] as { x?: number })?.x ?? INFO_CONFIG.arrow.x,
  y: (_s, l) => (l['arrow'] as { y?: number })?.y ?? 400,
  order: 3,
  width: INFO_CONFIG.arrow.size,
  height: INFO_CONFIG.arrow.size,
  src: INFO_CONFIG.arrow.src,
  draggable: true,
  opacityStateKey: 'arrowOpacity',
};

const bodyTextElement: TextElementConfig<ColorTwoTextState> = {
  id: 'body-text',
  type: 'text',
  x: (_s, l) => (l['body-text'] as { x?: number })?.x ?? INFO_CONFIG.body.leftMargin,
  y: (_s, l) => (l['body-text'] as { y?: number })?.y ?? 400,
  order: 4,
  textKey: 'body',
  width: INFO_CONFIG.body.maxWidth,
  fontSize: (_s, l) =>
    (l['body-text'] as { fontSize?: number })?.fontSize ?? INFO_CONFIG.body.fontSize,
  fontFamily: `${INFO_CONFIG.body.remainingFont}, Arial, sans-serif`,
  align: 'left',
  lineHeight: INFO_CONFIG.body.lineHeightRatio,
  wrap: 'word',
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customSecondaryFontSize',
  opacityStateKey: 'secondaryOpacity',
  fill: (s, l) =>
    (s.secondaryColor as string) ?? (l._meta as { fontColor?: string })?.fontColor ?? '#ffffff',
  fillStateKey: 'secondaryColor',
};

// ============================================================================
// CONFIG EXPORT
// ============================================================================

export const infoFullConfig = createColorTwoTextCanvas({
  id: 'info',

  canvas: {
    width: INFO_CONFIG.canvas.width,
    height: INFO_CONFIG.canvas.height,
  },

  primaryField: {
    key: 'header',
    label: 'Überschrift',
  },

  secondaryField: {
    key: 'body',
    label: 'Text',
  },

  backgroundColors: BACKGROUND_COLORS,
  defaultBackgroundColor: '#005538',
  textColorMap: TEXT_COLORS,
  backgroundImageMap: BACKGROUND_IMAGES,

  calculateLayout,

  elements: [sunflowerElement, headerTextElement, arrowElement, bodyTextElement],

  features: {
    icons: true,
    shapes: true,
    illustrations: true,
  },

  getCanvasText: (state) => {
    const header = (state.header as string) || '';
    const body = (state.body as string) || '';
    return `${header}\n${body}`.trim();
  },
});

// Re-export types for backward compatibility
export type InfoFullState = ColorTwoTextState;
export type { ColorTwoTextActions as InfoFullActions } from './factory';
