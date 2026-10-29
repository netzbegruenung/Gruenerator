// SPDX-License-Identifier: MPL-2.0
/**
 * Base Types for Canvas Config Factory
 *
 * Shared state and action types that all canvas templates use.
 * These provide the foundation for the factory pattern.
 */

import { type IconState } from '@ggraphic/core';

import type { AssetInstance } from '../../utils/canvasAssets.js';
import type { HostElementState } from '../../utils/canvasItem.js';
import type { AdditionalText, LayoutResult } from '../types.js';
import type { StockImageAttribution } from '@ggraphic/editor/common/imageSourceTypes';
import type { ChartInstance, ChartType } from '@ggraphic/editor/utils/chartTypes';
import type { CircleBadgeInstance } from '@ggraphic/editor/utils/circleBadgeUtils';
import type { FrameClipType, FrameInstance } from '@ggraphic/editor/utils/frameUtils';
import type { IllustrationInstance } from '@ggraphic/editor/utils/illustrations/types';
import type { PillBadgeInstance } from '@ggraphic/editor/utils/pillBadgeUtils';
import type { ShapeInstance, ShapeType } from '@ggraphic/editor/utils/shapes';
import type { TextAlign } from '@ggraphic/editor/utils/textAlign';
import type { ElementPlacement, UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';
import type { StickerRef } from '@ggraphic/schema';

export { type IconState } from '@ggraphic/core';

// ============================================================================
// SHARED STATE TYPES
// ============================================================================

/** Base state shared by ALL canvas templates, with the host kinds' lists (`HostElementKinds`). */
export interface BaseCanvasState extends HostElementState {
  isDesktop: boolean;
  assetInstances: AssetInstance[];
  selectedIcons: string[];
  iconStates: Record<string, IconState>;
  shapeInstances: ShapeInstance[];
  illustrationInstances: IllustrationInstance[];
  additionalTexts: AdditionalText[];
  pillBadgeInstances: PillBadgeInstance[];
  circleBadgeInstances: CircleBadgeInstance[];
  frameInstances: FrameInstance[];
  userImageInstances: UserImageInstance[];
  chartInstances: ChartInstance[];
  layerOrder?: string[];
  /** Gesperrte Elemente: nicht ziehen, skalieren, drehen oder löschen. */
  lockedLayerIds?: string[];
  /** Drehung der Vorlagen-Elemente (Text, Grafiken), je Element-ID in Grad. */
  templateRotations?: Record<string, number>;
  /** Gewählte Ausrichtung der Vorlagen-Texte, je Element-ID (`utils/textAlign.ts`). */
  templateTextAligns?: Record<string, TextAlign>;
  imageAttribution?: StockImageAttribution | null;
  [key: string]: unknown;
}

/** State for templates with image backgrounds */
export interface ImageBackgroundState {
  currentImageSrc: string;
  backgroundImageFile?: File | Blob | null;
  imageOffset: { x: number; y: number };
  imageScale: number;
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
  addAsset: (assetId: string, options?: ElementPlacement) => void;
  addStickerAsset: (ref: StickerRef, options?: ElementPlacement) => void;
  updateAsset: (id: string, partial: Partial<AssetInstance>) => void;
  removeAsset: (id: string) => void;

  // Icon management
  toggleIcon: (id: string, selected: boolean, options?: ElementPlacement) => void;
  updateIcon: (id: string, partial: Partial<IconState>) => void;

  // Shape management
  addShape: (type: ShapeType, color?: string, options?: ElementPlacement) => void;
  updateShape: (id: string, partial: Partial<ShapeInstance>) => void;
  removeShape: (id: string) => void;

  // Illustration management
  addIllustration: (id: string, options?: ElementPlacement) => void;
  updateIllustration: (id: string, partial: Partial<IllustrationInstance>) => void;
  removeIllustration: (id: string) => void;

  // Additional text management
  addHeader: () => void;
  addText: () => void;
  updateAdditionalText: (id: string, partial: Partial<AdditionalText>) => void;
  removeAdditionalText: (id: string) => void;

  // Pill badge management
  addPillBadge: (preset?: string) => void;
  updatePillBadge: (id: string, partial: Partial<PillBadgeInstance>) => void;
  removePillBadge: (id: string) => void;

  // Circle badge management
  addCircleBadge: (preset?: string) => void;
  updateCircleBadge: (id: string, partial: Partial<CircleBadgeInstance>) => void;
  removeCircleBadge: (id: string) => void;

  // Frame management
  addFrame: (clipType: FrameClipType, options?: ElementPlacement) => void;
  updateFrame: (id: string, partial: Partial<FrameInstance>) => void;
  removeFrame: (id: string) => void;
  setFrameImage: (id: string, file: File, objectUrl: string) => void;

  // User image management
  addUserImage: (file: File, objectUrl: string) => void;
  updateUserImage: (id: string, partial: Partial<UserImageInstance>) => void;
  removeUserImage: (id: string) => void;

  // Chart management
  addChart: (chartType: ChartType, options?: ElementPlacement) => void;
  updateChart: (id: string, partial: Partial<ChartInstance>) => void;
  removeChart: (id: string) => void;
}

/** Actions for image background templates */
export interface ImageBackgroundActions {
  setCurrentImageSrc: (file: File | null, objectUrl?: string) => void;
  setImageScale: (scale: number) => void;
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
  pillBadge?: boolean;
  circleBadge?: boolean;
  frames?: boolean;
  charts?: boolean;
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
