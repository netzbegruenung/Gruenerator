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
  CombinedTextSection,
  FrameSettingsSection,
  ImageBackgroundSection,
} from '../../sidebar/sections';
import { chatTab, createCommonSectionEntries, toolsTab, uploadsTab } from '../commonSections';
import { injectFeatureProps } from '../featureInjector';
import { getPlaceholder } from '../placeholders';
import { createShareSection } from '../shareSection';

import { createBaseActions } from './actionFactories';
import { carryInstanceState } from './carryInstanceState';
import { makeSectionDefiner } from './defineSection';

import type { CanvasFeatures, CanvasDimensions, IconState } from './baseTypes';
import type { StockImageAttribution } from '../../common/imageSourceTypes';
import type { BackgroundColorOption } from '../../sidebar/types';
import type { BalkenInstance, BalkenMode } from '../../utils/balkenUtils';
import type { AssetInstance } from '../../utils/canvasAssets';
import type { CircleBadgeInstance } from '../../utils/circleBadgeUtils';
import type { ChartInstance } from '../../utils/chartUtils';
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

  // Photo background. Optional throughout: these templates start on colour and
  // most stay there. A set `currentImageSrc` covers the colour plane whole.
  currentImageSrc?: string;
  backgroundImageFile?: File | Blob | null;
  imageOffset?: { x: number; y: number };
  imageScale?: number;
  isBackgroundLocked?: boolean;
  backgroundImageOpacity?: number;
  imageAttribution?: StockImageAttribution | null;

  // Text styling
  customPrimaryFontSize: number | null;
  customSecondaryFontSize: number | null;
  primaryOpacity?: number;
  secondaryOpacity?: number;
  primaryColor?: string;
  secondaryColor?: string;
  primaryPosition?: { x: number; y: number } | null;
  secondaryPosition?: { x: number; y: number } | null;

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
  chartInstances: ChartInstance[];
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

  // Photo background
  setCurrentImageSrc: (file: File | null, objectUrl?: string) => void;
  setImageScale: (scale: number) => void;
  toggleBackgroundLock: () => void;
  setImageAttribution: (attribution: StockImageAttribution | null) => void;

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

  /**
   * Optional: opacity of the dark scrim drawn over a chosen photo. Defaults to
   * the same 0.5 the DE quote uses. Only ever visible with a photo — see the
   * `gradient-overlay` element.
   */
  photoGradientOpacity?: number;

  /** Optional: Custom elements to add to the canvas */
  elements?: CanvasElementConfig<ColorTwoTextState<TPrimary | TSecondary>>[];

  /** Optional: Features to enable */
  features?: CanvasFeatures;

  /** Optional: Max pages for multi-page mode */
  maxPages?: number;

  /** Optional: Function to get text for sharing */
  getCanvasText?: (state: ColorTwoTextState<TPrimary | TSecondary>) => string;

  /**
   * Optional: template-specific state keys that must survive
   * createInitialState (e.g. zitat-pure's `namePosition`). Without this the
   * initial-state whitelist silently drops keys written by chat edits, so
   * card renders and remote-sync re-seeds lose them.
   */
  passthroughStateKeys?: string[];
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Copies the text-styling keys `createTextElement` wires into every
 * primary/secondary text (colour, opacity, dragged position) out of the seed
 * props. Absent keys are omitted rather than carried as an explicit
 * `undefined`, so the optional state fields stay unset.
 */
