/**
 * Shared types of the former unified tab system: the text-field descriptor the
 * Text section renders from, and the template background kind.
 */

// ============================================================================
// BACKGROUND TYPE
// ============================================================================

/** Whether a template's background is a photo or a colour plane. */
export type BackgroundType = 'image' | 'color';

// ============================================================================
// TEXT FIELD CONFIGURATION
// ============================================================================

/**
 * Configuration for a text field in the unified text section.
 * Templates declare their text fields, and CombinedTextSection renders them dynamically.
 */
export interface TextFieldConfig {
  /** State key for this text field (e.g., 'quote', 'line1') */
  key: string;
  /** Display label for the field */
  label: string;
  /** Placeholder text (optional) */
  placeholder?: string;
  /** Whether to use a multiline textarea (default: true for long text) */
  multiline?: boolean;
  /** Maximum character count (optional) */
  maxLength?: number;
  /** Minimum rows for textarea (default: 3) */
  minRows?: number;
  /** State key for font size control (optional) */
  fontSizeStateKey?: string;
}
