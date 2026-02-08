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
import { PiSquaresFourFill } from 'react-icons/pi';

import { ImageBackgroundSection, AssetsSection } from '../../sidebar/sections';
import {
  alternativesTab,
  createAlternativesSection,
  isAlternativesEmpty,
} from '../alternativesSection';
import { injectFeatureProps } from '../featureInjector';
import { getPlaceholder } from '../placeholders';
import { shareTab, createShareSection } from '../shareSection';

import { createBaseActions } from './commonActions';

import type { CanvasFeatures, CanvasDimensions, IconState, AlternativeItem } from './baseTypes';
import type { StockImageAttribution } from '../../../services/imageSourceService';
import type { BalkenInstance, BalkenMode } from '../../utils/balkenUtils';
import type { AssetInstance } from '../../utils/canvasAssets';
import type { CircleBadgeInstance } from '../../utils/circleBadgeUtils';
import type { IllustrationInstance } from '../../utils/illustrations/types';
import type { PillBadgeInstance } from '../../utils/pillBadgeUtils';
import type { ShapeInstance, ShapeType } from '../../utils/shapes';
import type { FullCanvasConfig, LayoutResult, CanvasElementConfig, AdditionalText } from '../types';

// ============================================================================
// STATE TYPE
// ============================================================================

export interface ImageTwoTextState {
  // Text fields (dynamic keys set at config time)
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
  alternatives: AlternativeItem[];
  selectedIcons: string[];
  iconStates: Record<string, IconState>;
  shapeInstances: ShapeInstance[];
  illustrationInstances: IllustrationInstance[];
  additionalTexts: AdditionalText[];
  pillBadgeInstances: PillBadgeInstance[];
  circleBadgeInstances: CircleBadgeInstance[];
  balkenInstances: BalkenInstance[];
}

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
  handleSelectAlternative: (alt: AlternativeItem) => void;
}

// ============================================================================
// FACTORY OPTIONS
// ============================================================================

export interface ImageTwoTextOptions {
  /** Unique config identifier */
  id: string;

  /** Canvas dimensions */
  canvas: CanvasDimensions;

  /** Primary text field configuration */
  primaryField: {
    key: string;
    label: string;
  };

  /** Secondary text field configuration */
  secondaryField: {
    key: string;
    label: string;
  };

  /** Layout calculator */
  calculateLayout: (state: ImageTwoTextState) => LayoutResult;

  /** Optional: Custom elements to add to the canvas */
  elements?: CanvasElementConfig<ImageTwoTextState>[];

  /** Optional: Features to enable */
  features?: CanvasFeatures;

  /** Optional: Max pages for multi-page mode */
  maxPages?: number;

  /** Optional: Function to get text for sharing */
  getCanvasText?: (state: ImageTwoTextState) => string;

  /** Optional: Gradient overlay opacity (default: none) */
  gradientOpacity?: number;

  /** Optional: Custom gradient opacity state key */
  gradientOpacityStateKey?: string;

  /**
   * Optional: Alternatives type
   * - 'string': Single string alternatives (default, for Zitat/quote templates)
   * - 'two-text': Two-text alternatives with headline/subtext (for Simple template)
   */
  alternativesType?: 'string' | 'two-text';
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createImageTwoTextCanvas(
  options: ImageTwoTextOptions
): FullCanvasConfig<ImageTwoTextState, ImageTwoTextActions> {
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
    gradientOpacityStateKey,
    alternativesType = 'string',
  } = options;

