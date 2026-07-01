/**
 * Freeform Full Canvas Configuration
 *
 * Blank canvas where users place arbitrary elements freely.
 * No pre-defined layout — all content is user-created via sidebar tools.
 *
 * Supports: image/color backgrounds, text, icons, shapes, illustrations,
 * balkens, badges, frames — all features the config system offers.
 */

import { CANVAS_COLORS } from '@gruenerator/shared/canvas-editor';
import { HiPhotograph, HiSparkles } from 'react-icons/hi';
import { PiFrameCornersFill, PiSquaresFourFill, PiTextAa } from 'react-icons/pi';

import { buildAssetCapability } from '../ai/assetCapability';
import { createAiSectionRegistration } from '../ai/createAiSectionRegistration';
import { buildIllustrationCapability } from '../ai/illustrationCapability';
import { AssetsSection, BackgroundSection } from '../sidebar';
import { FrameSettingsSection } from '../sidebar/sections/FrameSettingsSection';
import { CombinedTextSection } from '../sidebar/sections/CombinedTextSection';

import { CANVAS_RECOMMENDED_ASSETS } from '../utils/canvasAssets';

import { chatTab, createCommonSectionEntries, toolsTab, uploadsTab } from './commonSections';
import { createBaseActions } from './factory/actionFactories';
import { makeSectionDefiner } from './factory/defineSection';
import { injectFeatureProps } from './featureInjector';
import { createShareSection } from './shareSection';

import type { TemplateAiCapabilities } from '../ai/types';
import type {
  BaseCanvasState,
  ImageBackgroundState,
  ColorBackgroundState,
} from './factory/baseTypes';
import type { FullCanvasConfig, LayoutResult, AdditionalText } from './types';
import type { BackgroundColorOption } from '../sidebar/types';
import type { StockImageAttribution } from '../common/imageSourceTypes';
import type { CanvasAiSnapshot } from '@gruenerator/contracts';

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
// AI CAPABILITY
// ============================================================================

const freeformAiCapabilities: TemplateAiCapabilities<FreeformState, FreeformActions> = {
  supportedOperations: [
    'set-text',
    'set-background-color',
    'remove-element',
    'add-illustration',
    'add-asset',
    'update-element',
  ],

  illustrations: buildIllustrationCapability(),
  assets: buildAssetCapability('freeform'),

  describeForAi: (state): CanvasAiSnapshot => {
    // Existing additionalTexts become AI-targetable text fields. The AI can
    // either update one (by id) or add a new body via the special id `new-body`.
    const existingTexts = (state.additionalTexts ?? []).map((t, i) => ({
      field: t.id,
      label: `Bestehender Text ${i + 1} (${t.type})`,
      value: t.text,
    }));

    return {
      template: 'freeform',
      textFields: [
        ...existingTexts,
        {
          field: 'new-body',
          label: 'Neuen Text hinzufügen',
          value: '',
        },
      ],
      currentBackgroundColor:
        state.backgroundMode === 'color' ? (state.backgroundColor as `#${string}`) : undefined,
      elementsSummary: (state.additionalTexts ?? []).map((t) => ({
        id: t.id,
        kind: 'text' as const,
        label: t.text.slice(0, 40),
      })),
    };
  },
  // Default applier handles `set-text` (additionalText id lookup or new-body),
  // `set-background-color` (actions.setBackgroundColor), and `remove-element`
  // (tries each remove action). No overrides needed.
};

// ============================================================================
// SECTIONS
// ============================================================================

const BACKGROUND_COLORS: BackgroundColorOption[] = [
  { id: 'tanne', label: 'Tanne', color: CANVAS_COLORS.TANNE },
  { id: 'klee', label: 'Klee', color: CANVAS_COLORS.KLEE },
  { id: 'sonne', label: 'Sonne', color: CANVAS_COLORS.SONNE },
  { id: 'himmel', label: 'Himmel', color: CANVAS_COLORS.HIMMEL },
  { id: 'sand', label: 'Sand', color: CANVAS_COLORS.SAND },
  { id: 'weiss', label: 'Weiß', color: CANVAS_COLORS.WHITE },
  { id: 'schwarz', label: 'Schwarz', color: CANVAS_COLORS.BLACK },
];

