/**
 * Freeform Full Canvas Configuration
 *
 * Blank canvas where users place arbitrary elements freely.
 * No pre-defined layout — all content is user-created via sidebar tools.
 *
 * Supports: image/color backgrounds, text, icons, shapes, illustrations,
 * balkens, badges, frames — all features the config system offers.
 */

import { carryInstanceState } from '@ggraphic/editor/configs/factory/carryInstanceState';
import { insertScaleFor, isSlideFormat, type CanvasFormat } from '@ggraphic/editor/formats/index';
import { zoomBackground } from '@ggraphic/editor/utils/coverFit';
import { COMPOSER_PLANE_IDS, photoStripBeside } from '@ggraphic/editor/utils/shapes';
import { straightenResetFor } from '@ggraphic/editor/utils/straighten';
import { CANVAS_COLORS } from '@gruenerator/contracts';
import { PiFrameCornersFill, PiSquaresFourFill, PiTextAa } from 'react-icons/pi';

import { buildAssetCapability } from '../ai/assetCapability';
import { describeCanvasElements } from '@ggraphic/editor/ai/describeCanvasElements';
import { buildIllustrationCapability } from '@ggraphic/editor/ai/illustrationCapability';
import { CANVAS_RECOMMENDED_ASSETS } from '../brand/grueneAssets';
import { withCardFollowingText } from '@ggraphic/editor/composer/cardFollowsText';
import { SHAREPIC_COLOR_HEX } from '../composer/composeSharepic';
import { type LiftedBlock } from '../composer/liftBlock';
import { AssetsSection } from '../sidebar';
import { CombinedTextSection } from '@ggraphic/editor/sidebar/sections/CombinedTextSection';
import { FrameSettingsSection } from '../sidebar/sections/FrameSettingsSection';

import { chatTab, createCommonSectionEntries, toolsTab, uploadsTab } from './commonSections';
import { createBaseActions } from './factory/actionFactories';
import { makeSectionDefiner } from '@ggraphic/editor/configs/factory/defineSection';
import { injectFeatureProps } from './featureInjector';
import { createShareSection } from './shareSection';

import type { SharepicAiCapabilities } from './aiCapabilities';
import type { BackgroundColorOption } from '@ggraphic/editor/sidebar/types';
import type { StockImageAttribution } from '@ggraphic/editor/common/imageSourceTypes';
import type {
  BaseCanvasState,
  ImageBackgroundState,
  ColorBackgroundState,
} from '@ggraphic/editor/configs/factory/baseTypes';
import type {
  FullCanvasConfig,
  LayoutResult,
  AdditionalText,
} from '@ggraphic/editor/configs/types';
import type { ShapeInstance } from '@ggraphic/editor/utils/shapes';
import type { CanvasAiSnapshot } from '@gruenerator/contracts';

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
  // Composer planes a colour background took off, with their layer index:
  // the photo look (strip panel, scrim) returns with the photo.
  stashedComposerPlanes: StashedPlane[];
  // Layer ordering
  layerOrder: string[];
  // Sprechernotizen der Folie (nur Präsentationen); Schlüssel ist F0 (PPTX-Export liest ihn).
  notes?: string;
}

interface StashedPlane {
  shape: ShapeInstance;
  index: number;
}

// ============================================================================
// ACTIONS TYPE — uses 'any' for flexibility with createBaseActions return type
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FreeformActions = Record<string, any>;

interface FreeformBackgroundActions {
  setBackgroundMode: (mode: 'color' | 'image') => void;
  setBackgroundColor: (color: string) => void;
  setImageScale: (scale: number) => void;
  setCurrentImageSrc: (
    file: File | null,
    objectUrl?: string,
    attribution?: StockImageAttribution | null
  ) => void;
}

// ============================================================================
// LAYOUT CALCULATOR (no-op for freeform — no computed positions)
// ============================================================================

const calculateLayout = (_state: FreeformState): LayoutResult => ({});

// ============================================================================
// AI CAPABILITY
// ============================================================================

const createFreeformAiCapabilities = (
  width: number,
  height: number
): SharepicAiCapabilities<FreeformState, FreeformActions> => ({
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
      canvasSize: { width, height },
      elementsSummary: describeCanvasElements(state),
    };
  },
  // Default applier handles `set-text` (additionalText id lookup or new-body),
  // `set-background-color` (actions.setBackgroundColor), `remove-element` and
  // `update-element` (by the collection the id lives in). No overrides needed.
});

