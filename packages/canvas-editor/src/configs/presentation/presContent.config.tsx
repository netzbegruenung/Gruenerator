/**
 * Presentation: Content Slide Config — "Inhalt mit Titel"
 *
 * Title at top + body text below. When bodyText2 is filled,
 * automatically switches to a two-column layout.
 * Supports light/dark color mode toggle.
 */

import { fromLayout } from '../factory/layoutAccessors';

import { createPresentationSlide } from './createPresentationSlide';
import { calculateContentLayout } from './presentationLayout';
import { PRES_CONFIG, getPresColors } from './presentationTheme';

import type { BackgroundElementConfig, TextElementConfig } from '../types';
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

const titleTextElement: TextElementConfig<PresentationSlideState> = {
  id: 'title-text',
  type: 'text',
  x: fromLayout('title-text', 'x', PRES_CONFIG.margins.left),
  y: fromLayout('title-text', 'y', PRES_CONFIG.margins.top),
  order: 2,
  textKey: 'title',
  width: fromLayout('title-text', 'width', PRES_CONFIG.contentWidth),
  fontSize: fromLayout('title-text', 'fontSize', 80),
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

const bodyTextElement: TextElementConfig<PresentationSlideState> = {
  id: 'body-text',
  type: 'text',
  x: fromLayout('body-text', 'x', PRES_CONFIG.margins.left),
  y: fromLayout('body-text', 'y', 250),
  order: 3,
  textKey: 'bodyText',
  width: fromLayout('body-text', 'width', PRES_CONFIG.contentWidth),
  fontSize: fromLayout('body-text', 'fontSize', PRES_CONFIG.body.fontSize),
  fontFamily: `${PRES_CONFIG.body.fontFamily}, Calibri, sans-serif`,
  fontStyle: PRES_CONFIG.body.fontStyle,
  align: 'left',
  lineHeight: PRES_CONFIG.body.lineHeight,
  wrap: 'word',
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customBodyFontSize',
  opacityStateKey: 'bodyTextOpacity',
  fill: (state) => getPresColors(state.colorMode).text,
  fillStateKey: 'bodyTextColor',
};

const body2TextElement: TextElementConfig<PresentationSlideState> = {
  id: 'body2-text',
  type: 'text',
  x: fromLayout('body2-text', 'x', PRES_CONFIG.canvas.width / 2 + 30),
  y: fromLayout('body2-text', 'y', 250),
  order: 4,
  textKey: 'bodyText2',
  width: fromLayout('body2-text', 'width', 840),
  fontSize: fromLayout('body2-text', 'fontSize', PRES_CONFIG.body.fontSize),
  fontFamily: `${PRES_CONFIG.body.fontFamily}, Calibri, sans-serif`,
  fontStyle: PRES_CONFIG.body.fontStyle,
  align: 'left',
  lineHeight: PRES_CONFIG.body.lineHeight,
  wrap: 'word',
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customBody2FontSize',
  opacityStateKey: 'bodyText2Opacity',
  fill: (state) => getPresColors(state.colorMode).text,
  fillStateKey: 'bodyText2Color',
  visible: (state) => !!state.bodyText2,
};

export const presContentConfig = createPresentationSlide({
  id: 'pres-content',
  fontPreloadSize: 80,
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
        key: 'bodyText',
        label: 'Inhalt',
        multiline: true,
        fontSizeStateKey: 'customBodyFontSize',
      },
      aiField: 'bodyText',
      read: (s) => s.bodyText,
      setText: (a, v) => a.setBodyText(v),
      setFontSize: (a, size) => a.handleBodyFontSizeChange(size),
    },
    {
      config: {
        key: 'bodyText2',
        label: 'Zweite Spalte (optional)',
        multiline: true,
        fontSizeStateKey: 'customBody2FontSize',
      },
      aiField: 'bodyText2',
      read: (s) => s.bodyText2,
      setText: (a, v) => a.setBodyText2(v),
      setFontSize: (a, size) => a.handleBody2FontSizeChange(size),
    },
  ],
  defaultNewPageState: { title: '', bodyText: '', bodyText2: '' },
  calculateLayout: calculateContentLayout,
  elements: [backgroundElement, titleTextElement, bodyTextElement, body2TextElement],
});
