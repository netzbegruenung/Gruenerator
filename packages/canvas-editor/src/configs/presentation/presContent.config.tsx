/**
 * Presentation: Content Slide Config — "Inhalt mit Titel"
 *
 * Title at top + body text below. When bodyText2 is filled,
 * automatically switches to a two-column layout.
 * Supports light/dark color mode toggle.
 */

import { HiPhotograph, HiSparkles } from 'react-icons/hi';
import { PiPaintBrushBroadFill, PiSquaresFourFill, PiTextAa } from 'react-icons/pi';

import { createAiSectionRegistration } from '../../ai/createAiSectionRegistration';
import {
  BackgroundSection,
  AssetsSection,
  CombinedTextSection,
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
import { calculateContentLayout } from './presentationLayout';
import { createFooterElements } from './createFooterElements';
import { createPresentationAiCapabilities } from './presentationAi';
import { createPresentationInitialState } from './presentationTypes';

import type { FullCanvasConfig, BackgroundElementConfig, TextElementConfig } from '../types';
import type { TextFieldConfig } from '../unifiedTabs';
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

const titleTextElement: TextElementConfig<PresentationSlideState> = {
  id: 'title-text',
  type: 'text',
  x: (_s, l) => (l['title-text'] as { x?: number })?.x ?? PRES_CONFIG.margins.left,
  y: (_s, l) => (l['title-text'] as { y?: number })?.y ?? PRES_CONFIG.margins.top,
  order: 2,
  textKey: 'title',
  width: (_s, l) => (l['title-text'] as { width?: number })?.width ?? PRES_CONFIG.contentWidth,
  fontSize: (_s, l) => (l['title-text'] as { fontSize?: number })?.fontSize ?? 80,
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
  x: (_s, l) => (l['body-text'] as { x?: number })?.x ?? PRES_CONFIG.margins.left,
  y: (_s, l) => (l['body-text'] as { y?: number })?.y ?? 250,
  order: 3,
  textKey: 'bodyText',
  width: (_s, l) => (l['body-text'] as { width?: number })?.width ?? PRES_CONFIG.contentWidth,
  fontSize: (_s, l) =>
    (l['body-text'] as { fontSize?: number })?.fontSize ?? PRES_CONFIG.body.fontSize,
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
  x: (_s, l) => (l['body2-text'] as { x?: number })?.x ?? PRES_CONFIG.canvas.width / 2 + 30,
  y: (_s, l) => (l['body2-text'] as { y?: number })?.y ?? 250,
  order: 4,
  textKey: 'bodyText2',
  width: (_s, l) => (l['body2-text'] as { width?: number })?.width ?? 840,
  fontSize: (_s, l) =>
    (l['body2-text'] as { fontSize?: number })?.fontSize ?? PRES_CONFIG.body.fontSize,
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

// ============================================================================
// AI CAPABILITY
// ============================================================================

const presContentAiCapabilities = createPresentationAiCapabilities({
  template: 'pres-content',
  fields: ['title', 'bodyText', 'bodyText2'],
});

const TEXT_FIELDS: TextFieldConfig[] = [
  { key: 'title', label: 'Titel', multiline: false, fontSizeStateKey: 'customTitleFontSize' },
  { key: 'bodyText', label: 'Inhalt', multiline: true, fontSizeStateKey: 'customBodyFontSize' },
  {
    key: 'bodyText2',
    label: 'Zweite Spalte (optional)',
    multiline: true,
    fontSizeStateKey: 'customBody2FontSize',
  },
];

// ============================================================================
// CONFIG EXPORT
// ============================================================================

export const presContentConfig: FullCanvasConfig<PresentationSlideState, PresentationSlideActions> =
  {
    id: 'pres-content',

    canvas: {
      width: PRES_CONFIG.canvas.width,
      height: PRES_CONFIG.canvas.height,
    },

    fonts: {
      primary: 'GrueneTypeNeue',
      fontSize: 80,
      requireFontLoad: true,
    },

    features: {
      icons: true,
      shapes: true,
      illustrations: true,
    },

    backgroundType: 'color',
    useUnifiedTabs: true,

    textFields: TEXT_FIELDS,

    multiPage: {
      enabled: true,
      maxPages: 30,
      heterogeneous: true,
      defaultNewPageState: {
        title: '',
        bodyText: '',
        bodyText2: '',
      },
    },

    ai: presContentAiCapabilities,

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

    // 'ai' tab kept registered but hidden — Chat tab now drives canvas-AI suggestions.
    getVisibleTabs: () => ['background', 'text', 'assets', 'uploads', 'design', 'chat'],

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
      text: {
        component: CombinedTextSection,
        propsFactory: (state, actions) => ({
          textFields: TEXT_FIELDS,
          values: {
            title: state.title,
            bodyText: state.bodyText,
            bodyText2: state.bodyText2,
          },
          onFieldChange: (key: string, value: string) => {
            if (key === 'title') actions.setTitle(value);
            else if (key === 'bodyText') actions.setBodyText(value);
            else if (key === 'bodyText2') actions.setBodyText2(value);
          },
          fontSizes: {
            ...(state.customTitleFontSize !== null
              ? { customTitleFontSize: state.customTitleFontSize }
              : {}),
            ...(state.customBodyFontSize !== null
              ? { customBodyFontSize: state.customBodyFontSize }
              : {}),
            ...(state.customBody2FontSize !== null
              ? { customBody2FontSize: state.customBody2FontSize }
              : {}),
          },
          onFontSizeChange: (key: string, size: number) => {
            if (key === 'customTitleFontSize') actions.handleTitleFontSizeChange(size);
            else if (key === 'customBodyFontSize') actions.handleBodyFontSizeChange(size);
            else if (key === 'customBody2FontSize') actions.handleBody2FontSizeChange(size);
          },
          additionalTexts: state.additionalTexts,
          onAddHeader: actions.addHeader,
          onAddText: actions.addText,
          onUpdateText: actions.updateAdditionalText,
          onRemoveText: actions.removeAdditionalText,
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
      chat: createChatSection('pres-content', presContentAiCapabilities),
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
        'pres-content',
        (state) => {
          const parts = [state.title, state.bodyText, state.bodyText2].filter(Boolean);
          return parts.join('\n\n');
        }
      ),
      ai: createAiSectionRegistration('pres-content', presContentAiCapabilities),
    },

    elements: [
      backgroundElement,
      titleTextElement,
      bodyTextElement,
      body2TextElement,
      ...createFooterElements(10),
    ],

    calculateLayout: calculateContentLayout,

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
