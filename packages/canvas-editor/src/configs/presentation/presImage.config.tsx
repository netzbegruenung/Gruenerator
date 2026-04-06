/**
 * Presentation: Image Slide Config — "Bild mit Überschrift"
 *
 * Full-bleed background image with a semi-transparent overlay
 * and large title text. Used for visual impact slides.
 */

import { HiPhotograph } from 'react-icons/hi';
import { PiPaintBrushBroadFill, PiSquaresFourFill, PiTextAa } from 'react-icons/pi';

import { ImageBackgroundSection, AssetsSection, PresentationDesignSection } from '../../sidebar/sections';
import { injectFeatureProps } from '../featureInjector';
import { alternativesTab, createAlternativesSection } from '../alternativesSection';
import { createShareSection } from '../shareSection';

import { PRES_CONFIG, getPresColors } from './presentationTheme';
import { createPresentationActions } from './createPresentationActions';
import { calculateImageLayout } from './presentationLayout';
import { createFooterElements } from './createFooterElements';
import { createPresentationInitialState } from './presentationTypes';

import type {
  FullCanvasConfig,
  ImageElementConfig,
  RectElementConfig,
  TextElementConfig,
} from '../types';
import type { PresentationSlideState, PresentationSlideActions } from './presentationTypes';

// ============================================================================
// ELEMENTS
// ============================================================================

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
  x: (_s, l) => (l['title-text'] as { x?: number })?.x ?? PRES_CONFIG.margins.left,
  y: (_s, l) => (l['title-text'] as { y?: number })?.y ?? 160,
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
  fill: () => '#FFFFFF',
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
  fill: () => '#FFFFFF',
  fillStateKey: 'subtitleColor',
  visible: (state) => !!state.subtitle,
};

// ============================================================================
// CONFIG EXPORT
// ============================================================================

export const presImageConfig: FullCanvasConfig<PresentationSlideState, PresentationSlideActions> = {
  id: 'pres-image',

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

  backgroundType: 'image',
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

  tabs: [
    {
      id: 'background',
      icon: HiPhotograph,
      label: 'Bild',
      ariaLabel: 'Hintergrundbild wählen',
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
    {
      id: 'design',
      icon: PiPaintBrushBroadFill,
      label: 'Design',
      ariaLabel: 'Farbschema und Fußzeile',
    },
    alternativesTab,
  ],

  getVisibleTabs: () => ['background', 'text', 'assets', 'design'],

  sections: {
    background: {
      component: ImageBackgroundSection,
      propsFactory: (state, actions) => ({
        currentImageSrc: state.currentImageSrc,
        onImageChange: actions.setCurrentImageSrc,
        imageScale: state.imageScale,
        onImageScaleChange: actions.setImageScale,
        imageAttribution: state.imageAttribution ?? null,
        onImageAttributionChange: actions.setImageAttribution ?? (() => {}),
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
    alternatives: createAlternativesSection<PresentationSlideState, PresentationSlideActions>({
      type: 'string',
      getAlternatives: (state) => state.alternatives as string[],
      getCurrentValue: (state) => state.title,
      getSelectAction: (actions) => actions.handleSelectAlternative as (alt: string) => void,
    }),
    share: createShareSection<PresentationSlideState, PresentationSlideActions>(
      'pres-image',
      (state) => {
        const title = state.title || '';
        const subtitle = state.subtitle || '';
        return [title, subtitle].filter(Boolean).join('\n');
      }
    ),
  },

  elements: [
    backgroundImageElement,
    overlayRectElement,
    titleTextElement,
    subtitleTextElement,
    ...createFooterElements(10),
  ],

  calculateLayout: calculateImageLayout,

  createInitialState: (props) => createPresentationInitialState(props, 'light'),

  createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) =>
    createPresentationActions(getState, setState, saveToHistory, debouncedSaveToHistory, callbacks, {
      canvasWidth: PRES_CONFIG.canvas.width,
      canvasHeight: PRES_CONFIG.canvas.height,
      getFontColor: () => '#FFFFFF',
      hasImageBackground: true,
    }),
};
