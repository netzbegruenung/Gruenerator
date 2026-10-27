// SPDX-License-Identifier: MPL-2.0
import type { CanvasStageRef } from '../primitives/CanvasStage';
import type { HostCanvasAiCapabilities } from '@ggraphic/editor/ai/types';
import type { StockImageAttribution } from '@ggraphic/editor/common/imageSourceTypes';
import type { BackgroundType, TextFieldConfig } from '@ggraphic/editor/configs/unifiedTabs';
import type {
  AltTextPage,
  AltTextScope,
  CanvasSpecEditBridge,
  HeterogeneousPage,
} from '@ggraphic/editor/editorSeamTypes';
import type {
  BackgroundColorOption,
  SidebarTabId,
  SidebarTab,
} from '@ggraphic/editor/sidebar/tabTypes';
import type { GradientFill } from '@ggraphic/editor/utils/gradientFill';
import type { TextAccent, TextMarker } from '@ggraphic/editor/utils/textUtils';

// ============================================================================
// ELEMENT CONFIGURATION TYPES
// ============================================================================

/** Supported Konva element types */
export type CanvasElementType = 'text' | 'image' | 'rect' | 'circle' | 'group' | 'background';

/** Position that can be static or derived from state - now type-safe! */
export type PositionValue<TState = Record<string, unknown>> =
  number | ((state: TState, layout: LayoutResult) => number);

/** Fill color that can be static or derived from state */
export type FillValue<TState = Record<string, unknown>> =
  string | ((state: TState, layout: LayoutResult) => string);

/** Source value that can be static or derived from state */
export type SourceValue<TState = Record<string, unknown>> = string | ((state: TState) => string);

/** Visibility condition based on state */
export type VisibilityFunction<TState = Record<string, unknown>> = (state: TState) => boolean;

/** Base configuration for any canvas element */
export interface BaseElementConfig<TState = Record<string, unknown>> {
  id: string;
  type: CanvasElementType;
  /** Static or state-derived x position */
  x: PositionValue<TState>;
  /** Static or state-derived y position */
  y: PositionValue<TState>;
  /** Condition for rendering this element */
  visible?: VisibilityFunction<TState>;
  /** Z-index order (lower = behind) */
  order?: number;
}

/** Dynamic additional text element */
export interface AdditionalText {
  id: string;
  text: string;
  type: 'header' | 'subheader' | 'body';
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  fontStyle?: 'normal' | 'italic' | 'bold' | 'bold italic';
  fill: string;
  rotation?: number;
  scale?: number;
  opacity?: number;
  /** Outline color; omit for no outline. */
  stroke?: string;
  /** Outline width in px (only applied when `stroke` is set). */
  strokeWidth?: number;
  /** Drop shadow (Konva shadow* props); omit for no shadow. */
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  /** Linear gradient fill; when set, overrides `fill`. */
  fillGradient?: GradientFill | null;
  /** Horizontal alignment inside `width`; omit for left. */
  align?: 'left' | 'center' | 'right';
  /** Line height as a factor of `fontSize`; omit for the default 1.2. */
  lineHeight?: number;
  /** How `==accent==` runs look; omit and they render like the rest. */
  accent?: TextAccent | null;
  /** How `++marker++` runs look (a box behind the run); omit and they render like the rest. */
  marker?: TextMarker | null;
}

/** Text element configuration */
export interface TextElementConfig<
  TState = Record<string, unknown>,
