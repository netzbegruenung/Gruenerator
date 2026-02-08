/**
 * Factory: createColorTwoTextCanvas
 *
 * Creates a complete canvas config for templates with:
 * - Solid color background with color picker
 * - Two text fields (primary + secondary)
 * - Text color derived from background color
 * - Standard features (icons, shapes, illustrations)
 *
 * Used by: Zitat Pure, Info
 */

import { HiPhotograph } from 'react-icons/hi';
import { PiSquaresFourFill } from 'react-icons/pi';

import { BackgroundSection, AssetsSection } from '../../sidebar/sections';
import {
  alternativesTab,
  createAlternativesSection,
  isAlternativesEmpty,
} from '../alternativesSection';
import { injectFeatureProps } from '../featureInjector';
import { getPlaceholder } from '../placeholders';
import { shareTab, createShareSection } from '../shareSection';

import { createBaseActions } from './commonActions';

import type { CanvasFeatures, CanvasDimensions, IconState } from './baseTypes';
import type { BackgroundColorOption } from '../../sidebar/types';
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

export interface ColorTwoTextState {
  // Text fields (dynamic keys set at config time)
  [key: string]: unknown;

  // Color background
  backgroundColor: string;

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
  alternatives: string[];
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

export interface ColorTwoTextActions {
  // Text setters (dynamic - set at config time)
  setPrimary: (val: string) => void;
  setSecondary: (val: string) => void;
  handlePrimaryFontSizeChange: (size: number) => void;
  handleSecondaryFontSizeChange: (size: number) => void;

  // Color background
  setBackgroundColor: (color: string) => void;

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
  handleSelectAlternative: (alt: string) => void;
}

// ============================================================================
// FACTORY OPTIONS
// ============================================================================

export interface ColorTwoTextOptions {
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
  calculateLayout: (state: ColorTwoTextState) => LayoutResult;

  /** Background color options */
  backgroundColors: BackgroundColorOption[];

  /** Default background color */
  defaultBackgroundColor: string;

  /** Map background color to text color */
  textColorMap: Record<string, string>;

  /** Optional: Custom elements to add to the canvas */
  elements?: CanvasElementConfig<ColorTwoTextState>[];

  /** Optional: Features to enable */
  features?: CanvasFeatures;

  /** Optional: Max pages for multi-page mode */
  maxPages?: number;

  /** Optional: Function to get text for sharing */
  getCanvasText?: (state: ColorTwoTextState) => string;

