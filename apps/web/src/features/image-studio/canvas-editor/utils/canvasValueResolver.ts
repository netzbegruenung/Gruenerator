import type { LayoutResult } from '../configs/types';

/**
 * Resolves a value that can be either static or a function
 *
 * Config values can be static (e.g., x: 50) or dynamic functions
 * (e.g., x: (state, layout) => layout.centerX).
 * This utility resolves both cases uniformly.
 */
export function resolveValue<T>(
    value: T | ((state: any, layout: LayoutResult) => T),
    state: any,
    layout: LayoutResult
): T {
    if (typeof value === 'function') {
        return (value as (state: any, layout: LayoutResult) => T)(state, layout);
    }
    return value;
}
