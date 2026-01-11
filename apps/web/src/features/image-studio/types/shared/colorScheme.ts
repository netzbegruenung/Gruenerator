/**
 * Unified ColorScheme type definitions for Image Studio
 *
 * This file provides the single source of truth for all color scheme types
 * used across the Image Studio feature, eliminating duplicate definitions
 * and ensuring type consistency.
 */

/**
 * Base color scheme interface used throughout Image Studio
 *
 * Represents a complete color palette with optional properties.
 * All color values should be valid CSS color strings.
 */
export interface ColorScheme {
  primary?: string;
  secondary?: string;
  background?: string;
  text?: string;
  [key: string]: string | undefined;
}

/**
 * Color scheme item with required background and optional text
 *
 * Used in template results and color scheme arrays where
 * background is mandatory but text color is optional.
 */
export interface ColorSchemeItem {
  background: string;
  text?: string;
}

/**
 * Array of color scheme items
 *
 * Commonly used for providing multiple color options
 * in generators and templates.
 */
export type ColorSchemeArray = ColorSchemeItem[];

/**
 * Type guard to check if an object is a valid ColorScheme
 */
export function isColorScheme(obj: unknown): obj is ColorScheme {
  if (!obj || typeof obj !== 'object') return false;

  const scheme = obj as Record<string, unknown>;

  // Check that all properties are either undefined or strings
  return Object.values(scheme).every(
    value => value === undefined || typeof value === 'string'
  );
}

/**
 * Type guard to check if an object is a valid ColorSchemeItem
 */
export function isColorSchemeItem(obj: unknown): obj is ColorSchemeItem {
  if (!obj || typeof obj !== 'object') return false;

  const item = obj as Record<string, unknown>;

  return (
    typeof item.background === 'string' &&
    (item.text === undefined || typeof item.text === 'string')
  );
}
