/**
 * The Grünerator's Balken presets: what a new single or three-line bar group
 * says and how it is coloured. The instance shape is the editor's
 * (`utils/balkenUtils.ts`); the words and the colour scheme are the party's.
 */

import type { BalkenInstance, BalkenMode } from '@ggraphic/editor/utils/balkenUtils';

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