> extends BaseElementConfig<TState> {
  type: 'text';
  /** State key for text content */
  textKey: string;
  /** Static or state-derived width */
  width: PositionValue<TState>;
  /** Static or state-derived font size */
  fontSize: PositionValue<TState>;
  fontFamily: string;
  fontStyle?: 'bold' | 'normal' | 'italic' | 'bold italic';
  /** Static or state-derived fill color */
  fill?: FillValue<TState>;
  /** State key for custom fill color override */
  fillStateKey?: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  wrap?: 'word' | 'char' | 'none';
  /** Text padding in pixels (or fontSize multiplier if 0 < value < 1) */
  padding?: PositionValue<TState>;
  /** Enable inline editing */
  editable?: boolean;
  /**
   * Der Text trägt Markdown-lite (`**fett**`, `_kursiv_`, `<u>…</u>`, Listen)
   * und wird mit dem Rich-Text-Editor bearbeitet. Nur für Felder in einer
   * Schrift mit echten Fett-/Kursiv-Schnitten (PT Sans) setzen — eine Display-Schrift
   * mit nur einem Schnitt, dort würde beides synthetisiert.
   */
  richText?: boolean;
  /** Enable dragging */
  draggable?: boolean;
  /** Enable transform handles */
  transformable?: boolean;
  /** State key for custom font size override */
  fontSizeStateKey?: string;
  /** State key for custom width override */
  widthStateKey?: string;
  /** State key for custom position override */
  positionStateKey?: string;
  /** Opacity (0-1) */
  opacity?: PositionValue<TState>;
  /** State key for custom opacity override */
  opacityStateKey?: string;
}

/** Image element configuration */
export interface ImageElementConfig<
  TState = Record<string, unknown>,
> extends BaseElementConfig<TState> {
  type: 'image';
  /** State key for image source URL */
  srcKey?: string;
  /** Static source */
  src?: SourceValue<TState>;
  /** Static or state-derived width */
  width: PositionValue<TState>;
  /** Static or state-derived height */
  height: PositionValue<TState>;
  /** State key for image offset */
  offsetKey?: string;
  /** State key for image scale */
  scaleKey?: string;
  /** State key for absolute position {x, y} */
  positionStateKey?: string;
  /** State key for absolute size {w, h} */
  sizeStateKey?: string;
  /** Enable dragging */
  draggable?: boolean;
  /** Enable transform handles */
  transformable?: boolean;
  /** Listen for events */
  listening?: boolean;
  /** Constrain element position to canvas bounds during drag (default: true) */
  constrainToBounds?: boolean;
  /** Opacity (0-1) */
  opacity?: PositionValue<TState>;
  /** State key for custom opacity override */
  opacityStateKey?: string;
  /** Static or state-derived fill color (for filters) */
  fill?: FillValue<TState>;
  /** State key for custom fill color override */
  fillStateKey?: string;
  /**
   * When true, the source image is center-cropped to match the displayed
   * width/height aspect ratio (CSS object-fit: cover). Use for background
   * images that should preserve their natural aspect ratio inside a
   * fixed-aspect canvas.
   */
  coverFit?: boolean;
  /**
   * When true, the scaled box is re-anchored on the slot's centre instead of
   * scaling about the top-left origin (the default). Use for fixed photo slots
   * (e.g. the veranstaltung band) that are not draggable: zoom then magnifies
   * about the centre with no drift into a corner and no re-centring needed.
   */
  centerZoom?: boolean;
  /**
   * The part of the element's box a cover-fitted photo fills; the rest stays
   * free. Null: the whole box. The composer's photo strips use it.
   */
  frame?: (
    state: TState,
    layout: LayoutResult
  ) => { x: number; y: number; width: number; height: number } | null;
}

/** Rectangle element configuration */
export interface RectElementConfig<
  TState = Record<string, unknown>,
> extends BaseElementConfig<TState> {
  type: 'rect';
  width: PositionValue<TState>;
  height: PositionValue<TState>;
  fill: FillValue<TState>;
  /**
   * Optionaler linearer Verlauf, Punkte relativ zur linken oberen Ecke des
   * Rechtecks. Ist er gesetzt, gewinnt er in Konva gegen `fill`.
   */
  fillLinearGradientStartPoint?: { x: number; y: number };
  fillLinearGradientEndPoint?: { x: number; y: number };
  fillLinearGradientColorStops?: Array<number | string>;
  listening?: boolean;
  /** Corner radius for rounded rectangles. Single number for uniform radius, or array of 4 for per-corner [topLeft, topRight, bottomRight, bottomLeft] */
  cornerRadius?: PositionValue<TState> | number[];
  /** Enable dragging */
  draggable?: boolean;
}

