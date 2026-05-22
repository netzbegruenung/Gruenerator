/**
 * Dreizeilen Full Canvas Configuration
 *
 * Complete config-driven canvas for the "3 lines on bars" sharepic format.
 * Migrated from monolithic 1,107-line DreizeilenCanvas component.
 */

import { HiCog, HiPhotograph, HiSparkles } from 'react-icons/hi';
import { PiFrameCornersFill, PiSquaresFourFill, PiTextAa } from 'react-icons/pi';

import { buildAssetCapability } from '../ai/assetCapability';
import { createAiSectionRegistration } from '../ai/createAiSectionRegistration';
import { buildIllustrationCapability } from '../ai/illustrationCapability';
import { AssetsSection, ImageBackgroundSection } from '../sidebar';
import { CombinedTextSection } from '../sidebar/sections/CombinedTextSection';
import { BalkenSettingsSection } from '../sidebar/sections/BalkenSettingsSection';
import { FrameSettingsSection } from '../sidebar/sections/FrameSettingsSection';
import { chatTab, createCommonSectionEntries, toolsTab, uploadsTab } from './commonSections';
import { CANVAS_RECOMMENDED_ASSETS, SYSTEM_ASSETS } from '../utils/canvasAssets';
import {
  calculateDreizeilenLayout,
  COLOR_SCHEMES,
  getColorScheme,
  DREIZEILEN_CONFIG,
} from '../utils/dreizeilenLayout';

import { ADDITIONAL_TEXT_DEFAULTS } from './dreizeilen.constants';
import {
  createAssetActions,
  createIconActions,
  createShapeActions,
  createIllustrationActions,
  createPillBadgeActions,
  createCircleBadgeActions,
  createBalkenActions,
  createFrameActions,
} from './factory/commonActions';
import { makeSectionDefiner } from './factory/defineSection';
import { injectFeatureProps } from './featureInjector';
import { PLACEHOLDER_TEXT } from './placeholders';
import { createShareSection } from './shareSection';

import type { TemplateAiCapabilities } from '../ai/types';
import type { DreizeilenFullState, DreizeilenFullActions } from './dreizeilen.types';
import type { CanvasAiSnapshot } from '@gruenerator/contracts';
import type {
  FullCanvasConfig,
  LayoutResult as GenericLayoutResult,
  AdditionalText,
} from './types';
import type { StockImageAttribution } from '../common/imageSourceTypes';
import type { BalkenInstance } from '../primitives/BalkenGroup';
import type { AssetInstance } from '../utils/canvasAssets';
import type { CircleBadgeInstance } from '../utils/circleBadgeUtils';
import type { IllustrationInstance } from '../utils/illustrations/types';
import type { PillBadgeInstance } from '../utils/pillBadgeUtils';
import type { ShapeInstance } from '../utils/shapes';

// ============================================================================
// CONSTANTS
// ============================================================================

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;

const SUNFLOWER_CONFIG = {
  src: SYSTEM_ASSETS.sunflower.yellow.src,
  defaultOpacity: 1,
  defaultSize: 200,
};

// ============================================================================
// HELPER: CREATE BALKEN INSTANCE
// ============================================================================

/**
 * Creates a single BalkenInstance for the 3-bar Dreizeilen canvas
 * This is computed from state rather than being stored directly
 */
function createBalkenInstance(state: Partial<DreizeilenFullState>): BalkenInstance {
  return {
    id: 'dreizeilen-balken',
    mode: 'triple' as const,
    colorSchemeId: state.colorSchemeId ?? 'tanne-sand',
    widthScale: state.balkenWidthScale ?? 1,
    offset: state.balkenOffset ?? { x: 0, y: 0 },
    scale: state.balkenScale ?? 1,
    texts: [state.line1 ?? '', state.line2 ?? '', state.line3 ?? ''],
    rotation: state.balkenRotation ?? 0,
    opacity: state.balkenOpacity ?? 1,
    barOffsets: state.barOffsets,
  };
}

// ============================================================================
// LAYOUT CALCULATOR
// ============================================================================

