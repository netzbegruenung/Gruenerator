/**
 * createPresentationSlide — factory for the 3 presentation slide configs.
 *
 * pres-title, pres-content, pres-image share ~270 lines of mechanical
 * tab/section/multiPage/fonts/design boilerplate. This factory absorbs
 * everything that's identical, parameterized by the 5 axes that actually
 * differ:
 *
 *   - canvas font preload size (120 vs 80)
 *   - background variant (color picker vs image picker)
 *   - text-field set (2-field vs 3-field) with their setters
 *   - default new-page state
 *   - slide-specific elements (sunflower / overlay rect / etc.)
 *   - layout calculator
 */

import { HiPhotograph, HiSparkles } from 'react-icons/hi';
import { PiPaintBrushBroadFill, PiSquaresFourFill, PiTextAa } from 'react-icons/pi';

import { createAiSectionRegistration } from '../../ai/createAiSectionRegistration';
import {
  AssetsSection,
  BackgroundSection,
  CombinedTextSection,
  ImageBackgroundSection,
  PresentationDesignSection,
} from '../../sidebar/sections';
import { chatTab, createCommonSectionEntries, toolsTab, uploadsTab } from '../commonSections';
import { injectFeatureProps } from '../featureInjector';
import { createShareSection } from '../shareSection';

import { makeSectionDefiner } from '../factory/defineSection';

import { createFooterElements } from './createFooterElements';
import { createPresentationActions } from './createPresentationActions';
import { createPresentationAiCapabilities, type PresentationTextField } from './presentationAi';
import {
  PRES_BACKGROUND_COLORS,
  PRES_COLORS,
  PRES_CONFIG,
  getPresColors,
} from './presentationTheme';
import { createPresentationInitialState } from './presentationTypes';

import type { CanvasElementConfig, FullCanvasConfig, LayoutCalculator } from '../types';
import type { TextFieldConfig } from '../unifiedTabs';
import type { SidebarTab } from '../../sidebar/types';
import type { PresentationColorMode } from './presentationTheme';
import type { PresentationSlideActions, PresentationSlideState } from './presentationTypes';

// ===========================================================================
// FACTORY OPTIONS
// ===========================================================================

/**
 * One text field exposed by the slide — pairs the unified text-section
 * config with the AI field id and the action setters that mutate it.
 */
export interface PresentationTextFieldDescriptor {
  config: TextFieldConfig;
  aiField: PresentationTextField;
  read: (state: PresentationSlideState) => string;
  setText: (actions: PresentationSlideActions, value: string) => void;
  setFontSize: (actions: PresentationSlideActions, size: number) => void;
}

type SlideId = 'pres-title' | 'pres-image' | 'pres-content';

type BackgroundVariant = { kind: 'color' } | { kind: 'image' };

export interface PresentationSlideOptions {
  id: SlideId;
  /** Canvas font preload size — affects metrics, not on-screen rendering. */
  fontPreloadSize: number;
  background: BackgroundVariant;
  textFields: ReadonlyArray<PresentationTextFieldDescriptor>;
  defaultNewPageState: Partial<PresentationSlideState>;
  calculateLayout: LayoutCalculator<PresentationSlideState>;
  /** Slide-specific elements (sunflower, overlay rect, title/body text, etc.).
   *  The footer is appended automatically at z-order 10. */
  elements: CanvasElementConfig<PresentationSlideState>[];
}

// ===========================================================================
// FACTORY
// ===========================================================================

