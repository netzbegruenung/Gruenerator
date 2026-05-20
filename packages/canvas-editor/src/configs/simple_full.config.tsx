/**
 * Simple Full Canvas Configuration
 * "Text auf Bild" — headline + subtext on background image.
 *
 * Uses createImageTwoTextCanvas factory + Phase A/B helpers.
 */

import { SIMPLE_CONFIG, calculateSimpleLayout } from '../utils/simpleLayout';

import {
  createAiCapabilities,
  createImageTwoTextCanvas,
  createPrimaryText,
  createSecondaryText,
  wrapWithAi,
  type ImageTwoTextActions,
  type ImageTwoTextState,
} from './factory';

import type { LayoutResult } from './types';

type SimpleState = ImageTwoTextState<'headline' | 'subtext'>;

const calculateLayout = (state: SimpleState): LayoutResult => {
  const headline = state.headline || '';
  const subtext = state.subtext || '';
  const customHeadlineFontSize = state.customPrimaryFontSize ?? undefined;
  const customSubtextFontSize = state.customSecondaryFontSize ?? undefined;

  const layout = calculateSimpleLayout(
    headline,
    subtext,
    customHeadlineFontSize,
    customSubtextFontSize
  );

  return {
    'headline-text': {
      x: SIMPLE_CONFIG.headline.x,
      y: layout.headlineY,
      width: SIMPLE_CONFIG.headline.maxWidth,
      fontSize: layout.headlineFontSize,
    },
    'subtext-text': {
      x: SIMPLE_CONFIG.subtext.x,
      y: layout.subtextY,
      width: SIMPLE_CONFIG.subtext.maxWidth,
      fontSize: layout.subtextFontSize,
    },
  };
};

const headlineElement = createPrimaryText<SimpleState>({
  id: 'headline-text',
  textKey: 'headline',
  order: 2,
  width: SIMPLE_CONFIG.headline.maxWidth,
  fontFamily: SIMPLE_CONFIG.headline.fontFamily,
  fontStyle: SIMPLE_CONFIG.headline.fontStyle,
  lineHeight: SIMPLE_CONFIG.headline.lineHeightRatio,
  defaultColor: SIMPLE_CONFIG.headline.color,
  layoutFallback: {
    x: SIMPLE_CONFIG.headline.x,
    y: SIMPLE_CONFIG.headline.y,
    fontSize: SIMPLE_CONFIG.headline.fontSize,
  },
});

const subtextElement = createSecondaryText<SimpleState>({
  id: 'subtext-text',
  textKey: 'subtext',
  order: 3,
  width: SIMPLE_CONFIG.subtext.maxWidth,
  fontFamily: SIMPLE_CONFIG.subtext.fontFamily,
  fontStyle: SIMPLE_CONFIG.subtext.fontStyle,
  lineHeight: SIMPLE_CONFIG.subtext.lineHeightRatio,
  defaultColor: SIMPLE_CONFIG.subtext.color,
  layoutFallback: {
    x: SIMPLE_CONFIG.subtext.x,
    y: 200,
    fontSize: SIMPLE_CONFIG.subtext.fontSize,
  },
});

const baseSimpleConfig = createImageTwoTextCanvas({
  id: 'simple',
  canvas: {
    width: SIMPLE_CONFIG.canvas.width,
    height: SIMPLE_CONFIG.canvas.height,
  },
  primaryField: { key: 'headline', label: 'Überschrift' },
  secondaryField: { key: 'subtext', label: 'Unterzeile' },
  calculateLayout,
  elements: [headlineElement, subtextElement],
  features: { icons: true, shapes: true, illustrations: true },
  gradientOpacity: 0.3,
  getCanvasText: (state) => {
    const headline = state.headline || '';
    const subtext = state.subtext || '';
    return `${headline}\n${subtext}`.trim();
  },
});

const simpleAiCapabilities = createAiCapabilities<SimpleState, ImageTwoTextActions>({
  id: 'simple',
  errorLabel: 'Simple',
  fields: [
    {
      field: 'headline',
      label: 'Überschrift',
      read: (s) => s.headline || '',
      setter: (a) => a.setPrimary,
    },
    {
      field: 'subtext',
      label: 'Unterzeile',
      read: (s) => s.subtext || '',
      setter: (a) => a.setSecondary,
    },
  ],
});

export const simpleFullConfig = wrapWithAi(baseSimpleConfig, 'simple', simpleAiCapabilities);

export type SimpleFullState = SimpleState;
export type { ImageTwoTextActions as SimpleFullActions } from './factory';