const section = makeSectionDefiner<FreeformState, FreeformActions>();

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

  ai: freeformAiCapabilities,

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
    {
      id: 'frame-settings',
      icon: PiFrameCornersFill,
      label: 'Rahmen',
      ariaLabel: 'Rahmen-Einstellungen',
    },
    toolsTab,
    uploadsTab,
    {
      id: 'ai',
      icon: HiSparkles,
      label: 'KI',
      ariaLabel: 'KI-Vorschläge',
    },
    chatTab,
  ],

  // 'ai' tab kept registered but hidden — Chat tab now drives canvas-AI suggestions.
  // 'background' tab kept registered but hidden — opened via getAutoSwitchTab when
  // the canvas background is clicked.
  getVisibleTabs: () => ['text', 'elements', 'tools', 'uploads', 'chat'],

  getAutoSwitchTab: (selectedElement) => {
    if (selectedElement === 'background') return 'background';
    if (selectedElement?.startsWith('frame-')) return 'frame-settings';
    return null;
  },

  sections: {
    // BackgroundSection drives both color (palette) and image (Unsplash search)
    // via its own internal subsection tabs; mode-switching happens inside the
    // callbacks below. Image scale/offset are edited on-canvas (the
    // `background-image` element is `transformable`), so no scale props here.
    background: section({
      component: BackgroundSection,
      propsFactory: (state, actions) => ({
        colors: BACKGROUND_COLORS,
        currentColor: state.backgroundMode === 'color' ? state.backgroundColor : '#005538',
        onColorChange: (color: string) => {
          actions.setBackgroundColor(color);
          if (state.backgroundMode !== 'color') actions.setBackgroundMode('color');
        },
        currentImageSrc: state.currentImageSrc,
        onImageChange: (
          file: File | null,
          objectUrl?: string,
          attribution?: StockImageAttribution | null
        ) => {
          actions.setCurrentImageSrc(file, objectUrl, attribution);
          if (file) actions.setBackgroundMode('image');
        },
      }),
    }),

    text: section({
      component: CombinedTextSection,
      propsFactory: (state, actions) => ({
        additionalTexts: state.additionalTexts,
        onAddHeader: actions.addHeader,
        onAddSubheader: actions.addSubheader,
        onAddText: actions.addText,
        onUpdateText: actions.updateAdditionalText,
        onRemoveText: actions.removeAdditionalText,
      }),
    }),

    elements: section({
      component: AssetsSection,
      propsFactory: (state, actions, context) => ({
        onAddAsset: actions.addAsset,
        recommendedAssetIds: CANVAS_RECOMMENDED_ASSETS['dreizeilen'],
        ...injectFeatureProps(state, actions, context),
      }),
    }),

    'frame-settings': section({
      component: FrameSettingsSection,
      propsFactory: (state, actions, context) => {
        const selectedId = context?.selectedElement ?? null;
        const selectedFrame = selectedId
          ? (state.frameInstances?.find((f) => f.id === selectedId) ?? null)
          : null;
        return {
          selectedFrame,
          onSetFrameImage: actions.setFrameImage,
          onUpdateFrame: actions.updateFrame,
          onRemoveFrame: actions.removeFrame,
        };
      },
    }),

    ...createCommonSectionEntries('freeform', freeformAiCapabilities),

    share: createShareSection<FreeformState>('freeform', () => ''),

    ai: createAiSectionRegistration('freeform', freeformAiCapabilities),
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
      coverFit: true,
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
    imageOffset: (props.imageOffset as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
    imageScale: (props.imageScale as number | undefined) ?? 1,
    hasBackgroundImage: !!props.currentImageSrc,
    backgroundImageOpacity: (props.backgroundImageOpacity as number | undefined) ?? 1,
    imageAttribution: (props.imageAttribution as StockImageAttribution | null | undefined) ?? null,

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
    userImageInstances: [],

    // Layer ordering
    layerOrder: [],

    // UI state
    isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
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
