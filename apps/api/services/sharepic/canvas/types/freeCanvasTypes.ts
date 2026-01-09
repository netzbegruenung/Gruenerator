/**
 * Type Definitions for Free Canvas API
 * Comprehensive interfaces for JSON-based canvas rendering with support for:
 * - Balkens (parallelogram bars)
 * - Illustrations (SVG assets)
 * - Shapes (geometric primitives)
 * - Icons (React Icons SSR)
 * - Multi-layer text
 */

export interface BackgroundConfig {
  type: 'color' | 'image';
  color?: string;
  imageData?: string; // base64 data URL
}

export interface BalkenLayer {
  id: string;
  mode: 'single' | 'triple';
  colorSchemeId: string;
  texts: string[];
  x: number;
  y: number;
  rotation: number;
  scale: number;
  widthScale: number;
  opacity: number;
}

export interface IllustrationLayer {
  id: string;
  source: 'undraw' | 'opendoodles' | 'kawaii';
  illustrationId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  color?: string;
  mood?: 'happy' | 'sad' | 'shocked' | 'blissful' | 'lovestruck';
}

export type ShapeType = 'rect' | 'circle' | 'triangle' | 'star' | 'arrow' | 'heart' | 'cloud';

export interface ShapeLayer {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
}

export interface IconLayer {
  id: string;
  iconId: string; // Format: "{library}-{name}" e.g. "pi-heartfill"
  x: number;
  y: number;
  size: number;
  color: string;
  rotation: number;
  opacity: number;
}

export interface TextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  fontStyle: string; // 'normal' | 'bold' | 'italic' | 'bold italic'
  color: string;
  maxWidth?: number;
  align: 'left' | 'center' | 'right';
  rotation: number;
  opacity: number;
}

export interface LayerCollection {
  balkens?: BalkenLayer[];
  illustrations?: IllustrationLayer[];
  shapes?: ShapeLayer[];
  icons?: IconLayer[];
  texts?: TextLayer[];
}

export interface FreeCanvasRequest {
  canvasWidth: number;
  canvasHeight: number;
  background: BackgroundConfig;
  layerOrder: string[];
  layers: LayerCollection;
}

export interface FreeCanvasResponse {
  success: boolean;
  image?: string; // base64 data URL
  metadata?: {
    width: number;
    height: number;
    layersRendered: number;
    renderTime: number;
  };
  error?: string;
}

export interface LayerValidationResult {
  valid: boolean;
  error?: string;
}

export interface ColorScheme {
  id: string;
  colors: Array<{
    background: string;
    text: string;
  }>;
}
