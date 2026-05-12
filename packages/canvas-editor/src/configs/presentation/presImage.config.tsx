/**
 * Presentation: Image Slide Config — "Bild mit Überschrift"
 *
 * Full-bleed background image with a semi-transparent overlay
 * and large title text. Used for visual impact slides.
 */

import { fromLayout } from '../factory/layoutAccessors';

import { createPresentationSlide } from './createPresentationSlide';
import { calculateImageLayout } from './presentationLayout';
import { PRES_CONFIG, getPresColors } from './presentationTheme';

import type { ImageElementConfig, RectElementConfig, TextElementConfig } from '../types';
import type { PresentationSlideState } from './presentationTypes';

const backgroundImageElement: ImageElementConfig<PresentationSlideState> = {
  id: 'background-image',
  type: 'image',
  x: 0,
  y: 0,
  order: 0,
  width: PRES_CONFIG.canvas.width,
  height: PRES_CONFIG.canvas.height,
  srcKey: 'currentImageSrc',
  offsetKey: 'imageOffset',
  scaleKey: 'imageScale',
  listening: false,
  draggable: false,
  coverFit: true,
};

const overlayRectElement: RectElementConfig<PresentationSlideState> = {
  id: 'overlay-rect',
  type: 'rect',
  x: 0,
  y: 0,
  order: 1,
  width: PRES_CONFIG.canvas.width,
  height: PRES_CONFIG.canvas.height,
  fill: (state) => getPresColors(state.colorMode).overlayBg,
  visible: (state) => !!state.currentImageSrc,
};

const titleTextElement: TextElementConfig<PresentationSlideState> = {
  id: 'title-text',
  type: 'text',
  x: fromLayout('title-text', 'x', PRES_CONFIG.margins.left),
  y: fromLayout('title-text', 'y', 160),
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
  fill: () => '#FFFFFF',
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
  fill: () => '#FFFFFF',
  fillStateKey: 'subtitleColor',
  visible: (state) => !!state.subtitle,
};

export const presImageConfig = createPresentationSlide({
  id: 'pres-image',
  fontPreloadSize: 120,
  background: { kind: 'image' },
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
  calculateLayout: calculateImageLayout,
  elements: [backgroundImageElement, overlayRectElement, titleTextElement, subtitleTextElement],
});
