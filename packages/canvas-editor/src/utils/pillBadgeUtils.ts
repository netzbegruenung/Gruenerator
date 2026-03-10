/**
 * Pill Badge Utilities
 *
 * Presets, types, and helper functions for the reusable pill badge element.
 * A pill badge is a rounded rectangle with centered text, commonly used
 * for labels like "Wusstest du?" in slider templates.
 */

import { measureTextWidthWithFont } from './textUtils';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type PillBadgeFontStyle = 'normal' | 'italic' | 'bold' | 'bold italic';

export interface PillBadgeInstance {
  id: string;
  text: string;
  x: number;
  y: number;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: PillBadgeFontStyle;
  rotation: number;
  scale: number;
  opacity: number;
  paddingX: number;
  paddingY: number;
  cornerRadius: number;
}

export interface PillBadgePreset {
  text: string;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: PillBadgeFontStyle;
  paddingX: number;
  paddingY: number;
  cornerRadius: number;
  defaultX: number;
  defaultY: number;
}

// ============================================================================
// PRESETS
// ============================================================================

export const PILL_BADGE_PRESETS: Record<string, PillBadgePreset> = {
  slider: {
    text: 'Wusstest du?',
    backgroundColor: '#005538',
    textColor: '#FFFFFF',
    fontSize: 70,
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'normal',
    paddingX: 40,
    paddingY: 16,
    cornerRadius: 50,
    defaultX: 80,
    defaultY: 120,
  },
  'slider-inverted': {
    text: 'Wusstest du?',
    backgroundColor: '#F5F1E9',
    textColor: '#005538',
    fontSize: 70,
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'normal',
    paddingX: 40,
    paddingY: 16,
    cornerRadius: 50,
    defaultX: 80,
    defaultY: 120,
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

let instanceCounter = 0;

/**
 * Generate a unique ID for pill badge instances
 */
export function generatePillBadgeId(): string {
  instanceCounter += 1;
  return `pill-badge-${Date.now()}-${instanceCounter}`;
}

/**
 * Calculate the dimensions of a pill badge based on text and styling
 */
export function calculatePillBadgeDimensions(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontStyle: PillBadgeFontStyle,
  paddingX: number,
  paddingY: number
): { width: number; height: number } {
  const textWidth = measureTextWidthWithFont(text, fontSize, fontFamily, fontStyle);
  const width = textWidth + paddingX * 2;
  const height = fontSize + paddingY * 2;
  return { width, height };
}

/**
 * Create a new pill badge instance from a preset
 *
 * @param presetId - The preset to use (e.g., 'slider', 'slider-inverted')
 * @param overrides - Optional overrides for specific properties
 */
export function createPillBadgeInstance(
  presetId: string = 'slider',
  overrides: Partial<PillBadgeInstance> = {}
): PillBadgeInstance {
  const preset = PILL_BADGE_PRESETS[presetId] ?? PILL_BADGE_PRESETS.slider;

  return {
    id: generatePillBadgeId(),
    text: preset.text,
    x: preset.defaultX,
    y: preset.defaultY,
    backgroundColor: preset.backgroundColor,
    textColor: preset.textColor,
    fontSize: preset.fontSize,
    fontFamily: preset.fontFamily,
    fontStyle: preset.fontStyle,
    rotation: 0,
    scale: 1,
    opacity: 1,
    paddingX: preset.paddingX,
    paddingY: preset.paddingY,
    cornerRadius: preset.cornerRadius,
    ...overrides,
  };
}

/**
 * Get colors for pill badge based on color scheme
 * Maps slider color schemes to pill badge colors
 */
export function getPillBadgeColorsForScheme(scheme: 'sand-tanne' | 'tanne-sand'): {
  backgroundColor: string;
  textColor: string;
} {
  if (scheme === 'tanne-sand') {
    return {
      backgroundColor: '#F5F1E9',
      textColor: '#005538',
    };
  }
  // Default: sand-tanne
  return {
    backgroundColor: '#005538',
    textColor: '#FFFFFF',
  };
}