const calculateLayout = (state: DreizeilenFullState): GenericLayoutResult => {
  const layoutResult = calculateDreizeilenLayout(
    [state.line1, state.line2, state.line3],
    state.fontSize,
    state.barOffsets,
    [state.balkenOffset.x, state.balkenOffset.y],
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    state.balkenWidthScale
  );

  const colorScheme = getColorScheme(state.colorSchemeId);

  return {
    // Balken (bars) layouts
    balken1: {
      x: layoutResult.balkenLayouts[0]?.x ?? 0,
      y: layoutResult.balkenLayouts[0]?.y ?? 200,
      width: layoutResult.balkenLayouts[0]?.width ?? 800,
      height: layoutResult.balkenLayouts[0]?.height ?? 100,
    },
    balken2: {
      x: layoutResult.balkenLayouts[1]?.x ?? 0,
      y: layoutResult.balkenLayouts[1]?.y ?? 400,
      width: layoutResult.balkenLayouts[1]?.width ?? 800,
      height: layoutResult.balkenLayouts[1]?.height ?? 100,
    },
    balken3: {
      x: layoutResult.balkenLayouts[2]?.x ?? 0,
      y: layoutResult.balkenLayouts[2]?.y ?? 600,
      width: layoutResult.balkenLayouts[2]?.width ?? 800,
      height: layoutResult.balkenLayouts[2]?.height ?? 100,
    },
    // Sunflower default position
    sunflower: {
      x: layoutResult.sunflowerDefaultPos?.x ?? CANVAS_WIDTH - 150,
      y: layoutResult.sunflowerDefaultPos?.y ?? CANVAS_HEIGHT - 150,
      width: layoutResult.sunflowerSize ?? SUNFLOWER_CONFIG.defaultSize,
      height: layoutResult.sunflowerSize ?? SUNFLOWER_CONFIG.defaultSize,
    },
    _meta: {
      colorScheme,
      textBlockBounds: layoutResult.textBlockBounds,
      balkenLayouts: layoutResult.balkenLayouts,
    } as Record<string, unknown>,
  };
};

// ============================================================================
// FULL CONFIG
// ============================================================================

// ============================================================================
// AI CAPABILITY
// ============================================================================

const dreizeilenAiCapabilities: TemplateAiCapabilities<DreizeilenFullState, DreizeilenFullActions> =
  {
    supportedOperations: [
      'set-text',
      'set-color-scheme',
      'toggle-sunflower',
      'add-asset',
      'add-illustration',
      'update-element',
      'remove-element',
    ],

    colorSchemes: COLOR_SCHEMES.map((s) => ({ id: s.id, label: s.label })),

    assets: buildAssetCapability('dreizeilen'),

    illustrations: buildIllustrationCapability(),

    describeForAi: (state): CanvasAiSnapshot => ({
      template: 'dreizeilen',
      textFields: [
        { field: 'line1', label: 'Erste Zeile', value: state.line1 },
        { field: 'line2', label: 'Zweite Zeile', value: state.line2 },
        { field: 'line3', label: 'Dritte Zeile', value: state.line3 },
      ],
      currentColorScheme: state.colorSchemeId,
      elementsSummary: [],
    }),

    applyOverrides: {
      'set-text': (op, actions) => {
        switch (op.field) {
          case 'line1':
            actions.setLine1(op.value);
            return;
          case 'line2':
            actions.setLine2(op.value);
            return;
          case 'line3':
            actions.setLine3(op.value);
            return;
          default:
            throw new Error(`Dreizeilen-Vorlage hat kein Feld "${op.field}"`);
        }
      },
      'set-color-scheme': (op, actions) => {
        const known = COLOR_SCHEMES.some((s) => s.id === op.schemeId);
        if (!known) {
          throw new Error(`Unbekanntes Farbschema "${op.schemeId}"`);
        }
        actions.setColorSchemeId(op.schemeId);
      },
      'toggle-sunflower': (op, actions) => {
        actions.setSunflowerVisible(op.visible);
      },
    },
  };

