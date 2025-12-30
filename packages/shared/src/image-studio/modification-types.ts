/**
 * Image Modification Types
 * TypeScript interfaces for image modification parameters
 */

import type { ColorScheme } from './types';

// ============================================================================
// OFFSET TYPES
// ============================================================================

/** 2D offset for cross-directional controls [x, y] */
export type Offset2D = [number, number];

/** 3-element array for individual bar offsets */
export type BalkenOffset = [number, number, number];

// ============================================================================
// FONT SIZE TYPES
// ============================================================================

/** Font size preset option */
export interface FontSizeOption {
  label: 'S' | 'M' | 'L';
  value: number;
}

/** Grouped font sizes for veranstaltung (percentage-based, 100% = default) */
export interface GroupedFontSizes {
  main: number;
  circle: number;
  footer: number;
}

// ============================================================================
// COLOR TYPES
// ============================================================================

/** Single bar color (compatible with ColorScheme) */
export interface BarColor {
  background: string;
  text: string;
}

/** Full color scheme for dreizeilen (3 bars) */
export type DreizeilenColorScheme = [BarColor, BarColor, BarColor];

/** Color scheme preset with metadata */
export interface ColorSchemePreset {
  id: string;
  name: string;
  colors: DreizeilenColorScheme;
}

// ============================================================================
// MODIFICATION PARAMETERS
// ============================================================================

/** Complete modification parameters for dreizeilen type */
export interface DreizeilenModificationParams {
  fontSize: number;
  balkenOffset: BalkenOffset;
  colorScheme: DreizeilenColorScheme;
  balkenGruppenOffset: Offset2D;
  sunflowerOffset: Offset2D;
  credit: string;
}

/** Modification parameters for zitat types */
export interface ZitatModificationParams {
  fontSize: number;
}

/** Modification parameters for veranstaltung type */
export interface VeranstaltungModificationParams {
  groupedFontSizes: GroupedFontSizes;
}

/** Union type for all modification parameters */
export type ModificationParams =
  | DreizeilenModificationParams
  | ZitatModificationParams
  | VeranstaltungModificationParams;

// ============================================================================
// CONTROL CONFIGURATION
// ============================================================================

/** Configuration for a numeric range control */
export interface RangeControlConfig {
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

/** Configuration for all modification controls */
export interface ModificationControlsConfig {
  fontSize: {
    standard: RangeControlConfig;
    zitat: RangeControlConfig;
    presets: FontSizeOption[];
    zitatPresets: FontSizeOption[];
  };
  balkenOffset: RangeControlConfig & { count: 3 };
  balkenGruppe: { step: number };
  sunflower: { step: number };
  groupedFontSize: RangeControlConfig;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

/** Modification UI state */
export interface ModificationUIState {
  isAdvancedMode: boolean;
  isLoading: boolean;
  lastModificationTime: number | null;
}