// ============================================================================
// SECTIONS
// ============================================================================

// The composer's colours first (a creator sharepic is seeded with one of
// them, so it has to show as selected), then the classic ones.
const BACKGROUND_COLORS: BackgroundColorOption[] = [
  { id: 'tanne', label: 'Tanne', color: SHAREPIC_COLOR_HEX.tanne },
  { id: 'dunkeltanne', label: 'Dunkeltanne', color: SHAREPIC_COLOR_HEX.dunkeltanne },
  { id: 'grasgruen', label: 'Grasgrün', color: SHAREPIC_COLOR_HEX.grasgruen },
  { id: 'mint', label: 'Mint', color: SHAREPIC_COLOR_HEX.mint },
  { id: 'hellgrau', label: 'Hellgrau', color: SHAREPIC_COLOR_HEX.hellgrau },
  { id: 'creme', label: 'Creme', color: SHAREPIC_COLOR_HEX.creme },
  { id: 'aubergine', label: 'Aubergine', color: SHAREPIC_COLOR_HEX.aubergine },
  // Themed grounds (Frauen, Pride, Europa); `pride` is the middle of its gradient.
  { id: 'lila', label: 'Lila', color: SHAREPIC_COLOR_HEX.lila },
  { id: 'flieder', label: 'Flieder', color: SHAREPIC_COLOR_HEX.flieder },
  { id: 'violett', label: 'Violett', color: SHAREPIC_COLOR_HEX.violett },
  { id: 'pride', label: 'Pride', color: SHAREPIC_COLOR_HEX.pride },
  { id: 'europablau', label: 'Europablau', color: SHAREPIC_COLOR_HEX.europablau },
  { id: 'himmelblau', label: 'Himmelblau', color: SHAREPIC_COLOR_HEX.himmelblau },
  { id: 'klee', label: 'Klee', color: CANVAS_COLORS.KLEE },
  { id: 'sonne', label: 'Sonne', color: CANVAS_COLORS.SONNE },
  { id: 'himmel', label: 'Himmel', color: CANVAS_COLORS.HIMMEL },
  { id: 'sand', label: 'Sand', color: CANVAS_COLORS.SAND },
  { id: 'weiss', label: 'Weiß', color: SHAREPIC_COLOR_HEX.weiss },
  { id: 'schwarz', label: 'Schwarz', color: CANVAS_COLORS.BLACK },
];

const section = makeSectionDefiner<FreeformState, FreeformActions>();

/**
 * The sharepic composer's planes belong to the composed look. A colour
 * background takes them all off: the gradient and the strip panel would hide
 * the chosen colour, the scrim and the AT tint would darken or tint a photo
 * that is no longer shown. They are stashed, not deleted — bringing a photo
 * back restores the look it was composed with. A photo background drops only
 * the opaque gradient `sc-bg`, which would cover it; panel, tint and scrim
 * frame the photo and keep the text readable on it.
 */
function composerPlanesFor(
  s: FreeformState,
  mode: 'color' | 'image'
): Pick<FreeformState, 'shapeInstances' | 'layerOrder' | 'stashedComposerPlanes'> {
  let { shapeInstances, layerOrder } = s;
  let stash = s.stashedComposerPlanes;
  if (mode === 'image' && stash.length > 0) {
    shapeInstances = [...shapeInstances];
    layerOrder = [...layerOrder];
    // Indices are from the order the planes left; skipped ones shift the rest.
    let skipped = 0;
    for (const { shape, index } of stash) {
      if (shape.id === 'sc-bg' || layerOrder.includes(shape.id)) {
        skipped += 1;
        continue;
      }
      shapeInstances.push(shape);
      layerOrder.splice(Math.min(index - skipped, layerOrder.length), 0, shape.id);
    }
    stash = [];
  }
  const drop = mode === 'color' ? COMPOSER_PLANE_IDS : ['sc-bg'];
  if (!shapeInstances.some((shape) => drop.includes(shape.id))) {
    return { shapeInstances, layerOrder, stashedComposerPlanes: stash };
  }
  if (mode === 'color') {
    stash = [
      ...stash,
      ...shapeInstances
        .filter((shape) => drop.includes(shape.id))
        .map((shape) => ({ shape, index: Math.max(0, layerOrder.indexOf(shape.id)) })),
    ].sort((a, b) => a.index - b.index);
  }
  return {
    shapeInstances: shapeInstances.filter((shape) => !drop.includes(shape.id)),
    layerOrder: layerOrder.filter((id) => !drop.includes(id)),
    stashedComposerPlanes: stash,
  };
}