/** Circle element configuration */
export interface CircleElementConfig<
  TState = Record<string, unknown>,
> extends BaseElementConfig<TState> {
  type: 'circle';
  radius: PositionValue<TState>;
  fill: FillValue<TState>;
  rotation?: number;
}

/** Group element configuration (for complex nested elements) */
export interface GroupElementConfig<
  TState = Record<string, unknown>,
> extends BaseElementConfig<TState> {
  type: 'group';
  /** Child elements within this group */
  children: CanvasElementConfig<TState>[];
  /** Clip function config */
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rotation?: number;
}

/** Background element (solid color) */
export interface BackgroundElementConfig<
  TState = Record<string, unknown>,
> extends BaseElementConfig<TState> {
  type: 'background';
  width: number;
  height: number;
  /** State key for background color */
  colorKey?: string;
  /** Static color */
  color?: string;
  /** Static or state-derived fill color */
  fill?: FillValue<TState>;
  /** State key for custom fill color override */
  fillStateKey?: string;
  /** Opacity (0-1) */
  opacity?: PositionValue<TState>;
  /** State key for custom opacity override */
  opacityStateKey?: string;
}

/** Union of all element config types */
export type CanvasElementConfig<TState = Record<string, unknown>> =
  | TextElementConfig<TState>
  | ImageElementConfig<TState>
  | RectElementConfig<TState>
  | CircleElementConfig<TState>
  | GroupElementConfig<TState>
  | BackgroundElementConfig<TState>;

// ============================================================================
// LAYOUT CONFIGURATION
// ============================================================================

/** Layout element position and size */
export interface LayoutElementResult {
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  maxWidth?: number;
  lineHeight?: number;
  padding?: number;
}

/** Layout calculation result - element positions and sizes */
export interface LayoutResult {
  [key: string]: LayoutElementResult | Record<string, unknown> | undefined;
  _meta?: Record<string, unknown>;
}

/** Layout calculator function */
export type LayoutCalculator<TState> = (state: TState) => LayoutResult;

// ============================================================================
// SECTION CONFIGURATION (existing, enhanced)
// ============================================================================

export interface SectionContext {
  selectedElement: string | null;
  exportedImage?: string | null;
  autoSaveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  shareToken?: string | null;
  onCaptureCanvas?: () => void;
  /** Returns the current page's canvas as a PNG data URL (or null if not ready). */
  captureCanvasImage?: () => Promise<string | null>;
  /** Higher-fidelity capture variant used to feed canvas images to the AI. */
  captureCanvasImageForAi?: () => Promise<string | null>;
  /** Rotates an element of the current page about its centre, as the toolbar does; false when it can't turn. */
  rotateElement?: (id: string, deg: number) => boolean;
  /** Pages as image plus their texts, for the alt-text tool (multi-page editor only). */
  collectAltTextPages?: (scope: AltTextScope) => Promise<AltTextPage[]>;
  /** Number of pages in the editor. */
  pageCount?: number;
  /** Spec-path bridge for the chat section (multi-page editor only). */
  specEdit?: CanvasSpecEditBridge;
  /** The page's background controls, for sections that set the background. */
  background?: BackgroundControls | null;
  /** The page's chart palette (`FullCanvasConfig.chartColors`). */
  chartColors?: readonly string[];
  onDownload?: () => void;
  onNavigateToGallery?: () => void;
  /** Opens the host's "als Vorlage speichern" flow; the entry hides without it. */
  onSaveAsTemplate?: () => void;
  /** Font color from layout meta (for text elements) */
  fontColor?: string;
  /** Additional metadata from layout calculations */
  [key: string]: unknown;
}

/**
 * Phantom brand. A genuine `SectionConfig` can only be produced by
 * `makeSectionDefiner()`, which checks the component↔propsFactory contract.
 * Raw object literals lack this brand, so `FullCanvasConfig.sections` rejects
 * them — a mistyped section can no longer slip through the Record's `any`
 * props slot (see `factory/defineSection.ts`).
 */
declare const sectionConfigBrand: unique symbol;