  // Build base elements
  const baseElements: CanvasElementConfig<ImageTwoTextState>[] = [
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
    },
  ];

  // Add gradient overlay if specified
  if (gradientOpacity !== undefined || gradientOpacityStateKey) {
    baseElements.push({
      id: 'gradient-overlay',
      type: 'rect',
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      fill: '#000000',
      listening: false,
    });
  }

  // Default getCanvasText if not provided
  const defaultGetCanvasText = (state: ImageTwoTextState) => {
    const primary = (state[primaryField.key] as string) || '';
    const secondary = (state[secondaryField.key] as string) || '';
    return [primary, secondary].filter(Boolean).join('\n');
  };

  return {
    id,
    canvas,
    features,

    multiPage: {
      enabled: true,
      maxPages,
      heterogeneous: true,
      defaultNewPageState: {
        [primaryField.key]: getPlaceholder(primaryField.key),
        [secondaryField.key]: getPlaceholder(secondaryField.key),
      },
    },

    tabs: [
      { id: 'image', icon: HiPhotograph, label: 'Bild', ariaLabel: 'Bild anpassen' },
      {
        id: 'assets',
        icon: PiSquaresFourFill,
        label: 'Elemente',
        ariaLabel: 'Dekorative Elemente',
      },
      alternativesTab,
      shareTab,
    ],

    getVisibleTabs: () => ['image', 'assets', 'alternatives', 'share'],

    getDisabledTabs: (state) =>
      isAlternativesEmpty(state, (s) => s.alternatives) ? ['alternatives'] : [],

    sections: {
      image: {
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
      alternatives:
        alternativesType === 'two-text'
          ? createAlternativesSection<ImageTwoTextState, ImageTwoTextActions>({
              type: 'two-text',
              getAlternatives: (state) =>
                state.alternatives as Array<{ headline: string; subtext: string }>,
              getCurrentHeadline: (state) => state[primaryField.key] as string,
              getCurrentSubtext: (state) => state[secondaryField.key] as string,
              getSelectAction: (actions) =>
                actions.handleSelectAlternative as unknown as (alt: {
                  headline: string;
                  subtext: string;
                }) => void,
            })
          : createAlternativesSection<ImageTwoTextState, ImageTwoTextActions>({
              type: 'string',
              getAlternatives: (state) => state.alternatives as string[],
              getCurrentValue: (state) => state[primaryField.key] as string,
              getSelectAction: (actions) =>
                actions.handleSelectAlternative as (alt: string) => void,
            }),
      share: createShareSection<ImageTwoTextState, ImageTwoTextActions>(
        id,
        getCanvasText || defaultGetCanvasText
      ),
    },

    elements: [...baseElements, ...elements],

    calculateLayout,

    createInitialState: (props: Record<string, unknown>): ImageTwoTextState => ({
      // Text fields
      [primaryField.key]: (props[primaryField.key] as string) || '',
      [secondaryField.key]: (props[secondaryField.key] as string) || '',
      customPrimaryFontSize: null,
      customSecondaryFontSize: null,

      // Image background
      currentImageSrc: (props.currentImageSrc as string) || (props.imageSrc as string) || '',
      imageOffset: { x: 0, y: 0 },
      imageScale: 1,
      isBackgroundLocked: false,

      // Base state
      assetInstances: [],
      isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
      alternatives: (props.alternatives as string[]) || [],
      selectedIcons: [],
      iconStates: {},
      shapeInstances: [],
      illustrationInstances: [],
      additionalTexts: [],
      pillBadgeInstances: [],
      circleBadgeInstances: [],
      balkenInstances: [],
    }),

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
          setState({ [primaryField.key]: val } as Partial<ImageTwoTextState>);
          callbacks[primaryCallbackKey]?.(val);
          debouncedSaveToHistory(getState());
        },
        handlePrimaryFontSizeChange: (size: number) => {
          setState({ customPrimaryFontSize: size } as Partial<ImageTwoTextState>);
          debouncedSaveToHistory(getState());
        },

        // Secondary text field
        setSecondary: (val: string) => {
          setState({ [secondaryField.key]: val } as Partial<ImageTwoTextState>);
          callbacks[secondaryCallbackKey]?.(val);
          debouncedSaveToHistory(getState());
        },
        handleSecondaryFontSizeChange: (size: number) => {
          setState({ customSecondaryFontSize: size } as Partial<ImageTwoTextState>);
          debouncedSaveToHistory(getState());
        },

        // Image background
        setCurrentImageSrc: (file: File | null, objectUrl?: string) => {
          setState({
            currentImageSrc: objectUrl || '',
            backgroundImageFile: file,
          } as Partial<ImageTwoTextState>);
          saveToHistory(getState());
        },
        setImageScale: (scale: number) => {
          setState({ imageScale: scale } as Partial<ImageTwoTextState>);
        },
        toggleBackgroundLock: () => {
          setState((prev) => ({ ...prev, isBackgroundLocked: !prev.isBackgroundLocked }));
        },
        setImageAttribution: (attribution: StockImageAttribution | null) => {
          setState({ imageAttribution: attribution } as Partial<ImageTwoTextState>);
        },

        // Alternatives - handles both string and two-text types
        handleSelectAlternative: (alt: AlternativeItem) => {
          if (typeof alt === 'object' && alt !== null && 'headline' in alt) {
            // Two-text alternative (headline + subtext)
            setState({
              [primaryField.key]: alt.headline,
              [secondaryField.key]: alt.subtext,
            } as Partial<ImageTwoTextState>);
            callbacks[primaryCallbackKey]?.(alt.headline);
            callbacks[secondaryCallbackKey]?.(alt.subtext);
          } else {
            // String alternative
            setState({ [primaryField.key]: alt as string } as Partial<ImageTwoTextState>);
            callbacks[primaryCallbackKey]?.(alt as string);
          }
          saveToHistory(getState());
        },
      };
    },
  };
}
