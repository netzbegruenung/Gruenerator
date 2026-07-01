/**
 * Factory: createImageTwoTextCanvas
 *
 * Creates a complete canvas config for templates with:
 * - Image background with scale/offset controls
 * - Two text fields (primary + secondary)
 * - Standard features (icons, shapes, illustrations)
 *
 * Used by: Zitat, Simple
 */

import { HiPhotograph } from 'react-icons/hi';
import { PiFrameCornersFill, PiSquaresFourFill, PiTextAa } from 'react-icons/pi';

import {
  AssetsSection,
  CombinedTextSection,
  FrameSettingsSection,
  ImageBackgroundSection,
} from '../../sidebar/sections';
import { chatTab, createCommonSectionEntries, toolsTab, uploadsTab } from '../commonSections';
import { injectFeatureProps } from '../featureInjector';
import { getPlaceholder } from '../placeholders';
import { createShareSection } from '../shareSection';

import { createBaseActions } from './actionFactories';
import { makeSectionDefiner } from './defineSection';

import type { CanvasFeatures, CanvasDimensions, IconState } from './baseTypes';
import type { StockImageAttribution } from '../../common/imageSourceTypes';
import type { BalkenInstance, BalkenMode } from '../../utils/balkenUtils';
import type { AssetInstance } from '../../utils/canvasAssets';
import type { CircleBadgeInstance } from '../../utils/circleBadgeUtils';
import type { FrameClipType, FrameInstance } from '../../utils/frameUtils';
import type { IllustrationInstance } from '../../utils/illustrations/types';
import type { PillBadgeInstance } from '../../utils/pillBadgeUtils';
import type { ShapeInstance, ShapeType } from '../../utils/shapes';
import type { UserImageInstance } from '../../utils/userImageUtils';
import type { FullCanvasConfig, LayoutResult, CanvasElementConfig, AdditionalText } from '../types';

// ============================================================================
// STATE TYPE
// ============================================================================

/**
 * Fixed-shape portion of the factory state. The dynamic per-template text
 * fields (primary/secondary) live in the `Record<TFields, string>` half
 * of the public `ImageTwoTextState<TFields>` type below.
 *
 * The `[key: string]: unknown` index signature is load-bearing: the
 * runtime element renderer accesses `state[opacityStateKey]` etc. with
 * dynamic string keys and requires the index signature. Specialized
 * `ImageTwoTextState<'quote' | 'name'>` narrows access for the known
 * fields (`state.quote: string`) while leaving the index signature
 * untouched for everything else.
 */
export interface ImageTwoTextStateBase {
  [key: string]: unknown;

  // Image background
  currentImageSrc: string;
  backgroundImageFile?: File | Blob | null;
  imageOffset: { x: number; y: number };
  imageScale: number;
  isBackgroundLocked: boolean;
  backgroundImageOpacity?: number;
  imageAttribution?: StockImageAttribution | null;

  // Text styling
  customPrimaryFontSize: number | null;
  customSecondaryFontSize: number | null;
  primaryOpacity?: number;
  secondaryOpacity?: number;
  primaryColor?: string;
  secondaryColor?: string;

  // Base state
  assetInstances: AssetInstance[];
  isDesktop: boolean;
  selectedIcons: string[];
  iconStates: Record<string, IconState>;
  shapeInstances: ShapeInstance[];
  illustrationInstances: IllustrationInstance[];
  additionalTexts: AdditionalText[];
  pillBadgeInstances: PillBadgeInstance[];
  circleBadgeInstances: CircleBadgeInstance[];
  balkenInstances: BalkenInstance[];
  frameInstances: FrameInstance[];
  userImageInstances: UserImageInstance[];
}

/**
 * Factory state parameterized by the template's text-field key union.
 * Specialize at the template site (e.g. `ImageTwoTextState<'quote' | 'name'>`)
 * to type-check `state.quote` as `string` directly — no `as string` casts
 * needed at read sites.
 *
 * Default `TFields = never` makes `Record<never, string> = {}`, so the
 * non-specialized type stays equivalent to the legacy index-signature-only
 * shape for backward compatibility.
 */
export type ImageTwoTextState<TFields extends string = never> = ImageTwoTextStateBase &
  Record<TFields, string>;

// ============================================================================
// ACTIONS TYPE
// ============================================================================

export interface ImageTwoTextActions {
  // Text setters (dynamic - set at config time)
  setPrimary: (val: string) => void;
  setSecondary: (val: string) => void;
  handlePrimaryFontSizeChange: (size: number) => void;
  handleSecondaryFontSizeChange: (size: number) => void;

  // Image background
  setCurrentImageSrc: (file: File | null, objectUrl?: string) => void;
  setImageScale: (scale: number) => void;
  toggleBackgroundLock: () => void;
  setImageAttribution?: (attribution: StockImageAttribution | null) => void;