export function createPresentationSlide(
  options: PresentationSlideOptions
): FullCanvasConfig<PresentationSlideState, PresentationSlideActions> {
  const {
    id,
    fontPreloadSize,
    background,
    textFields,
    defaultNewPageState,
    calculateLayout,
    elements,
  } = options;

  const aiCapabilities = createPresentationAiCapabilities({
    template: id,
    fields: textFields.map((t) => t.aiField),
  });

  const section = makeSectionDefiner<PresentationSlideState, PresentationSlideActions>();

  const tabs: SidebarTab[] = [
    {
      id: 'background',
      icon: HiPhotograph,
      label: background.kind === 'image' ? 'Bild' : 'Hintergrund',
      ariaLabel: background.kind === 'image' ? 'Hintergrundbild wählen' : 'Farbschema wählen',
    },
    { id: 'text', icon: PiTextAa, label: 'Text', ariaLabel: 'Text bearbeiten' },
    {
      id: 'assets',
      icon: PiSquaresFourFill,
      label: 'Elemente',
      ariaLabel: 'Dekorative Elemente',
    },
    toolsTab,
    uploadsTab,
    {
      id: 'design',
      icon: PiPaintBrushBroadFill,
      label: 'Design',
      ariaLabel: 'Farbschema und Fußzeile',
    },
    { id: 'ai', icon: HiSparkles, label: 'KI', ariaLabel: 'KI-Vorschläge' },
    chatTab,
  ];

  const backgroundSection =
    background.kind === 'image'
      ? section({
          component: ImageBackgroundSection,
          propsFactory: (state, actions) => ({
            currentImageSrc: state.currentImageSrc,
            onImageChange: actions.setCurrentImageSrc,
            imageScale: state.imageScale,
            onImageScaleChange: actions.setImageScale,
            imageAttribution: state.imageAttribution ?? null,
            onImageAttributionChange: actions.setImageAttribution ?? (() => {}),
          }),
        })
      : section({
          component: BackgroundSection,
          propsFactory: (state, actions) => ({
            currentColor: state.backgroundColor,
            colors: PRES_BACKGROUND_COLORS,
            onColorChange: (color: string) => {
              const mode: PresentationColorMode = color === PRES_COLORS.dk2 ? 'dark' : 'light';
              actions.setColorMode(mode);
            },
          }),
        });

  const textSection = section({
    component: CombinedTextSection,
    propsFactory: (state, actions) => {
      const values: Record<string, string> = {};
      const fontSizes: Record<string, number> = {};
      for (const t of textFields) {
        values[t.config.key] = t.read(state);
        if (t.config.fontSizeStateKey) {
          const fs = (state as Record<string, unknown>)[t.config.fontSizeStateKey];
          if (typeof fs === 'number') fontSizes[t.config.fontSizeStateKey] = fs;
        }
      }
      return {
        textFields: textFields.map((t) => t.config),
        values,
        onFieldChange: (key: string, value: string) => {
          const field = textFields.find((t) => t.config.key === key);
          field?.setText(actions, value);
        },
        fontSizes,
        onFontSizeChange: (key: string, size: number) => {
          const field = textFields.find((t) => t.config.fontSizeStateKey === key);
          field?.setFontSize(actions, size);
        },
        additionalTexts: state.additionalTexts,
        onAddHeader: actions.addHeader,
        onAddText: actions.addText,
        onUpdateText: actions.updateAdditionalText,
        onRemoveText: actions.removeAdditionalText,
      };
    },
  });

  const getShareText = (state: PresentationSlideState) =>
    textFields
      .map((t) => t.read(state))
      .filter((v) => v.length > 0)
      .join('\n');

  return {
    id,
    canvas: {
      width: PRES_CONFIG.canvas.width,
      height: PRES_CONFIG.canvas.height,
    },
    fonts: {
      primary: 'GrueneTypeNeue',
      fontSize: fontPreloadSize,
      requireFontLoad: true,
    },
    features: { icons: true, shapes: true, illustrations: true },
    backgroundType: background.kind,
    useUnifiedTabs: true,
    textFields: textFields.map((t) => t.config),
    multiPage: {
      enabled: true,
      maxPages: 30,
      heterogeneous: true,
      defaultNewPageState,
    },
    ai: aiCapabilities,
    tabs,
    // 'ai' / 'background' tabs are registered but hidden from the visible
    // list — Chat drives canvas-AI suggestions; background opens via
    // getAutoSwitchTab when the canvas background is clicked.
    getVisibleTabs: () => ['text', 'assets', 'tools', 'uploads', 'design', 'chat'],
    getAutoSwitchTab: (selectedElement) => (selectedElement === 'background' ? 'background' : null),
    sections: {
      background: backgroundSection,
      text: textSection,
      assets: section({
        component: AssetsSection,
        propsFactory: (state, actions, context) => ({
          assetInstances: state.assetInstances,
          onAddAsset: actions.addAsset,
          onUpdateAsset: actions.updateAsset,
          onRemoveAsset: actions.removeAsset,
          ...injectFeatureProps(state, actions, context),
        }),
      }),
      ...createCommonSectionEntries(id, aiCapabilities),
      design: section({
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
      }),
      share: createShareSection<PresentationSlideState, PresentationSlideActions>(id, getShareText),
      ai: createAiSectionRegistration(id, aiCapabilities),
    },
    elements: [...elements, ...createFooterElements(10)],
    calculateLayout,
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
          getFontColor: (state) =>
            background.kind === 'image' ? '#FFFFFF' : getPresColors(state.colorMode).text,
          hasImageBackground: background.kind === 'image',
        }
      ),
  };
}
