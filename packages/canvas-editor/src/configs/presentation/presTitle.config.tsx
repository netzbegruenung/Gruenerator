/**
 * Presentation: Title Slide Config — "Nur Titel"
 *
 * Large heading + optional subtitle on a solid green background.
 * Sunflower decoration (bottom-right, low opacity).
 * Footer with date, custom text, and slide number.
 * Light/dark color mode toggle.
 */

import { HiPhotograph, HiSparkles } from 'react-icons/hi';
import { PiPaintBrushBroadFill, PiSquaresFourFill, PiTextAa } from 'react-icons/pi';

import { createAiSectionRegistration } from '../../ai/createAiSectionRegistration';
import {
  BackgroundSection,
  AssetsSection,
  PresentationDesignSection,
} from '../../sidebar/sections';
import { chatTab, createChatSection, uploadsSectionEntry, uploadsTab } from '../commonSections';
import { injectFeatureProps } from '../featureInjector';
import { createShareSection } from '../shareSection';

import {
  PRES_CONFIG,
  PRES_COLORS,
  PRES_BACKGROUND_COLORS,
  getPresColors,
} from './presentationTheme';
import { createPresentationActions } from './createPresentationActions';
import { calculateTitleLayout } from './presentationLayout';
import { createFooterElements } from './createFooterElements';
import { createPresentationAiCapabilities } from './presentationAi';
import { createPresentationInitialState } from './presentationTypes';

import type {
  FullCanvasConfig,
  BackgroundElementConfig,
  ImageElementConfig,
  TextElementConfig,
} from '../types';
import type { PresentationSlideState, PresentationSlideActions } from './presentationTypes';
import type { PresentationColorMode } from './presentationTheme';

// ============================================================================
// ELEMENTS
// ============================================================================

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
  x: (_s, l) => (l['title-text'] as { x?: number })?.x ?? PRES_CONFIG.margins.left,
  y: (_s, l) => (l['title-text'] as { y?: number })?.y ?? 300,
  order: 3,
  textKey: 'title',
  width: PRES_CONFIG.title.maxWidth,
  fontSize: (_s, l) =>
    (l['title-text'] as { fontSize?: number })?.fontSize ?? PRES_CONFIG.title.fontSize,
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
  x: (_s, l) => (l['subtitle-text'] as { x?: number })?.x ?? PRES_CONFIG.margins.left,
  y: (_s, l) => (l['subtitle-text'] as { y?: number })?.y ?? 500,
  order: 4,
  textKey: 'subtitle',
  width: PRES_CONFIG.subtitle.maxWidth,
  fontSize: (_s, l) =>
    (l['subtitle-text'] as { fontSize?: number })?.fontSize ?? PRES_CONFIG.subtitle.fontSize,
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

// ============================================================================
// AI CAPABILITY
// ============================================================================

const presTitleAiCapabilities = createPresentationAiCapabilities({
  template: 'pres-title',
  fields: ['title', 'subtitle'],
});

// ============================================================================
// CONFIG EXPORT
// ============================================================================

export const presTitleConfig: FullCanvasConfig<PresentationSlideState, PresentationSlideActions> = {
  id: 'pres-title',

  canvas: {
    width: PRES_CONFIG.canvas.width,
    height: PRES_CONFIG.canvas.height,
  },

  fonts: {
    primary: 'GrueneTypeNeue',
    fontSize: 120,
    requireFontLoad: true,
  },

  features: {
    icons: true,
    shapes: true,
    illustrations: true,
  },

  backgroundType: 'color',
  useUnifiedTabs: true,

  textFields: [
    { key: 'title', label: 'Titel', multiline: false },
    { key: 'subtitle', label: 'Untertitel', multiline: false },
  ],

  multiPage: {
    enabled: true,
    maxPages: 30,
    heterogeneous: true,
    defaultNewPageState: {
      title: '',
      subtitle: '',
    },
  },

  ai: presTitleAiCapabilities,

  tabs: [
    {
      id: 'background',
      icon: HiPhotograph,
      label: 'Hintergrund',
      ariaLabel: 'Farbschema wählen',
    },
    {
      id: 'text',
      icon: PiTextAa,
      label: 'Text',
      ariaLabel: 'Text bearbeiten',
    },
    {
      id: 'assets',
      icon: PiSquaresFourFill,
      label: 'Elemente',
      ariaLabel: 'Dekorative Elemente',
    },
    uploadsTab,
    {
      id: 'design',
      icon: PiPaintBrushBroadFill,
      label: 'Design',
      ariaLabel: 'Farbschema und Fußzeile',
    },
    { id: 'ai', icon: HiSparkles, label: 'KI', ariaLabel: 'KI-Vorschläge' },
    chatTab,
  ],

  getVisibleTabs: () => ['background', 'text', 'assets', 'uploads', 'design', 'ai', 'chat'],

  sections: {
    background: {
      component: BackgroundSection,
      propsFactory: (state, actions) => ({
        currentColor: state.backgroundColor,
        colors: PRES_BACKGROUND_COLORS,
        onColorChange: (color: string) => {
          const mode: PresentationColorMode = color === PRES_COLORS.dk2 ? 'dark' : 'light';
          actions.setColorMode(mode);
        },
      }),
    },
    assets: {
      component: AssetsSection,
      propsFactory: (state, actions, context) => ({
        assetInstances: state.assetInstances,
        onAddAsset: actions.addAsset,
        onUpdateAsset: actions.updateAsset,
        onRemoveAsset: actions.removeAsset,
        ...injectFeatureProps(state, actions, context),
      }),
    },
    uploads: uploadsSectionEntry,
    chat: createChatSection('pres-title'),
    design: {
      component: PresentationDesignSection,
      propsFactory: (state, actions) => ({
        colorMode: state.colorMode,
        onColorModeChange: actions.setColorMode,
        footerDate: state.footerDate,
        onFooterDateChange: actions.setFooterDate,
        footerCustomText: state.footerCustomText,
        onFooterCustomTextChange: actions.setFooterCustomText,
        showSlideNumber: state.showSlideNumber,
        onShowSlideNumberChange: actions.setShowSlideNumber,
      }),
    },
    share: createShareSection<PresentationSlideState, PresentationSlideActions>(
      'pres-title',
      (state) => {
        const title = state.title || '';
        const subtitle = state.subtitle || '';
        return [title, subtitle].filter(Boolean).join('\n');
      }
    ),
    ai: createAiSectionRegistration('pres-title', presTitleAiCapabilities),
  },

  elements: [
    backgroundElement,
    sunflowerElement,
    titleTextElement,
    subtitleTextElement,
    ...createFooterElements(10),
  ],

  calculateLayout: calculateTitleLayout,

  createInitialState: (props) => createPresentationInitialState(props, 'light'),

  createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) =>
    createPresentationActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      callbacks,
      {
        canvasWidth: PRES_CONFIG.canvas.width,
        canvasHeight: PRES_CONFIG.canvas.height,
        getFontColor: (state) => getPresColors(state.colorMode).text,
      }
    ),
};
