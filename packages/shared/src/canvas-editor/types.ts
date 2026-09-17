/**
 * Canvas Editor Types
 * Shared types for interactive canvas editing (web + mobile)
 */

// =============================================================================
// LEGACY TYPES (preserved for backward compatibility)
// =============================================================================

export interface CanvasState {
  foregroundX: number;
  foregroundY: number;
  foregroundScale: number;
  backgroundColor: string;
}

// =============================================================================
// TRANSFORM TYPES
// =============================================================================

export type TransformAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface TransformBounds {
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export interface TransformConfig {
  enabledAnchors: TransformAnchor[];
  rotateEnabled: boolean;
  keepRatio: boolean;
  flipEnabled: boolean;
  bounds?: TransformBounds;
}

// =============================================================================
// EXPORT TYPES
// =============================================================================

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export interface ExportOptions {
  format: ExportFormat;
  quality?: number;
  pixelRatio?: number;
  includeBackground?: boolean;
}

export interface ExportResult {
  dataUrl: string;
  width: number;
  height: number;
  format: ExportFormat;
}

// =============================================================================
// CANVAS EDITOR CONFIG
// =============================================================================

export interface CanvasEditorConfig {
  width: number;
  height: number;
  backgroundColor?: string;
  backgroundImage?: string;
  responsive?: boolean;
  maxContainerWidth?: number;
  maxContainerHeight?: number;
}

// =============================================================================
// HISTORY TYPES
// =============================================================================

export interface CanvasHistoryEntry<TComponentState = Record<string, unknown>> {
  selectedLayerIds: string[];
  timestamp: number;
  componentState?: TComponentState;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

export interface CanvasEvents {
  onExport?: (result: ExportResult) => void;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const DEFAULT_CANVAS_SIZE = 1080;
export const DEFAULT_CANVAS_HEIGHT = 1350;
export const DEFAULT_BACKGROUND_COLOR = '#005538'; // TANNE
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.0;
export const INITIAL_SCALE = 0.85;

export const CANVAS_COLORS = {
  TANNE: '#005538',
  KLEE: '#46962b',
  SONNE: '#f5a623',
  HIMMEL: '#0088cc',
  SAND: '#f5f1e9',
  WHITE: '#ffffff',
  BLACK: '#000000',
} as const;

export const DEFAULT_TRANSFORM_CONFIG: TransformConfig = {
  enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  rotateEnabled: false,
  keepRatio: true,
  flipEnabled: false,
  bounds: {
    minWidth: 20,
    minHeight: 20,
  },
};
