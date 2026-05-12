import type { LayoutElementResult, PositionValue } from '../types';

type LayoutNumericField = keyof LayoutElementResult;

/**
 * Reads a numeric field from a `LayoutResult` entry by element id, falling
 * back to a literal default when the layout doesn't provide it.
 *
 * Replaces the inline pattern:
 *   `(_s, l) => (l['quote-text'] as { x?: number })?.x ?? FALLBACK`
 *
 * with a typed lookup against `LayoutElementResult` (the actual shape) plus a
 * runtime number-check, so a layout entry that's missing or non-numeric
 * silently falls back instead of producing `NaN`.
 */
export function fromLayout<TState>(
  id: string,
  field: LayoutNumericField,
  fallback: number
): PositionValue<TState> {
  return (_state, layout) => {
    const entry = layout[id];
    if (!entry || typeof entry !== 'object') return fallback;
    const value = (entry as LayoutElementResult)[field];
    return typeof value === 'number' ? value : fallback;
  };
}
