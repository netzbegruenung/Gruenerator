/**
 * Dreizeilen Canvas Type Definitions
 *
 * Complete TypeScript interfaces for DreizeilenCanvas state and actions.
 * These types provide full type safety for the config-based architecture.
 */

import type { AdditionalText } from './types';
import type { BalkenInstance } from '../primitives/BalkenGroup';
import type { StockImageAttribution } from '../sidebar/types';
import type { AssetInstance } from '../utils/canvasAssets';
import type { IllustrationInstance } from '../utils/illustrations/types';
import type { ShapeInstance } from '../utils/shapes';

/**
 * DreizeilenFullState
 *
 * Complete state shape for the Dreizeilen canvas.
 * Replaces the 25+ individual useState calls in the original component.
 */
export interface DreizeilenFullState {
  // === Text Content ===
  line1: string;
  line2: string;
  line3: string;

  // === Text Formatting ===
  colorSchemeId: string;
  fontSize: number;
  balkenWidthScale: number;
  barOffsets: [number, number, number]; // Per-line horizontal offsets (Feinabstimmung)

  // === Balken Position ===
  balkenOffset: { x: number; y: number }; // Group offset
  balkenOpacity: number;
  balkenScale: number; // Transform scale (from resize)
  balkenRotation: number; // Transform rotation (from rotate)

  // === Assets ===
  assetInstances: AssetInstance[];

  // === Sunflower (legacy - kept for backward compatibility) ===
  sunflowerPos: { x: number; y: number } | null;
  sunflowerSize: { w: number; h: number } | null;
  sunflowerVisible: boolean;
  sunflowerOpacity: number;

  // === Background Image ===
  currentImageSrc?: string;
  backgroundImageFile?: File | Blob | null; // Original file for base64 conversion when saving
  imageOffset: { x: number; y: number };
  imageScale: number;
  imageAttribution?: StockImageAttribution | null;
  hasBackgroundImage: boolean;
  bgImageDimensions: { width: number; height: number } | null;
  backgroundImageOpacity?: number;

  // === Icons & Shapes ===
  selectedIcons: string[];
  iconStates: Record<
    string,
    {
      x: number;
      y: number;
      scale: number;
      rotation: number;
      color?: string;
      opacity?: number;
    }
  >;
  shapeInstances: ShapeInstance[];
  selectedShapeId: string | null;

  // === Illustrations ===
  illustrationInstances: IllustrationInstance[];
  selectedIllustrationId: string | null;

  // === Additional Texts ===
  additionalTexts: AdditionalText[];

  // === Balken Instances ===
  balkenInstances: BalkenInstance[];

  // === Layer Ordering ===
  layerOrder: string[];

  // === UI State ===
  isDesktop: boolean;
  alternatives: Array<{ id: string; line1: string; line2: string; line3: string }>;

  [key: string]: unknown;
}

/**
 * DreizeilenFullActions
 *
 * Complete action interface for the Dreizeilen canvas.
 * All state mutations go through these typed actions.
 */
export interface DreizeilenFullActions {
  // === Text Actions ===
  setLine1: (text: string) => void;
  setLine2: (text: string) => void;
  setLine3: (text: string) => void;
  setFontSize: (size: number) => void;
  setColorSchemeId: (id: string) => void;
  handleSelectAlternative: (alt: {
    id: string;
    line1: string;
    line2: string;
    line3: string;
  }) => void;

  // === Balken Actions ===
  setBalkenWidthScale: (scale: number) => void;
  setBarOffsets: (offsets: [number, number, number]) => void;
  setBalkenOffset: (offset: { x: number; y: number }) => void;
  setBalkenOpacity: (opacity: number) => void;
  updateBalken: (id: string, partial: Partial<BalkenInstance>) => void;

  // === Sunflower Actions ===
  setSunflowerVisible: (visible: boolean) => void;
  setSunflowerOpacity: (opacity: number) => void;
  handleSunflowerDragEnd: (x: number, y: number) => void;
  handleSunflowerTransformEnd: (width: number, height: number) => void;

  // === Asset Actions ===
  addAsset: (assetId: string) => void;
  updateAsset: (id: string, partial: Partial<AssetInstance>) => void;
  removeAsset: (id: string) => void;

  // === Background Image Actions ===
  setCurrentImageSrc: (
    file: File | null,
    objectUrl?: string,
    attribution?: StockImageAttribution | null
  ) => void;
  setImageScale: (scale: number) => void;
  handleBackgroundImageDragEnd: (x: number, y: number) => void;
  handleBackgroundImageTransformEnd: (width: number, height: number) => void;

  // === Icon Actions ===
  toggleIcon: (iconId: string, selected: boolean) => void;
  updateIcon: (iconId: string, partial: Partial<DreizeilenFullState['iconStates'][string]>) => void;
  handleIconDragEnd: (iconId: string, x: number, y: number) => void;

  // === Shape Actions ===
  addShape: (type: 'rect' | 'circle' | 'triangle' | 'star' | 'arrow' | 'heart' | 'cloud') => void;
  updateShape: (shapeId: string, partial: Partial<ShapeInstance>) => void;
  removeShape: (shapeId: string) => void;

  // === Illustration Actions ===
  addIllustration: (id: string) => void;
  updateIllustration: (illustrationId: string, partial: Partial<IllustrationInstance>) => void;
  removeIllustration: (illustrationId: string) => void;
  duplicateIllustration: (illustrationId: string) => void;
  handleIllustrationDragEnd: (illustrationId: string, x: number, y: number) => void;
  handleIllustrationTransformEnd: (
    illustrationId: string,
    width: number,
    height: number,
    rotation?: number
  ) => void;

  // === Additional Text Actions ===
  addHeader: () => void;
  addText: () => void;
  updateAdditionalText: (textId: string, partial: Partial<AdditionalText>) => void;
  removeAdditionalText: (textId: string) => void;

  // === Layer Actions ===
  moveLayerUp: (itemId: string) => void;
  moveLayerDown: (itemId: string) => void;
  bringToFront: (itemId: string) => void;
  sendToBack: (itemId: string) => void;

  // === Reset ===
  handleReset: () => void;
}

/**
 * DreizeilenAlternative
 *
 * Type for alternative text suggestions.
 */
export interface DreizeilenAlternative {
  id: string;
  line1: string;
  line2: string;
  line3: string;
}