export interface SectionConfig<
  TState = Record<string, unknown>,
  TActions = Record<string, unknown>,
  TSectionProps = Record<string, unknown>,
> {
  /** Component to render for this section */
  component: React.ComponentType<TSectionProps>;
  /** Function to map canvas state and handlers to section props */
  propsFactory: (state: TState, actions: TActions, context?: SectionContext) => TSectionProps;
  /** @internal Brand — only `makeSectionDefiner()` may produce this. */
  readonly [sectionConfigBrand]: true;
}

// ============================================================================
// MULTI-PAGE CONFIGURATION
// ============================================================================

export type { HeterogeneousPage };

/** Multi-page configuration options */
export interface MultiPageConfig<TState> {
  /** Enable multi-page mode */
  enabled: boolean;
  /** Maximum number of pages allowed (optional, unlimited if not set) */
  maxPages?: number;
  /** Default state for new pages */
  defaultNewPageState?: Partial<TState>;
  /** Enable heterogeneous mode - allows different templates per page */
  heterogeneous?: boolean;
}

// ============================================================================
// BACKGROUND CONTROLS
// ============================================================================

/**
 * What the context bar offers for a template's background — its colour plane
 * and, where the template has one, the photo over it. Each field is optional:
 * a control is shown only when its value and its setter are both present.
 */
export interface BackgroundControls {
  /** Swatches for the colour plane, shown first; the brand colours and a free
   *  pick follow unless `paletteOnly`. */
  colors?: readonly BackgroundColorOption[];
  /** The colour is derived from a fixed set (slider schemes): offer only `colors`. */
  paletteOnly?: boolean;
  /** The colour now shown; empty while a photo replaces it (freeform). */
  currentColor?: string;
  onColorChange?: (color: string) => void;
  /** True when a colour pick itself hides the photo (freeform keeps it to restore).
   *  Otherwise the colour lies under the photo, and a pick from the photo removes it. */
  colorReplacesImage?: boolean;
  /** The photo now shown; undefined when there is none. */
  currentImageSrc?: string;
  /** Stock credit of the photo now shown, if it is a hotlinked stock photo. */
  imageAttribution?: StockImageAttribution | null;
  /** Sets the photo (`url` must be durable) or, with `null`, removes it. */
  onImageChange?: (
    file: File | null,
    url?: string,
    attribution?: StockImageAttribution | null
  ) => void;
  /** Brings back a photo that a colour pick hid but kept (freeform). */
  onRestoreImage?: () => void;
  scale?: number;
  onScaleChange?: (scale: number) => void;
}

// ============================================================================
// FULL CANVAS CONFIGURATION
// ============================================================================

/** A design as the host's gallery describes it (`FullCanvasConfig.shareMetadata`). */
export interface ShareDescription {
  content: Record<string, unknown>;
  styling: Record<string, unknown>;
}

export interface FullCanvasConfig<
  TState = Record<string, unknown>,
  TActions = Record<string, unknown>,