const section = makeSectionDefiner<DreizeilenFullState, DreizeilenFullActions>();

export const dreizeilenFullConfig: FullCanvasConfig<DreizeilenFullState, DreizeilenFullActions> = {
  id: 'dreizeilen',

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
    defaultNewPageState: {
      line1: PLACEHOLDER_TEXT.line1,
      line2: PLACEHOLDER_TEXT.line2,
      line3: PLACEHOLDER_TEXT.line3,
    },
  },

  fonts: {
    primary: 'GrueneTypeNeue',
    fontSize: 75,
    requireFontLoad: true,
  },

  ai: dreizeilenAiCapabilities,

  tabs: [
    {
      id: 'image-background',
      icon: HiPhotograph,
      label: 'Hintergrund',
      ariaLabel: 'Hintergrundbild ändern',
    },
    { id: 'settings', icon: HiCog, label: 'Einstellungen', ariaLabel: 'Balken-Einstellungen' },
    {
      id: 'frame-settings',
      icon: PiFrameCornersFill,
      label: 'Rahmen',
      ariaLabel: 'Rahmen-Einstellungen',
    },
    { id: 'text', icon: PiTextAa, label: 'Text', ariaLabel: 'Texte hinzufügen' },
    { id: 'assets', icon: PiSquaresFourFill, label: 'Elemente', ariaLabel: 'Elemente hinzufügen' },
    toolsTab,
    uploadsTab,
    { id: 'ai', icon: HiSparkles, label: 'KI', ariaLabel: 'KI-Vorschläge' },
    chatTab,
  ],

  getVisibleTabs: () => {
    // 'ai' tab kept registered but hidden — Chat tab now drives canvas-AI suggestions.
    // 'settings' tab kept registered but hidden — opened via getAutoSwitchTab on balken
    // selection so the icon strip doesn't shift when a balken is clicked.
    return ['image-background', 'text', 'assets', 'tools', 'uploads', 'chat', 'share'];
  },

  getAutoSwitchTab: (selectedElement) => {
    if (selectedElement?.includes('balken')) return 'settings';
    if (selectedElement?.startsWith('frame-')) return 'frame-settings';
    return null;
  },

  sections: {
    settings: section({
      component: BalkenSettingsSection,
      propsFactory: (state, actions, context) => {
        const selectedId = context?.selectedElement ?? null;
        const selectedBalken = selectedId
          ? state.balkenInstances.find((b) => b.id === selectedId)
          : null;
        return {
          selectedBalken: selectedBalken ?? createBalkenInstance(state),
          onUpdateBalken: actions.updateBalken,
          onRemoveBalken: actions.removeBalken,
          onDuplicateBalken: actions.duplicateBalken,
          colorSchemes: COLOR_SCHEMES,
          isPrimary: (selectedId ?? 'dreizeilen-balken') === 'dreizeilen-balken',
        };
      },
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

    'image-background': section({
      component: ImageBackgroundSection,
      propsFactory: (state, actions) => ({
        currentImageSrc: state.currentImageSrc,
        onImageChange: (
          file: File | null,
          objectUrl?: string,
          attribution?: StockImageAttribution | null
        ) => {
          actions.setCurrentImageSrc(file, objectUrl, attribution);
        },
        scale: state.imageScale,
        onScaleChange: actions.setImageScale,
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

    assets: section({
      component: AssetsSection,
      propsFactory: (state, actions, context) => ({
        // Asset instance props
        onAddAsset: actions.addAsset,
        recommendedAssetIds: CANVAS_RECOMMENDED_ASSETS['dreizeilen'],

        // Auto-inject all feature props (icons, shapes, illustrations, balken)
        ...injectFeatureProps(state, actions, context),
      }),
    }),

    ai: createAiSectionRegistration('dreizeilen', dreizeilenAiCapabilities),

    ...createCommonSectionEntries('dreizeilen', dreizeilenAiCapabilities),

    share: createShareSection<DreizeilenFullState>('dreizeilen', (state) =>
      `${state.line1}\n${state.line2}\n${state.line3}`.trim()
    ),
  },

  elements: [
    // Background Image
    {
      id: 'background-image',
      type: 'image',
      x: 0,
      y: 0,
      order: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      srcKey: 'currentImageSrc',
      offsetKey: 'imageOffset',
      scaleKey: 'imageScale',
      draggable: true,
      transformable: true,
      coverFit: true,
      visible: (state: DreizeilenFullState) => state.hasBackgroundImage,
      opacity: (state: DreizeilenFullState) => state.backgroundImageOpacity ?? 1,
      opacityStateKey: 'backgroundImageOpacity',
    },

    // Sunflower
    {
      id: 'sunflower',
      type: 'image',
      x: (state: DreizeilenFullState, layout: GenericLayoutResult) => {
        const sunflower = layout.sunflower as
          | { x?: number; y?: number; width?: number; height?: number }
          | undefined;
        return state.sunflowerPos?.x ?? sunflower?.x ?? CANVAS_WIDTH - 150;
      },
      y: (state: DreizeilenFullState, layout: GenericLayoutResult) => {
        const sunflower = layout.sunflower as
          | { x?: number; y?: number; width?: number; height?: number }
          | undefined;
        return state.sunflowerPos?.y ?? sunflower?.y ?? CANVAS_HEIGHT - 150;
      },
      order: 1,
      width: (state: DreizeilenFullState, layout: GenericLayoutResult) => {
        const sunflower = layout.sunflower as
          | { x?: number; y?: number; width?: number; height?: number }
          | undefined;
        return state.sunflowerSize?.w ?? sunflower?.width ?? SUNFLOWER_CONFIG.defaultSize;
      },
      height: (state: DreizeilenFullState, layout: GenericLayoutResult) => {
        const sunflower = layout.sunflower as
          | { x?: number; y?: number; width?: number; height?: number }
          | undefined;
        return state.sunflowerSize?.h ?? sunflower?.height ?? SUNFLOWER_CONFIG.defaultSize;
      },
      src: SUNFLOWER_CONFIG.src,
      draggable: true,
      transformable: true,
      listening: true,
      visible: (state: DreizeilenFullState) => state.sunflowerVisible,
      opacity: (state: DreizeilenFullState) => state.sunflowerOpacity,
      opacityStateKey: 'sunflowerOpacity',
      positionStateKey: 'sunflowerPos',
      sizeStateKey: 'sunflowerSize',
    },

    // Note: Balken (parallelogram bars with text) are NOT included in elements
    // They require custom rendering logic and will be handled separately in DreizeilenCanvas
    // This is because each Balken is a complex group with:
    // - Gradient-filled parallelogram shape
    // - Text with specific positioning inside the bar
    // - Individual drag/transform handlers
    // - Color scheme-dependent gradients
  ],

  calculateLayout,

  createInitialState: (props: Record<string, unknown>) => ({
    // Text Content
    line1: (props.line1 as string | undefined) ?? '',
    line2: (props.line2 as string | undefined) ?? '',
    line3: (props.line3 as string | undefined) ?? '',

    // Text Formatting
    colorSchemeId: (props.colorSchemeId as string | undefined) ?? 'tanne-sand',
    fontSize: (props.fontSize as number | undefined) ?? 60,
    balkenWidthScale: (props.balkenWidthScale as number | undefined) ?? 1,
    barOffsets:
      (props.barOffsets as [number, number, number] | undefined) ??
      DREIZEILEN_CONFIG.defaults.balkenOffset,

    // Balken Position
    balkenOffset: (props.balkenOffset as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
    balkenOpacity: (props.balkenOpacity as number | undefined) ?? 1,
    balkenScale: (props.balkenScale as number | undefined) ?? 1,
    balkenRotation: (props.balkenRotation as number | undefined) ?? 0,

    // Asset Instances
    assetInstances: (props.assetInstances as AssetInstance[] | undefined) ?? [],

    // Sunflower (legacy state maintained for backward compatibility)
    sunflowerPos: (props.sunflowerPos as { x: number; y: number } | null | undefined) ?? null,
    sunflowerSize: (props.sunflowerSize as { w: number; h: number } | null | undefined) ?? null,
    sunflowerVisible: (props.sunflowerVisible as boolean | undefined) ?? true,
    sunflowerOpacity:
      (props.sunflowerOpacity as number | undefined) ?? SUNFLOWER_CONFIG.defaultOpacity,

    // Background Image
    currentImageSrc: props.currentImageSrc as string | undefined,
    backgroundImageFile: (props.backgroundImageFile as File | Blob | null | undefined) ?? null,
    imageOffset: (props.imageOffset as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
    imageScale: (props.imageScale as number | undefined) ?? 1,
    imageAttribution: (props.imageAttribution as StockImageAttribution | null | undefined) ?? null,
    hasBackgroundImage: !!props.currentImageSrc,
    bgImageDimensions:
      (props.bgImageDimensions as { width: number; height: number } | null | undefined) ?? null,
    backgroundImageOpacity: (props.backgroundImageOpacity as number | undefined) ?? 1,

    // Icons & Shapes
    selectedIcons: (props.selectedIcons as string[] | undefined) ?? [],
    iconStates:
      (props.iconStates as
        | Record<
            string,
            {
              x: number;
              y: number;
              scale: number;
              rotation: number;
              color?: string;
              opacity?: number;
            }
          >
        | undefined) ?? {},
    shapeInstances: (props.shapeInstances as ShapeInstance[] | undefined) ?? [],
    selectedShapeId: null,

    // Illustrations
    illustrationInstances:
      (props.illustrationInstances as IllustrationInstance[] | undefined) ?? [],
    selectedIllustrationId: null,

    // Additional Texts
    additionalTexts: (props.additionalTexts as AdditionalText[] | undefined) ?? [],

    // Balken Instances (computed from state)
    balkenInstances: (props.balkenInstances as BalkenInstance[] | undefined) ?? [
      createBalkenInstance({
        line1: (props.line1 as string | undefined) ?? '',
        line2: (props.line2 as string | undefined) ?? '',
        line3: (props.line3 as string | undefined) ?? '',
        colorSchemeId: (props.colorSchemeId as string | undefined) ?? 'tanne-sand',
        balkenWidthScale: (props.balkenWidthScale as number | undefined) ?? 1,
        balkenOffset: (props.balkenOffset as { x: number; y: number } | undefined) ?? {
          x: 0,
          y: 0,
        },
        balkenOpacity: (props.balkenOpacity as number | undefined) ?? 1,
      }),
    ],

    // Pill Badge & Circle Badge Instances
    pillBadgeInstances: (props.pillBadgeInstances as PillBadgeInstance[] | undefined) ?? [],
    circleBadgeInstances: (props.circleBadgeInstances as CircleBadgeInstance[] | undefined) ?? [],
    frameInstances: [],
    userImageInstances: [],

    // Layer Ordering
    layerOrder: (props.layerOrder as string[] | undefined) ?? [],

    // UI State
    isDesktop:
      (props.isDesktop as boolean | undefined) ??
      (typeof window !== 'undefined' && window.innerWidth >= 900),
  }),

  createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => {
    // Helper: Update balken instances when balken-related state changes
    // Preserves decorative balkens (added via addBalken) alongside the primary dreizeilen balken
    const updateBalkenInstances = (state: DreizeilenFullState): BalkenInstance[] => {
      const primary = createBalkenInstance(state);
      const decorative = state.balkenInstances.filter((b) => b.id !== 'dreizeilen-balken');
      return [primary, ...decorative];
    };

    // Use common action creators for shared functionality
    const assetActions = createAssetActions(
      getState,
      setState,
      saveToHistory,
      CANVAS_WIDTH,
      CANVAS_HEIGHT
    );

    const iconActions = createIconActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      { defaultColor: '#005538', defaultOpacity: 1 }
    );

    const shapeActions = createShapeActions(
      getState,
      setState,
      saveToHistory,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      '#005538'
    );

    const illustrationActions = createIllustrationActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      CANVAS_WIDTH,
      CANVAS_HEIGHT
    );

    const pillBadgeActions = createPillBadgeActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory
    );

    const circleBadgeActions = createCircleBadgeActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory
    );

    const genericBalkenActions = createBalkenActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory
    );

    const frameActions = createFrameActions(
      getState,
      setState,
      saveToHistory,
      DREIZEILEN_CONFIG.canvas.width,
      DREIZEILEN_CONFIG.canvas.height
    );

    return {
      // === Spread common actions ===
      ...assetActions,
      ...iconActions,
      ...shapeActions,
      ...illustrationActions,
      ...pillBadgeActions,
      ...circleBadgeActions,
      ...genericBalkenActions,
      ...frameActions,

      // === Text Actions ===
      setLine1: (text: string) => {
        setState((prev) => {
          const newState = { ...prev, line1: text };
          return { ...newState, balkenInstances: updateBalkenInstances(newState) };
        });
        callbacks.onLine1Change?.(text);
        debouncedSaveToHistory(getState());
      },

      setLine2: (text: string) => {
        setState((prev) => {
          const newState = { ...prev, line2: text };
          return { ...newState, balkenInstances: updateBalkenInstances(newState) };
        });
        callbacks.onLine2Change?.(text);
        debouncedSaveToHistory(getState());
      },

      setLine3: (text: string) => {
        setState((prev) => {
          const newState = { ...prev, line3: text };
          return { ...newState, balkenInstances: updateBalkenInstances(newState) };
        });
        callbacks.onLine3Change?.(text);
        debouncedSaveToHistory(getState());
      },

      setFontSize: (size: number) => {
        setState((prev) => ({ ...prev, fontSize: size }));
        callbacks.onFontSizeChange?.(size);
        debouncedSaveToHistory({ ...getState(), fontSize: size });
      },

      setColorSchemeId: (id: string) => {
        setState((prev) => {
          const newState = { ...prev, colorSchemeId: id };
          return { ...newState, balkenInstances: updateBalkenInstances(newState) };
        });
        callbacks.onColorSchemeChange?.(id);
        saveToHistory(getState());
      },

      // === Balken Actions ===
      setBalkenWidthScale: (scale: number) => {
        setState((prev) => {
          const newState = { ...prev, balkenWidthScale: scale };
          return { ...newState, balkenInstances: updateBalkenInstances(newState) };
        });
        debouncedSaveToHistory(getState());
      },

      setBarOffsets: (offsets: [number, number, number]) => {
        setState((prev) => {
          const newState = { ...prev, barOffsets: offsets };
          return { ...newState, balkenInstances: updateBalkenInstances(newState) };
        });
        debouncedSaveToHistory(getState());
      },

      setBalkenOffset: (offset: { x: number; y: number }) => {
        setState((prev) => {
          const newState = { ...prev, balkenOffset: offset };
          return { ...newState, balkenInstances: updateBalkenInstances(newState) };
        });
        debouncedSaveToHistory(getState());
      },

      setBalkenOpacity: (opacity: number) => {
        setState((prev) => {
          const newState = { ...prev, balkenOpacity: opacity };
          return { ...newState, balkenInstances: updateBalkenInstances(newState) };
        });
        debouncedSaveToHistory(getState());
      },

      setBalkenText: (id: string, index: number, text: string) => {
        if (id === 'dreizeilen-balken') {
          const field = index === 0 ? 'line1' : index === 1 ? 'line2' : 'line3';
          setState((prev) => {
            const newState = { ...prev, [field]: text };
            return { ...newState, balkenInstances: updateBalkenInstances(newState) };
          });
          if (index === 0) callbacks.onLine1Change?.(text);
          else if (index === 1) callbacks.onLine2Change?.(text);
          else if (index === 2) callbacks.onLine3Change?.(text);
          debouncedSaveToHistory(getState());
        } else {
          setState((prev) => ({
            ...prev,
            balkenInstances: prev.balkenInstances.map((b) =>
              b.id === id ? { ...b, texts: b.texts.map((t, i) => (i === index ? text : t)) } : b
            ),
          }));
          debouncedSaveToHistory(getState());
        }
      },

      updateBalken: (id: string, partial: Partial<BalkenInstance>) => {
        if (id === 'dreizeilen-balken') {
          setState((prev) => {
            const updates: Partial<DreizeilenFullState> = {};
            if (partial.offset !== undefined) updates.balkenOffset = partial.offset;
            if (partial.scale !== undefined) updates.balkenScale = partial.scale;
            if (partial.rotation !== undefined) updates.balkenRotation = partial.rotation;
            if (partial.opacity !== undefined) updates.balkenOpacity = partial.opacity;
            if (partial.widthScale !== undefined) updates.balkenWidthScale = partial.widthScale;
            if (partial.colorSchemeId !== undefined) updates.colorSchemeId = partial.colorSchemeId;
            if (partial.barOffsets !== undefined) updates.barOffsets = partial.barOffsets;
            const newState = { ...prev, ...updates };
            return { ...newState, balkenInstances: updateBalkenInstances(newState) };
          });
          if (partial.colorSchemeId !== undefined) {
            callbacks.onColorSchemeChange?.(partial.colorSchemeId);
          }
        } else {
          setState((prev) => ({
            ...prev,
            balkenInstances: prev.balkenInstances.map((b) =>
              b.id === id ? { ...b, ...partial } : b
            ),
          }));
        }
        debouncedSaveToHistory(getState());
      },

      // === Sunflower Actions ===
      setSunflowerVisible: (visible: boolean) => {
        setState((prev) => ({ ...prev, sunflowerVisible: visible }));
        saveToHistory({ ...getState(), sunflowerVisible: visible });
      },

      setSunflowerOpacity: (opacity: number) => {
        setState((prev) => ({ ...prev, sunflowerOpacity: opacity }));
      },

      handleSunflowerDragEnd: (x: number, y: number) => {
        setState((prev) => ({ ...prev, sunflowerPos: { x, y } }));
        saveToHistory({ ...getState(), sunflowerPos: { x, y } });
      },

      handleSunflowerTransformEnd: (width: number, height: number) => {
        setState((prev) => ({ ...prev, sunflowerSize: { w: width, h: height } }));
        saveToHistory({ ...getState(), sunflowerSize: { w: width, h: height } });
      },

      // === Background Image Actions ===
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
        callbacks.onImageChange?.(file);
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

      handleBackgroundImageTransformEnd: (width: number, height: number) => {
        setState((prev) => ({ ...prev, bgImageDimensions: { width, height } }));
        saveToHistory({ ...getState(), bgImageDimensions: { width, height } });
      },

      // === Additional Text Actions (Dreizeilen-specific with Arvo font) ===
      addHeader: () => {
        const id = `text-${Date.now()}`;
        const layout = calculateLayout(getState());
        const colorScheme = (layout._meta as Record<string, unknown>)?.colorScheme as
          | { fontColor?: string }
          | undefined;

        const newText = {
          id,
          text: ADDITIONAL_TEXT_DEFAULTS.header.defaultText,
          type: 'header' as const,
          x: CANVAS_WIDTH / 2,
          y: ADDITIONAL_TEXT_DEFAULTS.header.offsetY,
          width: ADDITIONAL_TEXT_DEFAULTS.header.width,
          fontSize: ADDITIONAL_TEXT_DEFAULTS.header.fontSize,
          fontFamily: 'GrueneTypeNeue, Arial, sans-serif',
          fontStyle: ADDITIONAL_TEXT_DEFAULTS.header.fontStyle,
          fill: colorScheme?.fontColor ?? '#FFFFFF',
          rotation: 0,
          scale: 1,
        };

        setState((prev) => ({
          ...prev,
          additionalTexts: [...prev.additionalTexts, newText],
        }));
        saveToHistory({
          ...getState(),
          additionalTexts: [...getState().additionalTexts, newText],
        });
      },

      addSubheader: () => {
        const id = `text-${Date.now()}`;
        const layout = calculateLayout(getState());
        const colorScheme = (layout._meta as Record<string, unknown>)?.colorScheme as
          | { fontColor?: string }
          | undefined;

        const newText = {
          id,
          text: ADDITIONAL_TEXT_DEFAULTS.subheader.defaultText,
          type: 'subheader' as const,
          x: CANVAS_WIDTH / 2,
          y: ADDITIONAL_TEXT_DEFAULTS.subheader.offsetY,
          width: ADDITIONAL_TEXT_DEFAULTS.subheader.width,
          fontSize: ADDITIONAL_TEXT_DEFAULTS.subheader.fontSize,
          fontFamily: 'GrueneTypeNeue, Arial, sans-serif',
          fontStyle: ADDITIONAL_TEXT_DEFAULTS.subheader.fontStyle,
          fill: colorScheme?.fontColor ?? '#FFFFFF',
          rotation: 0,
          scale: 1,
        };

        setState((prev) => ({
          ...prev,
          additionalTexts: [...prev.additionalTexts, newText],
        }));
        saveToHistory({
          ...getState(),
          additionalTexts: [...getState().additionalTexts, newText],
        });
      },

      addText: () => {
        const id = `text-${Date.now()}`;
        const layout = calculateLayout(getState());
        const colorScheme = (layout._meta as Record<string, unknown>)?.colorScheme as
          | { fontColor?: string }
          | undefined;

        const newText = {
          id,
          text: ADDITIONAL_TEXT_DEFAULTS.body.defaultText,
          type: 'body' as const,
          x: CANVAS_WIDTH / 2,
          y: ADDITIONAL_TEXT_DEFAULTS.body.offsetY,
          width: ADDITIONAL_TEXT_DEFAULTS.body.width,
          fontSize: ADDITIONAL_TEXT_DEFAULTS.body.fontSize,
          fontFamily: 'PT Sans, Arial, sans-serif',
          fontStyle: ADDITIONAL_TEXT_DEFAULTS.body.fontStyle,
          fill: colorScheme?.fontColor ?? '#FFFFFF',
          rotation: 0,
          scale: 1,
        };

        setState((prev) => ({
          ...prev,
          additionalTexts: [...prev.additionalTexts, newText],
        }));
        saveToHistory({
          ...getState(),
          additionalTexts: [...getState().additionalTexts, newText],
        });
      },

      updateAdditionalText: (textId: string, partial: Partial<AdditionalText>) => {
        setState((prev) => ({
          ...prev,
          additionalTexts: prev.additionalTexts.map((t) =>
            t.id === textId ? { ...t, ...partial } : t
          ),
        }));
        debouncedSaveToHistory(getState());
      },

      removeAdditionalText: (textId: string) => {
        setState((prev) => ({
          ...prev,
          additionalTexts: prev.additionalTexts.filter((t) => t.id !== textId),
        }));
        saveToHistory(getState());
      },

      // === Layer Actions ===
      moveLayerUp: (itemId: string) => {
        setState((prev) => {
          const currentIndex = prev.layerOrder.indexOf(itemId);
          if (currentIndex === -1 || currentIndex === prev.layerOrder.length - 1) {
            return prev;
          }
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
          if (currentIndex <= 0) {
            return prev;
          }
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
        setState((prev) => {
          const filtered = prev.layerOrder.filter((id) => id !== itemId);
          return { ...prev, layerOrder: [...filtered, itemId] };
        });
        saveToHistory(getState());
      },

      sendToBack: (itemId: string) => {
        setState((prev) => {
          const filtered = prev.layerOrder.filter((id) => id !== itemId);
          return { ...prev, layerOrder: [itemId, ...filtered] };
        });
        saveToHistory(getState());
      },

      // === Reset ===
      handleReset: () => {
        const initialState = dreizeilenFullConfig.createInitialState({});
        setState(initialState);
        callbacks.onReset?.(undefined);
        saveToHistory(initialState);
      },
    };
  },

  assets: {
    textColors: {},
  },
};