  // Base actions
  addAsset: (assetId: string) => void;
  updateAsset: (id: string, partial: Partial<AssetInstance>) => void;
  removeAsset: (id: string) => void;
  toggleIcon: (id: string, selected: boolean) => void;
  updateIcon: (id: string, partial: Partial<IconState>) => void;
  addShape: (type: ShapeType) => void;
  updateShape: (id: string, partial: Partial<ShapeInstance>) => void;
  removeShape: (id: string) => void;
  addIllustration: (id: string) => void;
  updateIllustration: (id: string, partial: Partial<IllustrationInstance>) => void;
  removeIllustration: (id: string) => void;
  addHeader: () => void;
  addText: () => void;
  updateAdditionalText: (id: string, partial: Partial<AdditionalText>) => void;
  removeAdditionalText: (id: string) => void;
  addPillBadge: (preset?: string) => void;
  updatePillBadge: (id: string, partial: Partial<PillBadgeInstance>) => void;
  removePillBadge: (id: string) => void;
  addCircleBadge: (preset?: string) => void;
  updateCircleBadge: (id: string, partial: Partial<CircleBadgeInstance>) => void;
  removeCircleBadge: (id: string) => void;
  addBalken: (mode: BalkenMode) => void;
  updateBalken: (id: string, partial: Partial<BalkenInstance>) => void;
  removeBalken: (id: string) => void;
  addFrame: (clipType: FrameClipType) => void;
  updateFrame: (id: string, partial: Partial<FrameInstance>) => void;
  removeFrame: (id: string) => void;
  setFrameImage: (id: string, file: File, objectUrl: string) => void;
}

// ============================================================================
// FACTORY OPTIONS
// ============================================================================

export interface ImageTwoTextOptions<
  TPrimary extends string = string,
  TSecondary extends string = string,
