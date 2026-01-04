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

export interface ProfilbildCanvasProps {
  transparentImage: string;
  backgroundColor?: string;
  canvasSize?: number;
  onExport: (base64: string) => void;
  onCancel: () => void;
}

// =============================================================================
// LAYER TYPES
// =============================================================================

export type LayerType = 'image' | 'text' | 'shape';

export interface BaseLayer {
  id: string;
  type: LayerType;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  visible: boolean;
  locked: boolean;
}

export interface ImageLayer extends BaseLayer {
  type: 'image';
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  opacity: number;
}

export interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: 'normal' | 'italic' | 'bold' | 'bold italic';
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  lineHeight?: number;
  wrap: 'word' | 'char' | 'none';
  padding?: number;
}

export type ShapeType = 'rect' | 'circle' | 'ellipse' | 'line';

export interface ShapeLayer extends BaseLayer {
  type: 'shape';
  shapeType: ShapeType;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius?: number;
  points?: number[];
}

export type Layer = ImageLayer | TextLayer | ShapeLayer;

// =============================================================================
// TRANSFORM TYPES
// =============================================================================

export type TransformAnchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

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

export interface CanvasHistoryEntry {
  layers: Layer[];
  selectedLayerIds: string[];
  timestamp: number;
  componentState?: Record<string, unknown>;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

export interface CanvasEvents {
  onLayerSelect?: (layerIds: string[]) => void;
  onLayerChange?: (layer: Layer) => void;
  onLayerAdd?: (layer: Layer) => void;
  onLayerRemove?: (layerId: string) => void;
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

export const DEFAULT_TEXT_LAYER: Omit<TextLayer, 'id' | 'x' | 'y' | 'width' | 'height' | 'text'> = {
  type: 'text',
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  visible: true,
  locked: false,
  fontFamily: 'Arial',
  fontSize: 24,
  fontStyle: 'normal',
  textAlign: 'left',
  verticalAlign: 'top',
  fill: '#000000',
  wrap: 'word',
  lineHeight: 1.2,
};