  /** Optional: Background image that changes with color */
  backgroundImageMap?: Record<string, string>;
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createColorTwoTextCanvas(
  options: ColorTwoTextOptions
): FullCanvasConfig<ColorTwoTextState, ColorTwoTextActions> {
  const {
    id,
    canvas,
    primaryField,
    secondaryField,
    calculateLayout,
    backgroundColors,
    defaultBackgroundColor,
    textColorMap,
    elements = [],
    features = { icons: true, shapes: true, illustrations: true },
    maxPages = 10,
    getCanvasText,
    backgroundImageMap,
  } = options;

  // Build base elements
  const baseElements: CanvasElementConfig<ColorTwoTextState>[] = [];

  // Add background element - either image mapped or solid color
  if (backgroundImageMap) {
    baseElements.push({
      id: 'background-image',
      type: 'image',
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      src: (state) =>
        backgroundImageMap[state.backgroundColor] || Object.values(backgroundImageMap)[0],
    });
  } else {
    baseElements.push({
      id: 'background',
      type: 'background',
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      colorKey: 'backgroundColor',
    });
  }

  // Default getCanvasText if not provided
  const defaultGetCanvasText = (state: ColorTwoTextState) => {
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
      {
        id: 'background',
        icon: HiPhotograph,
        label: 'Hintergrund',
        ariaLabel: 'Hintergrundfarbe wählen',
      },
      {
        id: 'assets',
        icon: PiSquaresFourFill,
        label: 'Elemente',
        ariaLabel: 'Dekorative Elemente',
      },
      alternativesTab,
      shareTab,
    ],

    getVisibleTabs: () => ['background', 'assets', 'alternatives', 'share'],

    getDisabledTabs: (state) =>
      isAlternativesEmpty(state, (s) => s.alternatives) ? ['alternatives'] : [],

    sections: {
      background: {
        component: BackgroundSection,
        propsFactory: (state, actions) => ({
          currentColor: state.backgroundColor,
          colors: backgroundColors,
          onColorChange: actions.setBackgroundColor,
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
      alternatives: createAlternativesSection<ColorTwoTextState, ColorTwoTextActions>({
        type: 'string',
        getAlternatives: (state) => state.alternatives,
        getCurrentValue: (state) => state[primaryField.key] as string,
        getSelectAction: (actions) => actions.handleSelectAlternative,
      }),
      share: createShareSection<ColorTwoTextState, ColorTwoTextActions>(
        id,
        getCanvasText || defaultGetCanvasText
      ),
    },

    elements: [...baseElements, ...elements],

    calculateLayout: (state) => {
      const baseLayout = calculateLayout(state);
      // Inject font color from textColorMap into layout meta
      const fontColor = textColorMap[state.backgroundColor] || Object.values(textColorMap)[0];
      return {
        ...baseLayout,
        _meta: {
          ...(baseLayout._meta || {}),
          fontColor,
        },
      };
    },

    createInitialState: (props: Record<string, unknown>): ColorTwoTextState => ({
      // Text fields
      [primaryField.key]: (props[primaryField.key] as string) || '',
      [secondaryField.key]: (props[secondaryField.key] as string) || '',
      customPrimaryFontSize: null,
      customSecondaryFontSize: null,

      // Background color
      backgroundColor: (props.backgroundColor as string) || defaultBackgroundColor,

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
      // Get font color for additional text actions
      const getFontColor = () => {
        const state = getState();
        return textColorMap[state.backgroundColor] || Object.values(textColorMap)[0];
      };

      const baseActions = createBaseActions(
        getState,
        setState,
        saveToHistory,
        debouncedSaveToHistory,
        canvas.width,
        canvas.height,
        getFontColor()
      );

      // Callback keys for external sync
      const primaryCallbackKey = `on${primaryField.key.charAt(0).toUpperCase() + primaryField.key.slice(1)}Change`;
      const secondaryCallbackKey = `on${secondaryField.key.charAt(0).toUpperCase() + secondaryField.key.slice(1)}Change`;

      return {
        ...baseActions,

        // Primary text field
        setPrimary: (val: string) => {
          setState({ [primaryField.key]: val } as Partial<ColorTwoTextState>);
          callbacks[primaryCallbackKey]?.(val);
          debouncedSaveToHistory(getState());
        },
        handlePrimaryFontSizeChange: (size: number) => {
          setState({ customPrimaryFontSize: size } as Partial<ColorTwoTextState>);
          debouncedSaveToHistory(getState());
        },

        // Secondary text field
        setSecondary: (val: string) => {
          setState({ [secondaryField.key]: val } as Partial<ColorTwoTextState>);
          callbacks[secondaryCallbackKey]?.(val);
          debouncedSaveToHistory(getState());
        },
        handleSecondaryFontSizeChange: (size: number) => {
          setState({ customSecondaryFontSize: size } as Partial<ColorTwoTextState>);
          debouncedSaveToHistory(getState());
        },

        // Background color
        setBackgroundColor: (color: string) => {
          setState({ backgroundColor: color } as Partial<ColorTwoTextState>);
          saveToHistory(getState());
        },

        // Alternatives
        handleSelectAlternative: (alt: string) => {
          setState({ [primaryField.key]: alt } as Partial<ColorTwoTextState>);
          callbacks[primaryCallbackKey]?.(alt);
          saveToHistory(getState());
        },
      };
    },
  };
}
