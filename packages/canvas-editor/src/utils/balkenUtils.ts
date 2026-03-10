/**
 * Balken Utilities
 *
 * Presets, types, and helper functions for the reusable balken (parallelogram bar) element.
 * A balken group renders 1 or 3 skewed bars with text, used as a branded decorative element.
 */

import type { BalkenInstance, BalkenMode } from '../primitives/BalkenGroup';

export type { BalkenInstance, BalkenMode };

// ============================================================================
// PRESET TYPES
// ============================================================================

export interface BalkenPreset {
  mode: BalkenMode;
  colorSchemeId: string;
  texts: string[];
  widthScale: number;
}

// ============================================================================
// PRESETS
// ============================================================================

export const BALKEN_PRESETS: Record<string, BalkenPreset> = {
  single: {
    mode: 'single',
    colorSchemeId: 'tanne-sand',
    texts: ['GRÜNE'],
    widthScale: 1,
  },
  triple: {
    mode: 'triple',
    colorSchemeId: 'tanne-sand',
    texts: ['DIE', 'GRÜNEN', 'BEGRÜNUNG'],
    widthScale: 1,
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

let instanceCounter = 0;

/**
 * Generate a unique ID for balken instances
 */
export function generateBalkenId(): string {
  instanceCounter += 1;
  return `balken-${Date.now()}-${instanceCounter}`;
}

/**
 * Create a new balken instance from a preset mode
 *
 * @param mode - 'single' or 'triple'
 * @param overrides - Optional overrides for specific properties
 */
export function createBalkenInstanceFromPreset(
  mode: BalkenMode,
  overrides: Partial<BalkenInstance> = {}
): BalkenInstance {
  const preset = BALKEN_PRESETS[mode] ?? BALKEN_PRESETS.single;

  return {
    id: generateBalkenId(),
    mode: preset.mode,
    colorSchemeId: preset.colorSchemeId,
    widthScale: preset.widthScale,
    offset: { x: 0, y: 0 },
    scale: 1,
    texts: [...preset.texts],
    rotation: 0,
    opacity: 1,
    ...overrides,
  };
}
