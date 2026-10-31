// SPDX-License-Identifier: MPL-2.0
/**
 * Circle Badge Utilities
 *
 * Presets, types, and helper functions for the reusable circle badge element.
 * A circle badge is a colored circle with multiple centered text lines,
 * commonly used for date displays in event templates.
 */

import { type BrandPack } from '@ggraphic/core';

import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { messages } from '@ggraphic/editor/i18n/messages';

import type { CircleBadgeInstance, CircleBadgeTextLine } from '../primitives/CircleBadge.js';

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

/** The presets in a brand's colours and headline font. */
function circleBadgePresets({ colors, fonts }: BrandPack): Record<string, CircleBadgePreset> {
  return {
    default: {
      radius: 80,
      backgroundColor: colors.primary,
      textColor: '#FFFFFF',
      textLines: [
        {
          text: messages().common.text,
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
          text: messages().common.text,
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
 * @param brand - The pack the preset takes its colours and font from; the active brand by default
 */
export function createCircleBadgeInstance(
  presetId: string = 'default',
  overrides: Partial<CircleBadgeInstance> = {},
  brand: BrandPack = activeBrand()
): CircleBadgeInstance {
  const presets = circleBadgePresets(brand);
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
