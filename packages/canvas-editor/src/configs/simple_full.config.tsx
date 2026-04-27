/**
 * Simple Full Canvas Configuration
 * "Text auf Bild" - Headline + Subtext on background image
 *
 * Uses createImageTwoTextCanvas factory for shared infrastructure.
 */

import { HiSparkles } from 'react-icons/hi';

import { buildAssetCapability } from '../ai/assetCapability';
import { createAiSectionRegistration } from '../ai/createAiSectionRegistration';
import { createChatSection } from './commonSections';
import { buildIllustrationCapability } from '../ai/illustrationCapability';
import { SIMPLE_CONFIG, calculateSimpleLayout } from '../utils/simpleLayout';

import { createImageTwoTextCanvas, type ImageTwoTextActions } from './factory';

import type { TemplateAiCapabilities } from '../ai/types';
import type { ImageTwoTextState } from './factory';
import type { LayoutResult, TextElementConfig, RectElementConfig } from './types';
import type { CanvasAiSnapshot } from '@gruenerator/contracts';

// ============================================================================
// LAYOUT CALCULATOR
// ============================================================================

const calculateLayout = (state: ImageTwoTextState): LayoutResult => {
  const headline = (state.headline as string) || '';
  const subtext = (state.subtext as string) || '';
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

// ============================================================================
// CUSTOM ELEMENTS
// ============================================================================

const headlineElement: TextElementConfig<ImageTwoTextState> = {
  id: 'headline-text',
  type: 'text',
  x: (_s, l) => (l['headline-text'] as { x?: number })?.x ?? SIMPLE_CONFIG.headline.x,
  y: (_s, l) => (l['headline-text'] as { y?: number })?.y ?? SIMPLE_CONFIG.headline.y,
  order: 2,
  textKey: 'headline',
  width: SIMPLE_CONFIG.headline.maxWidth,
  fontSize: (_s, l) =>
    (l['headline-text'] as { fontSize?: number })?.fontSize ?? SIMPLE_CONFIG.headline.fontSize,
  fontFamily: `${SIMPLE_CONFIG.headline.fontFamily}, Arial, sans-serif`,
  fontStyle: SIMPLE_CONFIG.headline.fontStyle,
  align: 'left',
  lineHeight: SIMPLE_CONFIG.headline.lineHeightRatio,
  wrap: 'word',
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customPrimaryFontSize',
  opacityStateKey: 'primaryOpacity',
  fill: (state) => (state.primaryColor as string) ?? SIMPLE_CONFIG.headline.color,
  fillStateKey: 'primaryColor',
};

const subtextElement: TextElementConfig<ImageTwoTextState> = {
  id: 'subtext-text',
  type: 'text',
  x: (_s, l) => (l['subtext-text'] as { x?: number })?.x ?? SIMPLE_CONFIG.subtext.x,
  y: (_s, l) => (l['subtext-text'] as { y?: number })?.y ?? 200,
  order: 3,
  textKey: 'subtext',
  width: SIMPLE_CONFIG.subtext.maxWidth,
  fontSize: (_s, l) =>
    (l['subtext-text'] as { fontSize?: number })?.fontSize ?? SIMPLE_CONFIG.subtext.fontSize,
  fontFamily: `${SIMPLE_CONFIG.subtext.fontFamily}, Arial, sans-serif`,
  fontStyle: SIMPLE_CONFIG.subtext.fontStyle,
  align: 'left',
  lineHeight: SIMPLE_CONFIG.subtext.lineHeightRatio,
  wrap: 'word',
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customSecondaryFontSize',
  opacityStateKey: 'secondaryOpacity',
  fill: (state) => (state.secondaryColor as string) ?? SIMPLE_CONFIG.subtext.color,
  fillStateKey: 'secondaryColor',
};

const gradientOverlay: RectElementConfig<ImageTwoTextState> = {
  id: 'gradient-overlay',
  type: 'rect',
  x: 0,
  y: 0,
  order: 1,
  width: SIMPLE_CONFIG.canvas.width,
  height: SIMPLE_CONFIG.canvas.height,
  fill: 'rgba(0,0,0,0.3)',
  listening: false,
};

// ============================================================================
// CONFIG EXPORT
// ============================================================================

const baseSimpleConfig = createImageTwoTextCanvas({
  id: 'simple',

  canvas: {
    width: SIMPLE_CONFIG.canvas.width,
    height: SIMPLE_CONFIG.canvas.height,
  },

  primaryField: {
    key: 'headline',
    label: 'Überschrift',
  },

  secondaryField: {
    key: 'subtext',
    label: 'Unterzeile',
  },

  calculateLayout,

  elements: [gradientOverlay, headlineElement, subtextElement],

  features: {
    icons: true,
    shapes: true,
    illustrations: true,
  },

  getCanvasText: (state) => {
    const headline = (state.headline as string) || '';
    const subtext = (state.subtext as string) || '';
    return `${headline}\n${subtext}`.trim();
  },
});

// ============================================================================
// AI CAPABILITY
// ============================================================================

const simpleAiCapabilities: TemplateAiCapabilities<ImageTwoTextState, ImageTwoTextActions> = {
  supportedOperations: [
    'set-text',
    'add-illustration',
    'add-asset',
    'update-element',
    'remove-element',
  ],

  illustrations: buildIllustrationCapability(),
  assets: buildAssetCapability('simple'),

  describeForAi: (state): CanvasAiSnapshot => ({
    template: 'simple',
    textFields: [
      { field: 'headline', label: 'Überschrift', value: (state.headline as string) || '' },
      { field: 'subtext', label: 'Unterzeile', value: (state.subtext as string) || '' },
    ],
    elementsSummary: [],
  }),

  applyOverrides: {
    'set-text': (op, actions) => {
      // Simple's two text fields go through setPrimary/setSecondary on the
      // factory-built actions. Default applier handles this, but we override
      // so we can validate the field name explicitly.
      if (op.field === 'headline') {
        actions.setPrimary?.(op.value);
        return;
      }
      if (op.field === 'subtext') {
        actions.setSecondary?.(op.value);
        return;
      }
      throw new Error(`Simple template hat kein Feld "${op.field}"`);
    },
  },
};

// ============================================================================
// FINAL CONFIG (factory result + AI overlay)
// ============================================================================

export const simpleFullConfig = {
  ...baseSimpleConfig,
  ai: simpleAiCapabilities,
  tabs: [
    ...baseSimpleConfig.tabs,
    { id: 'ai' as const, icon: HiSparkles, label: 'KI', ariaLabel: 'KI-Vorschläge' },
  ],
  // 'ai' tab kept registered but hidden — Chat tab now drives canvas-AI suggestions.
  getVisibleTabs: (state: ImageTwoTextState, context?: { selectedElement?: string | null }) => {
    return baseSimpleConfig.getVisibleTabs?.(state, context) ?? [];
  },
  sections: {
    ...baseSimpleConfig.sections,
    ai: createAiSectionRegistration('simple', simpleAiCapabilities),
    chat: createChatSection('simple', simpleAiCapabilities),
  },
};

// Re-export types for backward compatibility
export type SimpleFullState = ImageTwoTextState;
export type { ImageTwoTextActions as SimpleFullActions } from './factory';