// ============================================================================
// FULL CONFIG
// ============================================================================

export const SHEET_MAX_PAGES = 10;
export const SLIDE_MAX_PAGES = 60;

// Freeform hat kein Layout, das an einem Seitenverhältnis hängt: es nimmt das
// Format der Leinwand (4:5 oder 3:4) als eigenes Blatt, statt es zu strecken.
export const createFreeformFullConfig = (
  format: CanvasFormat,
  {
    /** Colour of newly added text; white suits the default Tanne sheet. */
    fontColor = '#FFFFFF',
    /** Series colours of a new chart; absent = the active brand's, read when a chart is made. */
    chartColors,
  }: { fontColor?: string; chartColors?: readonly string[] } = {}
): FullCanvasConfig<FreeformState, FreeformActions> =>
  withFreeformAi(
    createFreeformAiCapabilities(format.width, format.height),
    format.width,
    format.height,
    fontColor,
    chartColors,
    isSlideFormat(format) ? SLIDE_MAX_PAGES : SHEET_MAX_PAGES,
    insertScaleFor(format)
  );

const withFreeformAi = (
  ai: SharepicAiCapabilities<FreeformState, FreeformActions>,
  width: number,
  height: number,
  fontColor: string,
  chartColors: readonly string[] | undefined,
  maxPages: number,
  insertScale: number
): FullCanvasConfig<FreeformState, FreeformActions> => ({
  id: 'freeform',

  ...(chartColors ? { chartColors } : {}),

  canvas: { width, height },

  features: {
    icons: true,
    shapes: true,
    illustrations: true,
  },

  multiPage: {
    enabled: true,
    maxPages,
    heterogeneous: true,
  },

  fonts: {
    primary: 'GrueneTypeNeue',
    fontSize: 60,
    requireFontLoad: true,
  },

  ai,

  tabs: [
    {
      id: 'text',
      icon: PiTextAa,
      label: 'Text',
      ariaLabel: 'Text hinzufügen',
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
    chatTab,
  ],

  getVisibleTabs: () => ['text', 'elements', 'tools', 'uploads', 'chat'],

  getAutoSwitchTab: (selectedElement) => {
    if (selectedElement?.startsWith('balken-')) return 'settings';
    if (selectedElement?.startsWith('chart-')) return 'chart-settings';
    if (selectedElement?.startsWith('frame-')) return 'frame-settings';
    return null;
  },

  // Freeform shows EITHER the photo or the colour plane, so each pick also sets
  // the mode. A colour pick keeps the photo in state, hidden.
  background: (state, anyActions) => {
    // FreeformActions ist Record<string, any>; hier die Signaturen aus createActions unten.
    const actions = anyActions as FreeformBackgroundActions;
    const isImage = state.backgroundMode === 'image';
    return {
      colors: BACKGROUND_COLORS,
      currentColor: isImage ? '' : state.backgroundColor,
      onColorChange: actions.setBackgroundColor,
      colorReplacesImage: true,
      currentImageSrc: isImage && state.hasBackgroundImage ? state.currentImageSrc : undefined,
      imageAttribution: isImage ? state.imageAttribution : null,
      onImageChange: actions.setCurrentImageSrc,
      // Brings it back with its offset, zoom and credit.
      onRestoreImage:
        !isImage && state.hasBackgroundImage ? () => actions.setBackgroundMode('image') : undefined,
      // Zoom only means something while the photo is shown.
      scale: isImage ? state.imageScale : undefined,
      onScaleChange: isImage ? actions.setImageScale : undefined,
    };
  },

  sections: {
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
        onAddStickerAsset: actions.addStickerAsset,
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

    ...createCommonSectionEntries('freeform', ai),

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
      width,
      height,
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
      width,
      height,
      srcKey: 'currentImageSrc',
      offsetKey: 'imageOffset',
      scaleKey: 'imageScale',
      draggable: true,
      transformable: true,
      coverFit: true,
      frame: (state: FreeformState) => photoStripBeside(state.shapeInstances, { width, height }),
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
    stashedComposerPlanes: (props.stashedComposerPlanes as StashedPlane[] | undefined) ?? [],

    // Alles selbst Hinzugefuegte. Stand hier hart auf `[]`, und weil
    // Karten-Render und Chat-Bearbeitung durch diese Funktion neu setzen,
    // war die ganze freie Flaeche danach leer.
    ...carryInstanceState(props),

    // Layer ordering
    layerOrder: (props.layerOrder as string[] | undefined) ?? [],

    // UI state
    isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
  }),

  createActions: (getState, setState, saveToHistory, debouncedSaveToHistory) => {
    const baseActions = createBaseActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      width,
      height,
      fontColor,
      chartColors,
      insertScale
    );

    return {
      ...baseActions,

      updateAdditionalText: (id: string, partial: Partial<AdditionalText>) => {
        const change = (s: FreeformState): FreeformState => {
          const next = withCardFollowingText(s, id, partial);
          return {
            ...next,
            additionalTexts: next.additionalTexts.map((t) =>
              t.id === id ? { ...t, ...partial } : t
            ),
          };
        };
        setState(change);
        debouncedSaveToHistory(change(getState()));
      },

      /** Adds a finished text element (the poster's re-added impressum) as one history entry. */
      addAdditionalTextElement: (text: AdditionalText) => {
        const change = (s: FreeformState): FreeformState => ({
          ...s,
          additionalTexts: [...s.additionalTexts, text],
          layerOrder: s.layerOrder.includes(text.id) ? s.layerOrder : [...s.layerOrder, text.id],
        });
        setState(change);
        saveToHistory(change(getState()));
      },

      /**
       * Adds a composed block (`liftBlock`) on top of the page as one history
       * entry: every element in its collection, icons with their states.
       */
      insertBlock: (block: LiftedBlock) => {
        const change = (s: FreeformState): FreeformState => ({
          ...s,
          additionalTexts: [...s.additionalTexts, ...block.additionalTexts],
          shapeInstances: [...s.shapeInstances, ...block.shapeInstances],
          assetInstances: [...s.assetInstances, ...block.assetInstances],
          chartInstances: [...s.chartInstances, ...block.chartInstances],
          userImageInstances: [...s.userImageInstances, ...block.userImageInstances],
          pillBadgeInstances: [...s.pillBadgeInstances, ...block.pillBadgeInstances],
          circleBadgeInstances: [...s.circleBadgeInstances, ...block.circleBadgeInstances],
          selectedIcons: [...s.selectedIcons, ...block.selectedIcons],
          iconStates: { ...s.iconStates, ...block.iconStates },
          layerOrder: [...s.layerOrder, ...block.layerOrder],
        });
        setState(change);
        saveToHistory(change(getState()));
      },

      // === Background Actions ===
      // Each is one user intent: it sets the mode with its content and records
      // ONE history entry. `getState` is the render-time state, so two actions
      // in one handler would each snapshot it without the other's change.
      setBackgroundMode: (mode: 'color' | 'image') => {
        const change = (s: FreeformState): FreeformState => ({
          ...s,
          backgroundMode: mode,
          ...composerPlanesFor(s, mode),
        });
        setState(change);
        saveToHistory(change(getState()));
      },

      // Also the AI's `set-background-color`: a colour asked for is a colour shown.
      setBackgroundColor: (color: string) => {
        const change = (s: FreeformState): FreeformState => ({
          ...s,
          backgroundColor: color,
          backgroundMode: 'color',
          ...composerPlanesFor(s, 'color'),
        });
        const before = getState();
        const after = change(before);
        setState(change);
        // Only a plain colour-to-colour swap may coalesce with its neighbours.
        if (before.backgroundMode === 'color' && after.shapeInstances === before.shapeInstances) {
          debouncedSaveToHistory(after);
        } else {
          saveToHistory(after);
        }
      },

      setCurrentImageSrc: (
        file: File | null,
        objectUrl?: string,
        attribution?: StockImageAttribution | null
      ) => {
        const src = file ? objectUrl : undefined;
        // Without a photo the image element is not drawn: image mode would be blank.
        const mode = src ? 'image' : 'color';
        const change = (s: FreeformState): FreeformState => ({
          ...s,
          currentImageSrc: src,
          backgroundImageFile: file,
          imageAttribution: attribution ?? null,
          hasBackgroundImage: !!src,
          backgroundMode: mode,
          ...composerPlanesFor(s, mode),
          ...straightenResetFor(s),
        });
        setState(change);
        saveToHistory(change(getState()));
      },

      setImageScale: (scale: number) => {
        const state = getState();
        const zoom = zoomBackground(
          state,
          scale,
          { width, height },
          false,
          photoStripBeside(state.shapeInstances, { width, height })
        );
        setState((prev) => ({ ...prev, ...zoom }));
        debouncedSaveToHistory({ ...getState(), ...zoom });
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
});
