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
import { PiFrameCornersFill, PiSquaresFourFill, PiTextAa } from 'react-icons/pi';

import {
  AssetsSection,
  BackgroundSection,
  CombinedTextSection,
  FrameSettingsSection,
} from '../../sidebar/sections';
import { chatTab, createCommonSectionEntries, toolsTab, uploadsTab } from '../commonSections';
import { injectFeatureProps } from '../featureInjector';
import { getPlaceholder } from '../placeholders';
import { createShareSection } from '../shareSection';

import { createBaseActions } from './commonActions';
import { makeSectionDefiner } from './defineSection';

import type { CanvasFeatures, CanvasDimensions, IconState } from './baseTypes';
import type { BackgroundColorOption } from '../../sidebar/types';
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
 * Fixed-shape portion of the factory state. Dynamic per-template text
 * fields live in the `Record<TFields, string>` half of the public
 * `ColorTwoTextState<TFields>` type below. The `[key: string]: unknown`
 * index signature is required by the runtime element renderer for
 * dynamic state-key access (e.g. `state[opacityStateKey]`).
 */
export interface ColorTwoTextStateBase {
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
 * Specialize at the template site (e.g. `ColorTwoTextState<'quote' | 'name'>`)
 * to type-check `state.quote` as `string` directly — no `as string` casts
 * at read sites. Default `TFields = never` keeps the bare type backward-compatible.
 */
export type ColorTwoTextState<TFields extends string = never> = ColorTwoTextStateBase &
  Record<TFields, string>;

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
  addFrame: (clipType: FrameClipType) => void;
  updateFrame: (id: string, partial: Partial<FrameInstance>) => void;
  removeFrame: (id: string) => void;
  setFrameImage: (id: string, file: File, objectUrl: string) => void;
}

// ============================================================================
// FACTORY OPTIONS
// ============================================================================

export interface ColorTwoTextOptions<
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
  calculateLayout: (state: ColorTwoTextState<TPrimary | TSecondary>) => LayoutResult;

  /** Background color options */
  backgroundColors: BackgroundColorOption[];

  /** Default background color */
  defaultBackgroundColor: string;

  /** Map background color to text color */
  textColorMap: Record<string, string>;

  /** Optional: Custom elements to add to the canvas */
  elements?: CanvasElementConfig<ColorTwoTextState<TPrimary | TSecondary>>[];

  /** Optional: Features to enable */
  features?: CanvasFeatures;

  /** Optional: Max pages for multi-page mode */
  maxPages?: number;

  /** Optional: Function to get text for sharing */
  getCanvasText?: (state: ColorTwoTextState<TPrimary | TSecondary>) => string;

  /** Optional: Background image that changes with color */
  backgroundImageMap?: Record<string, string>;
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createColorTwoTextCanvas<
  const TPrimary extends string,
  const TSecondary extends string,
>(
  options: ColorTwoTextOptions<TPrimary, TSecondary>
): FullCanvasConfig<ColorTwoTextState<TPrimary | TSecondary>, ColorTwoTextActions> {
  type State = ColorTwoTextState<TPrimary | TSecondary>;
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
  const baseElements: CanvasElementConfig<State>[] = [];

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
  const defaultGetCanvasText = (state: State) => {
    const primary = state[primaryField.key] || '';
    const secondary = state[secondaryField.key] || '';
    return [primary, secondary].filter(Boolean).join('\n');
  };

  const section = makeSectionDefiner<State, ColorTwoTextActions>();

  return {
    id,
    canvas,
    features,

    multiPage: {
      enabled: true,
      maxPages,
      heterogeneous: true,
      // Cast: computed property keys widen to `string` in literals; runtime
      // shape is exactly `Record<TPrimary | TSecondary, string>`.
      defaultNewPageState: {
        [primaryField.key]: getPlaceholder(primaryField.key),
        [secondaryField.key]: getPlaceholder(secondaryField.key),
      } as Partial<State>,
    },

    tabs: [
      {
        id: 'background',
        icon: HiPhotograph,
        label: 'Hintergrund',
        ariaLabel: 'Hintergrundfarbe wählen',
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
        id: 'frame-settings',
        icon: PiFrameCornersFill,
        label: 'Rahmen',
        ariaLabel: 'Rahmen-Einstellungen',
      },
      toolsTab,
      uploadsTab,
      chatTab,
    ],

    // 'background' tab kept registered but hidden — opened via getAutoSwitchTab when
    // the canvas background is clicked.
    getVisibleTabs: () => ['text', 'assets', 'tools', 'uploads', 'chat', 'share'],

    getAutoSwitchTab: (selectedElement) => {
      if (selectedElement === 'background') return 'background';
      if (selectedElement?.startsWith('frame-')) return 'frame-settings';
      return null;
    },

    sections: {
      background: section({
        component: BackgroundSection,
        propsFactory: (state, actions) => ({
          currentColor: state.backgroundColor,
          colors: backgroundColors,
          onColorChange: actions.setBackgroundColor,
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
      share: createShareSection<State, ColorTwoTextActions>(
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

    // Cast: computed property keys widen to `string` in object literals.
    // Runtime shape matches `Record<TPrimary | TSecondary, string>` correctly.
    createInitialState: (props: Record<string, unknown>): State =>
      ({
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

        // Background color
        setBackgroundColor: (color: string) => {
          setState({ backgroundColor: color } as Partial<State>);
          saveToHistory(getState());
        },
      };
    },
  };
}