function carryTextStyling(props: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'primaryColor',
    'secondaryColor',
    'primaryOpacity',
    'secondaryOpacity',
    'primaryPosition',
    'secondaryPosition',
  ];
  return Object.fromEntries(keys.filter((k) => props[k] != null).map((k) => [k, props[k]]));
}

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
    photoGradientOpacity = 0.5,
    elements = [],
    features = { icons: true, shapes: true, illustrations: true },
    maxPages = 10,
    getCanvasText,
    passthroughStateKeys = [],
  } = options;

  // The background stack, bottom to top: the solid colour plane, the optional
  // photo over it, and a scrim that appears with the photo.
  //
  // The colour plane is non-interactive by construction: CanvasBackground draws
  // it with `listening={false}`, which is load-bearing — a full-bleed listening
  // rect would swallow every click on empty canvas and useCanvasInteractions
  // would stop deselecting.
  //
  // The photo needs no mode flag to hide the colour: `CanvasImage` returns null
  // while `currentImageSrc` is empty, and `coverFit` fills the frame once it is
  // set. All three carry explicit negative orders so a template's own elements
  // (which start at 1) stay above them.
  const baseElements: CanvasElementConfig<State>[] = [
    {
      id: 'background',
      type: 'background',
      order: -2,
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      colorKey: 'backgroundColor',
    },
    {
      id: 'background-image',
      type: 'image',
      order: -1,
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
    {
      // Contrast scrim. These templates derive their font colour from the
      // background colour and land on dark text for the light options
      // (zitat-pure puts #005437 on Hellgrün) — over a photograph that is
      // unreadable. `calculateLayout` below forces white while a photo is set;
      // this gradient is the other half of that pair, and like the font switch
      // it comes and goes with the photo.
      id: 'gradient-overlay',
      type: 'rect',
      order: -0.5,
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      fill: `rgba(0, 0, 0, ${photoGradientOpacity})`,
      fillLinearGradientStartPoint: { x: 0, y: 0 },
      fillLinearGradientEndPoint: { x: 0, y: canvas.height },
      fillLinearGradientColorStops: [
        0,
        'rgba(0, 0, 0, 0)',
        1,
        `rgba(0, 0, 0, ${photoGradientOpacity})`,
      ],
      listening: false,
      visible: (state: State) => !!state.currentImageSrc,
    },
  ];

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

    // 'background' was kept out of this list and left to getAutoSwitchTab, on the
    // assumption that clicking the background opens it. It cannot: the only
    // background these templates draw is the colour plane, and CanvasBackground
    // renders that with `listening={false}`, so it never becomes the selection.
    // The colour picker was unreachable by any route — the tab strip is the only
    // way in, and it is also the better affordance.
    // 'share' is not in `tabs`, so listing it here filtered to nothing.
    getVisibleTabs: () => ['background', 'text', 'assets', 'tools', 'uploads', 'chat'],

    getAutoSwitchTab: (selectedElement) => {
      if (selectedElement?.startsWith('chart-')) return 'chart-settings';
      if (selectedElement?.startsWith('frame-')) return 'frame-settings';
      return null;
    },

    sections: {
      background: section({
        // ImageBackgroundSection, not BackgroundSection: it carries the better
        // picker (own uploads + Unsplash, masonry) and since PR A the zoom and
        // lock controls. The colour swatches ride along as its "Farbe" tab.
        component: ImageBackgroundSection,
        propsFactory: (state, actions) => ({
          backgroundColor: state.backgroundColor,
          backgroundColors,
          onBackgroundColorChange: actions.setBackgroundColor,
          currentImageSrc: state.currentImageSrc,
          onImageChange: (
            file: File | null,
            objectUrl?: string,
            attribution?: StockImageAttribution | null
          ) => {
            actions.setCurrentImageSrc(file, objectUrl);
            if (attribution !== undefined) actions.setImageAttribution(attribution);
          },
          scale: state.imageScale ?? 1,
          onScaleChange: actions.setImageScale,
          isLocked: state.isBackgroundLocked ?? false,
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
      share: createShareSection<State, ColorTwoTextActions>(
        id,
        getCanvasText || defaultGetCanvasText
      ),
    },

    elements: [...baseElements, ...elements],

    calculateLayout: (state) => {
      const baseLayout = calculateLayout(state);
      // Font colour follows the background colour — EXCEPT over a photo, where
      // the derived colour is meaningless and often dark (zitat-pure derives
      // #005437 from Hellgrün). White plus the gradient scrim is the only pair
      // that holds against an arbitrary photograph.
      const fontColor = state.currentImageSrc
        ? '#FFFFFF'
        : textColorMap[state.backgroundColor] || Object.values(textColorMap)[0];
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
        // Carried over from props: chat edits persist these into the canvas
        // state, and card renders / remote-sync re-seeds run through here —
        // hard-nulling them silently reverted "Schrift größer" edits.
        customPrimaryFontSize: (props.customPrimaryFontSize as number | null | undefined) ?? null,
        customSecondaryFontSize:
          (props.customSecondaryFontSize as number | null | undefined) ?? null,

        // Background color
        backgroundColor: (props.backgroundColor as string) || defaultBackgroundColor,

        // Photo background. Carried, never hard-reset: card renders and
        // remote-sync re-seeds run through here, and this whitelist drops
        // whatever it does not name.
        currentImageSrc: (props.currentImageSrc as string) || '',
        imageOffset: (props.imageOffset as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
        imageScale: (props.imageScale as number | undefined) ?? 1,
        isBackgroundLocked: (props.isBackgroundLocked as boolean | undefined) ?? false,
        backgroundImageOpacity: (props.backgroundImageOpacity as number | undefined) ?? 1,
        imageAttribution:
          (props.imageAttribution as StockImageAttribution | null | undefined) ?? null,

        // Toolbar-written text styling. Rides along for the same reason as
        // the font sizes above: card renders and remote-sync re-seeds run
        // through here, and a key that is neither carried nor listed in
        // `passthroughStateKeys` is dropped — the colour/opacity slider then
        // applied live and forgot the change on the next render.
        ...carryTextStyling(props),

        // Base state
        isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,

        // Everything the user added to the canvas. These were hard-set to `[]`
        // here, so a chat edit — which re-seeds through this function with the
        // full previous state — erased added icons, shapes and texts.
        ...carryInstanceState(props),

        ...Object.fromEntries(
          passthroughStateKeys.filter((k) => k in props).map((k) => [k, props[k]])
        ),
      }) as State,

    createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => {
      // Get font color for additional text actions
      // Same rule as calculateLayout: a text the user adds over a photo has to
      // be white, or it inherits the dark colour derived from the (invisible)
      // background colour.
      const getFontColor = () => {
        const state = getState();
        if (state.currentImageSrc) return '#FFFFFF';
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

        // Photo background
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
