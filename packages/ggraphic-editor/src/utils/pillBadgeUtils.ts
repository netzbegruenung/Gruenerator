// SPDX-License-Identifier: MPL-2.0
/**
 * Pill Badge Utilities
 *
 * Presets, types, and helper functions for the reusable pill badge element.
 * A pill badge is a rounded rectangle with centered text, commonly used
 * for labels like "Wusstest du?" in slider templates.
 */

import { type PillBadgeFontStyle, type PillBadgeInstance } from '@ggraphic/core';

import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { messages } from '@ggraphic/editor/i18n/messages';

import { measureTextWidthWithFont } from './textUtils.js';

export { type PillBadgeFontStyle, type PillBadgeInstance } from '@ggraphic/core';

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

/** The presets in the active brand's colours and headline font. */
function pillBadgePresets(): Record<string, PillBadgePreset> {
  const { colors, fonts } = activeBrand();
  return {
    slider: {
      text: messages().defaults.pillBadgeText,
      backgroundColor: colors.primary,
      textColor: '#FFFFFF',
      fontSize: 70,
      fontFamily: fonts.headline,
      fontStyle: 'normal',
      paddingX: 40,
      paddingY: 16,
      cornerRadius: 50,
      defaultX: 80,
      defaultY: 120,
    },
    'slider-inverted': {
      text: messages().defaults.pillBadgeText,
      backgroundColor: colors.surface,
      textColor: colors.primary,
      fontSize: 70,
      fontFamily: fonts.headline,
      fontStyle: 'normal',
      paddingX: 40,
      paddingY: 16,
      cornerRadius: 50,
      defaultX: 80,
      defaultY: 120,
    },
  };
}

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
  const presets = pillBadgePresets();
  const preset = presets[presetId] ?? presets.slider;

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
