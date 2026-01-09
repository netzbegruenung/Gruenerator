
import type { SidebarTabId, SidebarTab } from '../sidebar/types';
import type { CanvasStageRef } from '../primitives/CanvasStage';

// ============================================================================
// ELEMENT CONFIGURATION TYPES
// ============================================================================

/** Supported Konva element types */
export type CanvasElementType = 'text' | 'image' | 'rect' | 'circle' | 'group' | 'background';

/** Position that can be static or derived from state */
export type PositionValue = number | ((state: any, layout: any) => number);

/** Base configuration for any canvas element */
export interface BaseElementConfig {
    id: string;
    type: CanvasElementType;
    /** Static or state-derived x position */
    x: PositionValue;
    /** Static or state-derived y position */
    y: PositionValue;
    /** Condition for rendering this element */
    visible?: (state: any) => boolean;
    /** Z-index order (lower = behind) */
    order?: number;
}

/** Dynamic additional text element */
export interface AdditionalText {
    id: string;
    text: string;
    type: 'header' | 'body';
    x: number;
    y: number;
    width: number;
    fontSize: number;
    fontFamily: string;
    fontStyle?: string;
    fill: string;
    rotation?: number;
    scale?: number;
    opacity?: number;
}

/** Text element configuration */
export interface TextElementConfig extends BaseElementConfig {
    type: 'text';
    /** State key for text content */
    textKey: string;
    /** Static or state-derived width */
    width: PositionValue;
    /** Static or state-derived font size */
    fontSize: PositionValue;
    fontFamily: string;
    fontStyle?: 'bold' | 'normal' | 'italic' | 'bold italic';
    /** Static or state-derived fill color */
    fill?: string | ((state: any, layout: LayoutResult) => string);
    /** State key for custom fill color override */
    fillStateKey?: string;
    align?: 'left' | 'center' | 'right';
    lineHeight?: number;
    wrap?: 'word' | 'char' | 'none';
    /** Text padding in pixels (or fontSize multiplier if 0 < value < 1) */
    padding?: PositionValue;
    /** Enable inline editing */
    editable?: boolean;
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
    opacity?: PositionValue;
    /** State key for custom opacity override */
    opacityStateKey?: string;
}

/** Image element configuration */
export interface ImageElementConfig extends BaseElementConfig {
    type: 'image';
    /** State key for image source URL */
    srcKey?: string;
    /** Static source */
    src?: string | ((state: any) => string);
    /** Static or state-derived width */
    width: PositionValue;
    /** Static or state-derived height */
    height: PositionValue;
    /** State key for image offset */
    offsetKey?: string;
    /** State key for image scale */
    scaleKey?: string;
    /** Enable dragging */
    draggable?: boolean;
    /** Lock state key */
    lockedKey?: string;
    /** Enable transform handles */
    transformable?: boolean;
    /** Listen for events */
    listening?: boolean;
    /** Opacity (0-1) */
    opacity?: PositionValue;
    /** State key for custom opacity override */
    opacityStateKey?: string;
    /** Static or state-derived fill color (for filters) */
    fill?: string | ((state: any, layout: LayoutResult) => string);
    /** State key for custom fill color override */
    fillStateKey?: string;
}

/** Rectangle element configuration */
export interface RectElementConfig extends BaseElementConfig {
    type: 'rect';
    width: PositionValue;
    height: PositionValue;
    fill: string | ((state: any) => string);
    listening?: boolean;
}

/** Circle element configuration */
export interface CircleElementConfig extends BaseElementConfig {
    type: 'circle';
    radius: PositionValue;
    fill: string | ((state: any) => string);
    rotation?: number;
}

