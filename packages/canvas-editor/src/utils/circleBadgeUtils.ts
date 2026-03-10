/**
 * Circle Badge Utilities
 *
 * Presets, types, and helper functions for the reusable circle badge element.
 * A circle badge is a colored circle with multiple centered text lines,
 * commonly used for date displays in event templates.
 */

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

export const CIRCLE_BADGE_PRESETS: Record<string, CircleBadgePreset> = {
  default: {
    radius: 80,
    backgroundColor: '#005538',
    textColor: '#FFFFFF',
    textLines: [
      {
        text: 'Text',
        yOffset: 0,
        fontFamily: 'GrueneTypeNeue',
        fontSize: 32,
        fontWeight: 'bold',
      },
    ],
    defaultX: 200,
    defaultY: 200,
  },
  'default-inverted': {
    radius: 80,
    backgroundColor: '#F5F1E9',
    textColor: '#005538',
    textLines: [
      {
        text: 'Text',
        yOffset: 0,
        fontFamily: 'GrueneTypeNeue',
        fontSize: 32,
        fontWeight: 'bold',
      },
    ],
    defaultX: 200,
    defaultY: 200,
  },
};

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
  const preset = CIRCLE_BADGE_PRESETS[presetId] ?? CIRCLE_BADGE_PRESETS.default;

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
