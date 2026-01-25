/**
 * Unified Tab System for Heterogeneous Multi-Page Support
 *
 * This module defines a consistent set of tabs that work across ALL template types.
 * Instead of each template defining its own tabs[], this provides a standard 5-tab
 * layout that adapts its content based on the template's capabilities.
 *
 * Benefits:
 * - No jarring tab changes when switching between pages with different templates
 * - Users learn one UI that works everywhere
 * - Content adapts within tabs rather than tabs changing
 *
 * Tab mapping:
 * | Tab ID      | Image Templates          | Color Templates           |
 * |-------------|--------------------------|---------------------------|
 * | background  | ImageBackgroundSection   | BackgroundSection         |
 * | text        | UnifiedTextSection       | UnifiedTextSection        |
 * | elements    | AssetsSection            | AssetsSection             |
 * | alternatives| AlternativesSection      | AlternativesSection       |
 * | share       | GenericShareSection      | GenericShareSection       |
 */

import { HiPhotograph } from 'react-icons/hi';
import { HiSparkles } from 'react-icons/hi';
import { FaShare } from 'react-icons/fa';
import { PiSquaresFourFill, PiTextAa } from 'react-icons/pi';

import type { SidebarTab } from '../sidebar/types';

// ============================================================================
// UNIFIED TAB IDS
// ============================================================================

/**
 * Standard tab IDs used across all templates in unified mode.
 * These replace template-specific IDs like 'image-background', 'position', etc.
 */
export type UnifiedTabId = 'background' | 'text' | 'elements' | 'alternatives' | 'share';

// ============================================================================
// UNIFIED TAB DEFINITIONS
// ============================================================================

/**
 * Standard tabs displayed for ALL templates in unified mode.
 * The content within each tab adapts based on template capabilities.
 */
export const UNIFIED_TABS: SidebarTab[] = [
  {
    id: 'background',
    icon: HiPhotograph,
    label: 'Hintergrund',
    ariaLabel: 'Hintergrund anpassen',
  },
  {
    id: 'text',
    icon: PiTextAa,
    label: 'Text',
    ariaLabel: 'Text bearbeiten',
  },
  {
    id: 'elements',
    icon: PiSquaresFourFill,
    label: 'Elemente',
    ariaLabel: 'Dekorative Elemente hinzufügen',
  },
  {
    id: 'alternatives',
    icon: HiSparkles,
    label: 'Varianten',
    ariaLabel: 'Alternative Texte anzeigen',
  },
  {
    id: 'share',
    icon: FaShare,
    label: 'Teilen',
    ariaLabel: 'Bild teilen und exportieren',
  },
];

// ============================================================================
// BACKGROUND TYPE
// ============================================================================

/**
 * Determines which background section to render.
 * - 'image': Uses ImageBackgroundSection (Unsplash, scale/offset controls)
 * - 'color': Uses BackgroundSection (color picker, no image)
 */
export type BackgroundType = 'image' | 'color';

// ============================================================================
// TEXT FIELD CONFIGURATION
// ============================================================================

/**
 * Configuration for a text field in the unified text section.
 * Templates declare their text fields, and UnifiedTextSection renders them dynamically.
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

// ============================================================================
// TEMPLATE-SPECIFIC TAB CONFIGURATIONS
// ============================================================================

/**
 * Dreizeilen has a unique "position" tab for balken controls.
 * This tab is ADDED to the unified tabs when using Dreizeilen.
 */
export const DREIZEILEN_EXTRA_TAB: SidebarTab = {
  id: 'position',
  icon: HiPhotograph, // Will be replaced with BalkenIcon when imported
  label: 'Balken',
  ariaLabel: 'Balken-Position und Stil anpassen',
};

// ============================================================================
// VISIBLE TABS HELPERS
// ============================================================================

/**
 * Standard visible tabs for most templates.
 * Excludes 'position' which is Dreizeilen-specific.
 */
export const STANDARD_VISIBLE_TABS: UnifiedTabId[] = [
  'background',
  'text',
  'elements',
  'alternatives',
  'share',
];

/**
 * Visible tabs for Dreizeilen (includes position tab).
 * Note: 'position' isn't in UnifiedTabId, so we use SidebarTabId union.
 */
export const DREIZEILEN_VISIBLE_TABS = [
  'background',
  'position',
  'text',
  'elements',
  'alternatives',
  'share',
] as const;

// ============================================================================
// TAB ORDER CONSTANTS
// ============================================================================

/**
 * Standard tab order for unified mode.
 * When templates have extra tabs, they insert at specific positions.
 */
export const TAB_ORDER = {
  background: 0,
  position: 1, // Dreizeilen-specific, inserted after background
  text: 2,
  elements: 3,
  alternatives: 4,
  share: 5,
} as const;
