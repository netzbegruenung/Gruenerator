/**
 * Base Types for Canvas Config Factory
 *
 * Shared state and action types that all canvas templates use.
 * These provide the foundation for the factory pattern.
 */

import type { AssetInstance } from '../../utils/canvasAssets';
import type { ShapeInstance, ShapeType } from '../../utils/shapes';
import type { IllustrationInstance } from '../../utils/illustrations/types';
import type { AdditionalText, LayoutResult } from '../types';
import type { StockImageAttribution } from '../../../services/imageSourceService';

// ============================================================================
// SHARED STATE TYPES
// ============================================================================

/** Generic alternative type - can be string or structured object */
export type AlternativeItem =
  | string
  | { headline: string; subtext: string }
  | { line1: string; line2: string; line3: string };

/** Base state shared by ALL canvas templates */
export interface BaseCanvasState {
  isDesktop: boolean;
  alternatives: AlternativeItem[];
  assetInstances: AssetInstance[];
  selectedIcons: string[];
  iconStates: Record<string, IconState>;
  shapeInstances: ShapeInstance[];
  illustrationInstances: IllustrationInstance[];
  additionalTexts: AdditionalText[];
  [key: string]: unknown;
}

export interface IconState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color?: string;
  opacity?: number;
}

/** State for templates with image backgrounds */
export interface ImageBackgroundState {
  currentImageSrc: string;
  backgroundImageFile?: File | Blob | null;
  imageOffset: { x: number; y: number };
  imageScale: number;
  isBackgroundLocked?: boolean;
  backgroundImageOpacity?: number;
  imageAttribution?: StockImageAttribution | null;
}

/** State for templates with solid color backgrounds */
export interface ColorBackgroundState {
  backgroundColor: string;
}

/** State for 2 text fields (primary + secondary) */
export interface TwoTextFieldsState<TPrimary extends string, TSecondary extends string> {
  [key: string]: unknown;
  // Primary and secondary text content (dynamic keys)
}

/** Opacity and color overrides for text elements */
export interface TextStylingState {
  primaryOpacity?: number;
  secondaryOpacity?: number;
  primaryColor?: string;
  secondaryColor?: string;
  customPrimaryFontSize: number | null;
  customSecondaryFontSize: number | null;
}

// ============================================================================
// SHARED ACTION TYPES
// ============================================================================

/** Base actions shared by ALL canvas templates */
export interface BaseCanvasActions {
  // Asset management
  addAsset: (assetId: string) => void;
  updateAsset: (id: string, partial: Partial<AssetInstance>) => void;
  removeAsset: (id: string) => void;

  // Icon management
  toggleIcon: (id: string, selected: boolean) => void;
  updateIcon: (id: string, partial: Partial<IconState>) => void;

  // Shape management
  addShape: (type: ShapeType) => void;
  updateShape: (id: string, partial: Partial<ShapeInstance>) => void;
  removeShape: (id: string) => void;

  // Illustration management
  addIllustration: (id: string) => void;
  updateIllustration: (id: string, partial: Partial<IllustrationInstance>) => void;
  removeIllustration: (id: string) => void;

  // Additional text management
  addHeader: () => void;
  addText: () => void;
  updateAdditionalText: (id: string, partial: Partial<AdditionalText>) => void;
  removeAdditionalText: (id: string) => void;

  // Alternatives
  handleSelectAlternative: (alt: AlternativeItem) => void;
}

/** Actions for image background templates */
export interface ImageBackgroundActions {
  setCurrentImageSrc: (file: File | null, objectUrl?: string) => void;
  setImageScale: (scale: number) => void;
  toggleBackgroundLock?: () => void;
  setImageAttribution?: (attribution: StockImageAttribution | null) => void;
}

/** Actions for color background templates */
export interface ColorBackgroundActions {
  setBackgroundColor: (color: string) => void;
}

// ============================================================================
// FACTORY CONFIG TYPES
// ============================================================================

/** Text field definition */
export interface TextFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'textarea';
  placeholder?: string;
}

/** Feature flags for canvas capabilities */
export interface CanvasFeatures {
  icons?: boolean;
  shapes?: boolean;
  illustrations?: boolean;
  balken?: boolean;
}

/** Canvas dimension configuration */
export interface CanvasDimensions {
  width: number;
  height: number;
}

/** Base factory options shared by all factories */
export interface BaseFactoryOptions<TState> {
  id: string;
  canvas: CanvasDimensions;
  features?: CanvasFeatures;
  maxPages?: number;
  calculateLayout: (state: TState) => LayoutResult;
}
