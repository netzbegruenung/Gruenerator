/**
 * Freeform Full Canvas Configuration
 *
 * Blank canvas where users place arbitrary elements freely.
 * No pre-defined layout — all content is user-created via sidebar tools.
 *
 * Supports: image/color backgrounds, text, icons, shapes, illustrations,
 * balkens, badges, frames — all features the config system offers.
 */

import { HiPhotograph } from 'react-icons/hi';
import { PiSquaresFourFill, PiTextAa } from 'react-icons/pi';

import { AssetsSection, BackgroundSection } from '../sidebar';
import { FreeformTextSection } from '../sidebar/sections/FreeformTextSection';
import { CANVAS_RECOMMENDED_ASSETS } from '../utils/canvasAssets';

import { createBaseActions } from './factory/commonActions';
import { injectFeatureProps } from './featureInjector';
import { shareTab, createShareSection } from './shareSection';

import type {
  BaseCanvasState,
  ImageBackgroundState,
  ColorBackgroundState,
} from './factory/baseTypes';
import type { FullCanvasConfig, LayoutResult, AdditionalText } from './types';
import type { StockImageAttribution } from '../../services/imageSourceService';

// ============================================================================
// CONSTANTS
// ============================================================================

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1080;

// ============================================================================
// STATE TYPE
// ============================================================================

export interface FreeformState extends BaseCanvasState, ColorBackgroundState {
  backgroundMode: 'color' | 'image';
  // Image background fields (only used when backgroundMode === 'image')
  currentImageSrc?: string;
  backgroundImageFile?: File | Blob | null;
  imageOffset: { x: number; y: number };
  imageScale: number;
  hasBackgroundImage: boolean;
  backgroundImageOpacity: number;
  imageAttribution: StockImageAttribution | null;
  // Layer ordering
  layerOrder: string[];
}

// ============================================================================
// ACTIONS TYPE — uses 'any' for flexibility with createBaseActions return type
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FreeformActions = Record<string, any>;

// ============================================================================
// LAYOUT CALCULATOR (no-op for freeform — no computed positions)
// ============================================================================

const calculateLayout = (_state: FreeformState): LayoutResult => ({});

// ============================================================================
// FULL CONFIG
// ============================================================================