/** Group element configuration (for complex nested elements) */
export interface GroupElementConfig extends BaseElementConfig {
    type: 'group';
    /** Child elements within this group */
    children: CanvasElementConfig[];
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
export interface BackgroundElementConfig extends BaseElementConfig {
    type: 'background';
    width: number;
    height: number;
    /** State key for background color */
    colorKey?: string;
    /** Static color */
    color?: string;
}

/** Union of all element config types */
export type CanvasElementConfig =
    | TextElementConfig
    | ImageElementConfig
    | RectElementConfig
    | CircleElementConfig
    | GroupElementConfig
    | BackgroundElementConfig;

// ============================================================================
// LAYOUT CONFIGURATION
// ============================================================================

/** Layout calculation result - element positions and sizes */
export interface LayoutResult {
    [key: string]: {
        x: number;
        y: number;
        width?: number;
        height?: number;
        fontSize?: number;
        maxWidth?: number;
        lineHeight?: number;
    };
}

/** Layout calculator function */
export type LayoutCalculator<TState> = (state: TState) => LayoutResult;

// ============================================================================
// SECTION CONFIGURATION (existing, enhanced)
// ============================================================================

export interface SectionConfig<TState = any, TActions = any> {
    /** Component to render for this section */
    component: React.ComponentType<any>;
    /** Function to map canvas state and handlers to section props */
    propsFactory: (state: TState, actions: TActions, context?: {
        selectedElement: string | null;
        exportedImage?: string | null;
        autoSaveStatus?: 'idle' | 'saving' | 'saved' | 'error';
        shareToken?: string | null;
        onCaptureCanvas?: () => void;
        onDownload?: () => void;
        onNavigateToGallery?: () => void;
    }) => Record<string, any>;
}

// ============================================================================
// MULTI-PAGE CONFIGURATION
// ============================================================================

/** Multi-page configuration options */
export interface MultiPageConfig<TState> {
    /** Enable multi-page mode */
    enabled: boolean;
    /** Maximum number of pages allowed (optional, unlimited if not set) */
    maxPages?: number;
    /** Default state for new pages */
    defaultNewPageState?: Partial<TState>;
}

// ============================================================================
// FULL CANVAS CONFIGURATION
// ============================================================================

export interface FullCanvasConfig<TState = any, TActions = any> {
    /** Canvas identifier */
    id: string;
    /** Canvas dimensions */
    canvas: {
        width: number;
        height: number;
    };
    /** Sidebar tabs */
    tabs: SidebarTab[];
    /** Sidebar sections */
    sections: Record<string, SectionConfig<TState, TActions>>;
    /** Canvas elements to render */
    elements: CanvasElementConfig[];
    /** Layout calculator */
    calculateLayout: LayoutCalculator<TState>;
    /** Create initial state from props */
    createInitialState: (props: any) => TState;
    /** Create action handlers */
    createActions: (
        getState: () => TState,
        setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void,
        saveToHistory: (state: TState) => void,
        debouncedSaveToHistory: (state: TState) => void,
        callbacks: Record<string, ((val: any) => void) | undefined>
    ) => TActions;
    /** Optional function to determine disabled tabs */
    getDisabledTabs?: (state: TState) => SidebarTabId[];
    /** Optional function to determine visible tabs */
    getVisibleTabs?: (state: TState) => SidebarTabId[];
    /** Additional assets/resources */
    assets?: {
        backgroundImages?: Record<string, string>;
        textColors?: Record<string, string>;
    };
    features?: {
        icons?: boolean;
        shapes?: boolean;
    };
    /** Multi-page canvas support */
    multiPage?: MultiPageConfig<TState>;
    /** Font configuration for canvas rendering */
    fonts?: {
        /** Primary font family used in canvas (e.g., 'GrueneTypeNeue') */
        primary: string;
        /** Font size for preloading (affects text metrics) */
        fontSize: number;
        /** Whether to show loading state until font loads (default: true) */
        requireFontLoad?: boolean;
    };
}

// ============================================================================
// LEGACY SIDEBAR-ONLY CONFIG (for backward compatibility with Dreizeilen)
// ============================================================================

export interface CanvasConfig<TState = any, TActions = any> {
    /** List of tabs to display in the sidebar */
    tabs: SidebarTab[];
    /** Mapping of tab IDs to section configurations */
    sections: Record<string, SectionConfig<TState, TActions>>;
    /** Optional function to determine disabled tabs based on state */
    getDisabledTabs?: (state: TState) => SidebarTabId[];
    /** Optional function to determine visible tabs based on state/context */
    getVisibleTabs?: (state: TState) => SidebarTabId[];
}