> {
  /** Unique config identifier */
  id: string;

  /** Canvas dimensions */
  canvas: CanvasDimensions;

  /** Primary text field configuration */
  primaryField: {
    key: TPrimary;
    label: string;
  };

  /** Secondary text field configuration */
  secondaryField: {
    key: TSecondary;
    label: string;
  };

  /** Layout calculator */
  calculateLayout: (state: ImageTwoTextState<TPrimary | TSecondary>) => LayoutResult;

  /** Optional: Custom elements to add to the canvas */
  elements?: CanvasElementConfig<ImageTwoTextState<TPrimary | TSecondary>>[];

  /** Optional: Features to enable */
  features?: CanvasFeatures;

  /** Optional: Max pages for multi-page mode */
  maxPages?: number;

  /** Optional: Function to get text for sharing */
  getCanvasText?: (state: ImageTwoTextState<TPrimary | TSecondary>) => string;

  /** Optional: Gradient overlay opacity (default: none) */
  gradientOpacity?: number;
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createImageTwoTextCanvas<
  const TPrimary extends string,
  const TSecondary extends string,
>(
  options: ImageTwoTextOptions<TPrimary, TSecondary>
): FullCanvasConfig<ImageTwoTextState<TPrimary | TSecondary>, ImageTwoTextActions> {
  type State = ImageTwoTextState<TPrimary | TSecondary>;
  const {
    id,
    canvas,
    primaryField,
    secondaryField,
    calculateLayout,
    elements = [],
    features = { icons: true, shapes: true, illustrations: true },
    maxPages = 10,
    getCanvasText,
    gradientOpacity,
  } = options;

  // Build base elements
  const baseElements: CanvasElementConfig<State>[] = [
    // Background image
    {
      id: 'background-image',
      type: 'image',
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      srcKey: 'currentImageSrc',
      offsetKey: 'imageOffset',
      scaleKey: 'imageScale',
      draggable: true,
      lockedKey: 'isBackgroundLocked',
      opacityStateKey: 'backgroundImageOpacity',
      coverFit: true,
    },
  ];

  // Add gradient overlay if specified. The fill bakes the opacity into rgba()
  // because RectElementConfig doesn't carry an opacityStateKey field.
  if (gradientOpacity !== undefined) {
    baseElements.push({
      id: 'gradient-overlay',
      type: 'rect',
      order: 1,
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      fill: `rgba(0, 0, 0, ${gradientOpacity})`,
      listening: false,
    });
  }

  // Default getCanvasText if not provided
  const defaultGetCanvasText = (state: State) => {
    const primary = state[primaryField.key] || '';
    const secondary = state[secondaryField.key] || '';
    return [primary, secondary].filter(Boolean).join('\n');
  };

  const section = makeSectionDefiner<State, ImageTwoTextActions>();

  return {
    id,
    canvas,
    features,

    multiPage: {
      enabled: true,
      maxPages,
      heterogeneous: true,
      // Cast: computed property keys widen to `string` in object literals.
      // We know `primaryField.key` is `TPrimary` (and similarly for secondary),
      // so the runtime shape is exactly `Record<TPrimary | TSecondary, string>`.
      defaultNewPageState: {
        [primaryField.key]: getPlaceholder(primaryField.key),
        [secondaryField.key]: getPlaceholder(secondaryField.key),
      } as Partial<State>,
    },

    tabs: [
      { id: 'image', icon: HiPhotograph, label: 'Bild', ariaLabel: 'Bild anpassen' },
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
        id: 'frame-settings',
        icon: PiFrameCornersFill,
        label: 'Rahmen',
        ariaLabel: 'Rahmen-Einstellungen',
      },
      toolsTab,
      uploadsTab,
      chatTab,
    ],

    getVisibleTabs: () => ['image', 'text', 'assets', 'tools', 'uploads', 'chat', 'share'],

    getAutoSwitchTab: (selectedElement) =>
      selectedElement?.startsWith('frame-') ? 'frame-settings' : null,

    sections: {
      image: section({
        component: ImageBackgroundSection,
        propsFactory: (state, actions) => ({
          currentImageSrc: state.currentImageSrc,
          onImageChange: (
            file: File | null,
            objectUrl?: string,
            attribution?: StockImageAttribution | null
          ) => {
            actions.setCurrentImageSrc(file, objectUrl);
            if (attribution !== undefined) actions.setImageAttribution?.(attribution);
          },
          scale: state.imageScale,
          onScaleChange: actions.setImageScale,
          isLocked: state.isBackgroundLocked,
          onToggleLock: actions.toggleBackgroundLock,
        }),
      }),
      text: section({
        component: CombinedTextSection,
        propsFactory: (state, actions) => ({
          additionalTexts: state.additionalTexts,
          onAddHeader: actions.addHeader,
          onAddText: actions.addText,
          onUpdateText: actions.updateAdditionalText,
          onRemoveText: actions.removeAdditionalText,
        }),
      }),
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
      ...createCommonSectionEntries(id),
      share: createShareSection<State, ImageTwoTextActions>(
        id,
        getCanvasText || defaultGetCanvasText
      ),
    },

    elements: [...baseElements, ...elements],

    calculateLayout,

    // Cast: computed property keys ([primaryField.key], [secondaryField.key])
    // widen to `string` in literals. The runtime shape is correct — those keys
    // ARE `TPrimary` and `TSecondary` — but TS's literal-type widening loses
    // that proof.
    createInitialState: (props: Record<string, unknown>): State =>
      ({
        // Text fields
        [primaryField.key]: (props[primaryField.key] as string) || '',
        [secondaryField.key]: (props[secondaryField.key] as string) || '',
        customPrimaryFontSize: null,
        customSecondaryFontSize: null,

        // Image background
        currentImageSrc: (props.currentImageSrc as string) || (props.imageSrc as string) || '',
        imageOffset: (props.imageOffset as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
        imageScale: (props.imageScale as number | undefined) ?? 1,
        isBackgroundLocked: false,
        backgroundImageOpacity: (props.backgroundImageOpacity as number | undefined) ?? 1,
        imageAttribution:
          (props.imageAttribution as StockImageAttribution | null | undefined) ?? null,

        // Base state
        assetInstances: [],
        isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
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
      }) as State,

    createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => {
      const baseActions = createBaseActions(
        getState,
        setState,
        saveToHistory,
        debouncedSaveToHistory,
        canvas.width,
        canvas.height
      );

      // Callback keys for external sync
      const primaryCallbackKey = `on${primaryField.key.charAt(0).toUpperCase() + primaryField.key.slice(1)}Change`;
      const secondaryCallbackKey = `on${secondaryField.key.charAt(0).toUpperCase() + secondaryField.key.slice(1)}Change`;

      return {
        ...baseActions,

        // Primary text field
        setPrimary: (val: string) => {
          setState({ [primaryField.key]: val } as Partial<State>);
          callbacks[primaryCallbackKey]?.(val);
          debouncedSaveToHistory(getState());
        },
        handlePrimaryFontSizeChange: (size: number) => {
          setState({ customPrimaryFontSize: size } as Partial<State>);
          debouncedSaveToHistory(getState());
        },

        // Secondary text field
        setSecondary: (val: string) => {
          setState({ [secondaryField.key]: val } as Partial<State>);
          callbacks[secondaryCallbackKey]?.(val);
          debouncedSaveToHistory(getState());
        },
        handleSecondaryFontSizeChange: (size: number) => {
          setState({ customSecondaryFontSize: size } as Partial<State>);
          debouncedSaveToHistory(getState());
        },

        // Image background
        setCurrentImageSrc: (file: File | null, objectUrl?: string) => {
          setState({
            currentImageSrc: objectUrl || '',
            backgroundImageFile: file,
          } as Partial<State>);
          saveToHistory(getState());
        },
        setImageScale: (scale: number) => {
          setState({ imageScale: scale } as Partial<State>);
        },
        toggleBackgroundLock: () => {
          setState((prev) => ({ ...prev, isBackgroundLocked: !prev.isBackgroundLocked }));
        },
        setImageAttribution: (attribution: StockImageAttribution | null) => {
          setState({ imageAttribution: attribution } as Partial<State>);
        },
      };
    },
  };
}
