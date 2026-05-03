/**
 * Presentation: Title Slide Config — "Nur Titel"
 *
 * Large heading + optional subtitle on a solid green background.
 * Sunflower decoration (bottom-right, low opacity).
 * Footer with date, custom text, and slide number.
 * Light/dark color mode toggle.
 */

import { fromLayout } from '../factory/layoutAccessors';

import { createPresentationSlide } from './createPresentationSlide';
import { calculateTitleLayout } from './presentationLayout';
import { PRES_CONFIG, getPresColors } from './presentationTheme';

import type { BackgroundElementConfig, ImageElementConfig, TextElementConfig } from '../types';
import type { PresentationSlideState } from './presentationTypes';

const backgroundElement: BackgroundElementConfig<PresentationSlideState> = {
  id: 'background',
  type: 'background',
  x: 0,
  y: 0,
  order: 0,
  width: PRES_CONFIG.canvas.width,
  height: PRES_CONFIG.canvas.height,
  colorKey: 'backgroundColor',
};

const sunflowerElement: ImageElementConfig<PresentationSlideState> = {
  id: 'sunflower',
  type: 'image',
  x: PRES_CONFIG.sunflower.x,
  y: PRES_CONFIG.sunflower.y,
  order: 1,
  width: PRES_CONFIG.sunflower.size,
  height: PRES_CONFIG.sunflower.size,
  src: PRES_CONFIG.sunflower.src,
  listening: true,
  draggable: true,
  constrainToBounds: false,
  opacity: () => PRES_CONFIG.sunflower.opacity,
};

const titleTextElement: TextElementConfig<PresentationSlideState> = {
  id: 'title-text',
  type: 'text',
  x: fromLayout('title-text', 'x', PRES_CONFIG.margins.left),
  y: fromLayout('title-text', 'y', 300),
  order: 3,
  textKey: 'title',
  width: PRES_CONFIG.title.maxWidth,
  fontSize: fromLayout('title-text', 'fontSize', PRES_CONFIG.title.fontSize),
  fontFamily: `${PRES_CONFIG.title.fontFamily}, Arial, sans-serif`,
  fontStyle: PRES_CONFIG.title.fontStyle,
  align: 'left',
  lineHeight: PRES_CONFIG.title.lineHeight,
  wrap: 'word',
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customTitleFontSize',
  opacityStateKey: 'titleOpacity',
  fill: (state) => getPresColors(state.colorMode).text,
  fillStateKey: 'titleColor',
};

const subtitleTextElement: TextElementConfig<PresentationSlideState> = {
  id: 'subtitle-text',
  type: 'text',
  x: fromLayout('subtitle-text', 'x', PRES_CONFIG.margins.left),
  y: fromLayout('subtitle-text', 'y', 500),
  order: 4,
  textKey: 'subtitle',
  width: PRES_CONFIG.subtitle.maxWidth,
  fontSize: fromLayout('subtitle-text', 'fontSize', PRES_CONFIG.subtitle.fontSize),
  fontFamily: `${PRES_CONFIG.subtitle.fontFamily}, Calibri, sans-serif`,
  fontStyle: PRES_CONFIG.subtitle.fontStyle,
  align: 'left',
  lineHeight: PRES_CONFIG.subtitle.lineHeight,
  wrap: 'word',
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customSubtitleFontSize',
  opacityStateKey: 'subtitleOpacity',
  fill: (state) => getPresColors(state.colorMode).subtitle,
  fillStateKey: 'subtitleColor',
  visible: (state) => !!state.subtitle,
};

export const presTitleConfig = createPresentationSlide({
  id: 'pres-title',
  fontPreloadSize: 120,
  background: { kind: 'color' },
  textFields: [
    {
      config: {
        key: 'title',
        label: 'Titel',
        multiline: false,
        fontSizeStateKey: 'customTitleFontSize',
      },
      aiField: 'title',
      read: (s) => s.title,
      setText: (a, v) => a.setTitle(v),
      setFontSize: (a, size) => a.handleTitleFontSizeChange(size),
    },
    {
      config: {
        key: 'subtitle',
        label: 'Untertitel',
        multiline: false,
        fontSizeStateKey: 'customSubtitleFontSize',
      },
      aiField: 'subtitle',
      read: (s) => s.subtitle,
      setText: (a, v) => a.setSubtitle(v),
      setFontSize: (a, size) => a.handleSubtitleFontSizeChange(size),
    },
  ],
  defaultNewPageState: { title: '', subtitle: '' },
  calculateLayout: calculateTitleLayout,
  elements: [backgroundElement, sunflowerElement, titleTextElement, subtitleTextElement],
});