> {
  /** Canvas identifier */
  id: string;
  /** Canvas dimensions */
  canvas: {
    width: number;
    height: number;
  };
  /** Sidebar tabs */
  tabs: SidebarTab[];
  /** Sidebar sections - uses 'any' for component props to allow strongly-typed section components */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sections: Record<string, SectionConfig<TState, TActions, any>>;
  /** Canvas elements to render */
  elements: CanvasElementConfig<TState>[];
  /** Layout calculator */
  calculateLayout: LayoutCalculator<TState>;
  /** Create initial state from props */
  createInitialState: (props: Record<string, unknown>) => TState;
  /** Runs once fonts are loaded, on mount and after a remote page patch:
   *  repairs what a writer without font metrics (the chat edit path) left
   *  behind. Returns the repaired state, or null when there is nothing to do. */
  normalizeLoadedState?: (state: TState) => TState | null;
  /**
   * What the host's gallery stores about an auto-saved design of this
   * template (`content`, `styling`). Without it, the whole state goes into
   * `content`.
   */
  shareMetadata?: (state: TState) => ShareDescription;
  /** Create action handlers. Both history savers snapshot the committed
   *  state after the action's update; their argument is ignored. */
  createActions: (
    getState: () => TState,
    setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void,
    saveToHistory: (state?: TState) => void,
    debouncedSaveToHistory: (state?: TState) => void,
    callbacks: Record<string, ((val: unknown) => void) | undefined>
  ) => TActions;
  /** The background's colour and photo controls for the context bar. */
  background?: (state: TState, actions: TActions) => BackgroundControls;
  /** Series colours for charts on this page, its country's palette; absent: the active brand's (`chartColors()`). */
  chartColors?: readonly string[];
  /** Optional function to determine disabled tabs */
  getDisabledTabs?: (state: TState) => SidebarTabId[];
  /** Optional function to determine visible tabs.
   *  `state` may be `null` during slide-switch transitions, before the new
   *  page's PageWrapper has reported its state — implementations that read
   *  state must null-guard. */
  getVisibleTabs?: (
    state: TState | null,
    context?: { selectedElement?: string | null }
  ) => SidebarTabId[];
  /** Optional function to auto-switch tabs when an element is selected/deselected.
   *  Return the tab to switch to, or null to restore the previous tab. */
  getAutoSwitchTab?: (selectedElement: string | null) => SidebarTabId | null;
  /** Additional assets/resources */
  assets?: {
    backgroundImages?: Record<string, string>;
    textColors?: Record<string, string>;
  };
  features?: {
    icons?: boolean;
    shapes?: boolean;
    illustrations?: boolean;
  };
  /** Multi-page canvas support */
  multiPage?: MultiPageConfig<TState>;

  // ============================================================================
  // UNIFIED TAB SYSTEM (for heterogeneous multi-page mode)
  // ============================================================================

  /** Whether the background is a photo or a colour plane; defaults to 'image'. */
  backgroundType?: BackgroundType;

  /**
   * Text field configurations for the unified Text tab.
   * Each field is rendered in the CombinedTextSection with its own input/textarea.
   * If not specified, the template-specific text section is used instead.
   *
   * Example:
   * textFields: [
   *   { key: 'quote', label: 'Zitat', multiline: true },
   *   { key: 'name', label: 'Name', multiline: false },
   * ]
   */
  textFields?: TextFieldConfig[];

  /**
   * Whether this config uses the unified tab system.
   * When true, the standard 5-tab layout is used with adaptive content.
   * When false or undefined, template-specific tabs are used.
   */
  useUnifiedTabs?: boolean;
  /** Font configuration for canvas rendering */
  fonts?: {
    /** Primary font family used in canvas (e.g., 'PT Sans') */
    primary: string;
    /** Font size for preloading (affects text metrics) */
    fontSize: number;
    /** Whether to show loading state until font loads (default: true) */
    requireFontLoad?: boolean;
  };

  /**
   * Optional AI capability declaration. Templates that supply this gain
   * an AI sidebar tab; templates that don't never see the AI section.
   * See `ai/types.ts` for shape.
   */
  ai?: HostCanvasAiCapabilities<TState, TActions>;
}

// Configs differ in state/action types; the loader hands them out untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCanvasConfig = FullCanvasConfig<any, any>;

// ============================================================================
// LEGACY SIDEBAR-ONLY CONFIG (for backward compatibility with older templates)
// ============================================================================

export interface CanvasConfig<
  TState = Record<string, unknown>,
  TActions = Record<string, unknown>,
> {
  /** List of tabs to display in the sidebar */
  tabs: SidebarTab[];
  /** Mapping of tab IDs to section configurations - uses 'any' for component props to allow strongly-typed section components */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sections: Record<string, SectionConfig<TState, TActions, any>>;
  /** Optional function to determine disabled tabs based on state */
  getDisabledTabs?: (state: TState) => SidebarTabId[];
  /** Optional function to determine visible tabs based on state/context.
   *  `state` may be `null` during slide-switch transitions. */
  getVisibleTabs?: (
    state: TState | null,
    context?: { selectedElement?: string | null }
  ) => SidebarTabId[];
}
