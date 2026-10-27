/**
 * Circle Badge Utilities
 *
 * Presets, types, and helper functions for the reusable circle badge element.
 * A circle badge is a colored circle with multiple centered text lines,
 * commonly used for date displays in event templates.
 */

import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';

import type { CircleBadgeInstance, CircleBadgeTextLine } from '../primitives/CircleBadge';

export type { CircleBadgeInstance, CircleBadgeTextLine };

// ============================================================================
// PRESET TYPES
// ============================================================================

export interface CircleBadgePreset {
  radius: number;
  backgroundColor: string;
  textColor: string;
  textLines: CircleBadgeTextLine[];
  defaultX: number;
  defaultY: number;
}

// ============================================================================
// PRESETS
// ============================================================================

/** The presets in the active brand's colours and headline font. */
function circleBadgePresets(): Record<string, CircleBadgePreset> {
  const { colors, fonts } = activeBrand();
  return {
    default: {
      radius: 80,
      backgroundColor: colors.primary,
      textColor: '#FFFFFF',
      textLines: [
        {
          text: 'Text',
          yOffset: 0,
          fontFamily: fonts.headline,
          fontSize: 32,
          fontWeight: 'bold',
        },
      ],
      defaultX: 200,
      defaultY: 200,
    },
    'default-inverted': {
      radius: 80,
      backgroundColor: colors.surface,
      textColor: colors.primary,
      textLines: [
        {
          text: 'Text',
          yOffset: 0,
          fontFamily: fonts.headline,
          fontSize: 32,
          fontWeight: 'bold',
        },
      ],
      defaultX: 200,
      defaultY: 200,
    },
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

let instanceCounter = 0;

/**
 * Generate a unique ID for circle badge instances
 */
export function generateCircleBadgeId(): string {
  instanceCounter += 1;
  return `circle-badge-${Date.now()}-${instanceCounter}`;
}

/**
 * Create a new circle badge instance from a preset
 *
 * @param presetId - The preset to use (e.g., 'default', 'default-inverted')
 * @param overrides - Optional overrides for specific properties
 */
export function createCircleBadgeInstance(
  presetId: string = 'default',
  overrides: Partial<CircleBadgeInstance> = {}
): CircleBadgeInstance {
  const presets = circleBadgePresets();
  const preset = presets[presetId] ?? presets.default;

  return {
    id: generateCircleBadgeId(),
    x: preset.defaultX,
    y: preset.defaultY,
    radius: preset.radius,
    backgroundColor: preset.backgroundColor,
    textColor: preset.textColor,
    rotation: 0,
    scale: 1,
    opacity: 1,
    textLines: preset.textLines.map((line) => ({ ...line })),
    ...overrides,
  };
}
