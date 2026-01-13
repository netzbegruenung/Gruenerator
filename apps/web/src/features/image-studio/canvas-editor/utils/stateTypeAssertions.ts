/**
 * State Type Assertions for Canvas Editor
 *
 * Centralizes type assertions for dynamic state access in the config-driven canvas system.
 * The canvas editor uses TState = Record<string, unknown> generics, which means
 * state[key] returns 'unknown'. These utilities provide type-safe extraction with
 * runtime validation and sensible defaults.
 *
 * @example
 * // Instead of: const scale = state[config.scaleKey] as number ?? 1;
 * // Use: const scale = assertAsNumber(state[config.scaleKey], 1);
 */

// ============================================================================
// PRIMITIVE TYPE ASSERTIONS
// ============================================================================

/**
 * Safely extract a number from unknown state value
 */
export function assertAsNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Safely extract a boolean from unknown state value
 */
export function assertAsBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

/**
 * Safely extract a string from unknown state value
 */
export function assertAsString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value !== null && value !== undefined) return String(value);
  return fallback;
}

// ============================================================================
// OBJECT TYPE ASSERTIONS
// ============================================================================

/**
 * Safely extract a position object { x, y } from unknown state value
 */
export function assertAsPosition(value: unknown, fallback = { x: 0, y: 0 }): { x: number; y: number } {
  if (value && typeof value === 'object' && 'x' in value && 'y' in value) {
    const obj = value as { x: unknown; y: unknown };
    return {
      x: typeof obj.x === 'number' ? obj.x : fallback.x,
      y: typeof obj.y === 'number' ? obj.y : fallback.y,
    };
  }
  return fallback;
}

/**
 * Safely extract a size object { w, h } from unknown state value
 */
export function assertAsSize(value: unknown, fallback = { w: 0, h: 0 }): { w: number; h: number } {
  if (value && typeof value === 'object' && 'w' in value && 'h' in value) {
    const obj = value as { w: unknown; h: unknown };
    return {
      w: typeof obj.w === 'number' ? obj.w : fallback.w,
      h: typeof obj.h === 'number' ? obj.h : fallback.h,
    };
  }
  return fallback;
}

/**
 * Safely extract dimensions { width, height } from unknown state value
 */
export function assertAsDimensions(
  value: unknown,
  fallback = { width: 0, height: 0 }
): { width: number; height: number } {
  if (value && typeof value === 'object' && 'width' in value && 'height' in value) {
    const obj = value as { width: unknown; height: unknown };
    return {
      width: typeof obj.width === 'number' ? obj.width : fallback.width,
      height: typeof obj.height === 'number' ? obj.height : fallback.height,
    };
  }
  return fallback;
}

/**
 * Safely extract an offset object { x, y } (alias for position, semantic clarity)
 */
export const assertAsOffset = assertAsPosition;

// ============================================================================
// ARRAY TYPE ASSERTIONS
// ============================================================================

/**
 * Safely extract a string array from unknown state value
 */
export function assertAsStringArray(value: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return fallback;
}

/**
 * Safely extract a number array from unknown state value
 */
export function assertAsNumberArray(value: unknown, fallback: number[] = []): number[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is number => typeof item === 'number');
  }
  return fallback;
}

/**
 * Safely extract a tuple of 3 numbers (common for bar offsets)
 */
export function assertAsNumberTuple3(
  value: unknown,
  fallback: [number, number, number] = [0, 0, 0]
): [number, number, number] {
  if (Array.isArray(value) && value.length >= 3) {
    return [
      typeof value[0] === 'number' ? value[0] : fallback[0],
      typeof value[1] === 'number' ? value[1] : fallback[1],
      typeof value[2] === 'number' ? value[2] : fallback[2],
    ];
  }
  return fallback;
}

// ============================================================================
// GENERIC STATE ACCESS
// ============================================================================

/**
 * Get a typed value from state by key, with fallback
 * Use when you know the expected type at call site
 */
export function getStateValue<T>(
  state: Record<string, unknown>,
  key: string | undefined,
  fallback: T
): T {
  if (!key) return fallback;
  const value = state[key];
  if (value === undefined || value === null) return fallback;
  return value as T;
}

/**
 * Get an optional typed value from state (returns undefined if not present)
 */
export function getOptionalStateValue<T>(
  state: Record<string, unknown>,
  key: string | undefined
): T | undefined {
  if (!key) return undefined;
  const value = state[key];
  if (value === undefined || value === null) return undefined;
  return value as T;
}

/**
 * Check if a state key exists and has a truthy value
 */
export function hasStateValue(state: Record<string, unknown>, key: string | undefined): boolean {
  if (!key) return false;
  const value = state[key];
  return value !== undefined && value !== null;
}

// ============================================================================
// SPECIALIZED CANVAS ASSERTIONS
// ============================================================================

/**
 * Assert a color value (string or undefined)
 */
export function assertAsColor(value: unknown, fallback?: string): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  return fallback;
}

/**
 * Assert an opacity value (number between 0 and 1)
 */
export function assertAsOpacity(value: unknown, fallback = 1): number {
  const num = assertAsNumber(value, fallback);
  return Math.max(0, Math.min(1, num));
}

/**
 * Assert a scale value (positive number)
 */
export function assertAsScale(value: unknown, fallback = 1): number {
  const num = assertAsNumber(value, fallback);
  return Math.max(0.01, num); // Minimum scale to prevent invisible elements
}

/**
 * Assert a rotation value (in degrees)
 */
export function assertAsRotation(value: unknown, fallback = 0): number {
  return assertAsNumber(value, fallback);
}