export const freeformFullConfig: FullCanvasConfig<FreeformState, FreeformActions> = {
  id: 'freeform',

  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
  },

  features: {
    icons: true,
    shapes: true,
    illustrations: true,
  },

  multiPage: {
    enabled: true,
    maxPages: 10,
    heterogeneous: true,
  },

  fonts: {
    primary: 'GrueneTypeNeue',
    fontSize: 60,
    requireFontLoad: true,
  },

  tabs: [
    {
      id: 'background',
      icon: HiPhotograph,
      label: 'Hintergrund',
      ariaLabel: 'Hintergrund anpassen',
    },
    {
      id: 'text',
      icon: PiTextAa,
      label: 'Text',
      ariaLabel: 'Texte hinzufügen',
    },
    {
      id: 'elements',
      icon: PiSquaresFourFill,
      label: 'Elemente',
      ariaLabel: 'Elemente hinzufügen',
    },
    shareTab,
  ],

  getVisibleTabs: () => ['background', 'text', 'elements', 'share'],

  getAutoSwitchTab: (selectedElement) =>
    selectedElement?.startsWith('frame-') ? 'elements' : null,

  sections: {
    background: {
      component: BackgroundSection as unknown as React.ComponentType<Record<string, unknown>>,
      propsFactory: (state, actions) => ({
        backgroundColor: state.backgroundMode === 'color' ? state.backgroundColor : '#005538',
        onColorChange: (color: string) => {
          actions.setBackgroundColor(color);
          if (state.backgroundMode !== 'color') actions.setBackgroundMode('color');
        },
        // Image background support
        backgroundMode: state.backgroundMode,
        onBackgroundModeChange: actions.setBackgroundMode,
        currentImageSrc: state.currentImageSrc,
        onImageChange: (
          file: File | null,
          objectUrl?: string,
          attribution?: StockImageAttribution | null
        ) => {
          actions.setCurrentImageSrc(file, objectUrl, attribution);
          if (file) actions.setBackgroundMode('image');
        },
        imageScale: state.imageScale,
        onScaleChange: actions.setImageScale,
        imageAttribution: state.imageAttribution,
      }),
    },

    text: {
      component: FreeformTextSection,
      propsFactory: (state, actions) => ({
        additionalTexts: state.additionalTexts,
        onAddHeader: actions.addHeader,
        onAddText: actions.addText,
        onUpdateText: actions.updateAdditionalText,
        onRemoveText: actions.removeAdditionalText,
      }),
    },

    elements: {
      component: AssetsSection,
      propsFactory: (state, actions, context) => ({
        onAddHeader: actions.addHeader,
        onAddText: actions.addText,
        onAddAsset: actions.addAsset,
        recommendedAssetIds: CANVAS_RECOMMENDED_ASSETS['dreizeilen'],
        ...injectFeatureProps(state, actions, context),
      }),
    },

    share: createShareSection<FreeformState>('freeform', () => ''),
  },

  elements: [
    // Background color rect (always rendered, under everything)
    {
      id: 'background-color',
      type: 'background',
      x: 0,
      y: 0,
      order: -2,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      fillStateKey: 'backgroundColor',
      visible: (state: FreeformState) => state.backgroundMode === 'color',
    },
    // Background image (when in image mode)
    {
      id: 'background-image',
      type: 'image',
      x: 0,
      y: 0,
      order: -1,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      srcKey: 'currentImageSrc',
      offsetKey: 'imageOffset',
      scaleKey: 'imageScale',
      draggable: true,
      transformable: true,
      visible: (state: FreeformState) =>
        state.backgroundMode === 'image' && state.hasBackgroundImage,
      opacity: (state: FreeformState) => state.backgroundImageOpacity,
      opacityStateKey: 'backgroundImageOpacity',
    },
  ],

  calculateLayout,

  createInitialState: (props: Record<string, unknown>) => ({
    // Background
    backgroundMode: (props.backgroundMode as 'color' | 'image' | undefined) ?? 'color',
    backgroundColor: (props.backgroundColor as string | undefined) ?? '#005538',
    currentImageSrc: props.currentImageSrc as string | undefined,
    backgroundImageFile: null,
    imageOffset: { x: 0, y: 0 },
    imageScale: 1,
    hasBackgroundImage: !!props.currentImageSrc,
    backgroundImageOpacity: 1,
    imageAttribution: null,

    // Empty element arrays
    assetInstances: [],
    selectedIcons: [],
    iconStates: {},
    shapeInstances: [],
    illustrationInstances: [],
    additionalTexts: [],
    pillBadgeInstances: [],
    circleBadgeInstances: [],
    balkenInstances: [],
    frameInstances: [],

    // Layer ordering
    layerOrder: [],

    // UI state
    isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
    alternatives: [],
  }),

  createActions: (getState, setState, saveToHistory, debouncedSaveToHistory) => {
    const baseActions = createBaseActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      '#FFFFFF'
    );

    return {
      ...baseActions,

      handleSelectAlternative: () => {},

      // === Background Actions ===
      setBackgroundMode: (mode: 'color' | 'image') => {
        setState((prev) => ({ ...prev, backgroundMode: mode }));
        saveToHistory({ ...getState(), backgroundMode: mode });
      },

      setBackgroundColor: (color: string) => {
        setState((prev) => ({ ...prev, backgroundColor: color }));
        debouncedSaveToHistory({ ...getState(), backgroundColor: color });
      },

      setCurrentImageSrc: (
        file: File | null,
        objectUrl?: string,
        attribution?: StockImageAttribution | null
      ) => {
        const src = file ? objectUrl : undefined;
        setState((prev) => ({
          ...prev,
          currentImageSrc: src,
          backgroundImageFile: file,
          imageAttribution: attribution ?? null,
          hasBackgroundImage: !!src,
        }));
        saveToHistory({
          ...getState(),
          currentImageSrc: src,
          backgroundImageFile: file,
          imageAttribution: attribution ?? null,
          hasBackgroundImage: !!src,
        });
      },

      setImageScale: (scale: number) => {
        setState((prev) => ({ ...prev, imageScale: scale }));
        debouncedSaveToHistory({ ...getState(), imageScale: scale });
      },

      handleBackgroundImageDragEnd: (x: number, y: number) => {
        setState((prev) => ({ ...prev, imageOffset: { x, y } }));
        saveToHistory({ ...getState(), imageOffset: { x, y } });
      },

      // === Layer Actions ===
      moveLayerUp: (itemId: string) => {
        setState((prev) => {
          const currentIndex = prev.layerOrder.indexOf(itemId);
          if (currentIndex === -1 || currentIndex === prev.layerOrder.length - 1) return prev;
          const newOrder = [...prev.layerOrder];
          [newOrder[currentIndex], newOrder[currentIndex + 1]] = [
            newOrder[currentIndex + 1],
            newOrder[currentIndex],
          ];
          return { ...prev, layerOrder: newOrder };
        });
        saveToHistory(getState());
      },

      moveLayerDown: (itemId: string) => {
        setState((prev) => {
          const currentIndex = prev.layerOrder.indexOf(itemId);
          if (currentIndex <= 0) return prev;
          const newOrder = [...prev.layerOrder];
          [newOrder[currentIndex], newOrder[currentIndex - 1]] = [
            newOrder[currentIndex - 1],
            newOrder[currentIndex],
          ];
          return { ...prev, layerOrder: newOrder };
        });
        saveToHistory(getState());
      },

      bringToFront: (itemId: string) => {
        setState((prev) => ({
          ...prev,
          layerOrder: [...prev.layerOrder.filter((id) => id !== itemId), itemId],
        }));
        saveToHistory(getState());
      },

      sendToBack: (itemId: string) => {
        setState((prev) => ({
          ...prev,
          layerOrder: [itemId, ...prev.layerOrder.filter((id) => id !== itemId)],
        }));
        saveToHistory(getState());
      },
    };
  },
};
