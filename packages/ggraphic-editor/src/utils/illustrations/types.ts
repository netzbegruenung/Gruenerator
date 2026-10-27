// SPDX-License-Identifier: MPL-2.0
/**
 * Shared types and constants for illustration registry
 */

// =============================================================================
// TYPES
// =============================================================================

// React Kawaii types
export type KawaiiMood = 'sad' | 'shocked' | 'happy' | 'blissful' | 'lovestruck' | 'excited' | 'ko';

export type KawaiiIllustrationType =
  | 'planet'
  | 'cat'
  | 'ghost'
  | 'iceCream'
  | 'browser'
  | 'mug'
  | 'speechBubble'
  | 'backpack'
  | 'creditCard'
  | 'file'
  | 'folder';

export interface KawaiiDef {
  id: KawaiiIllustrationType;
  name: string;
  tags: string[];
  source: 'kawaii';
}

export interface KawaiiInstance {
  id: string;
  illustrationId: KawaiiIllustrationType;
  source: 'kawaii';
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color: string;
  opacity: number;
  mood: KawaiiMood;
  flipX?: boolean;
  flipY?: boolean;
}

// SVG Illustration types
export type SvgSource =
  | 'undraw'
  | 'opendoodles'
  | 'illlustrations'
  | 'gophers'
  | 'transhumans'
  | 'humaaans'
  | 'openpeeps';

export interface SvgDef {
  id: string;
  name: string;
  filename: string;
  source: SvgSource;
  tags: string[];
  category?: string;
}

export interface SvgInstance {
  id: string;
  illustrationId: string;
  source: SvgSource;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  color?: string;
  flipX?: boolean;
  flipY?: boolean;
}

// Unified Union Types
export type IllustrationDef = KawaiiDef | SvgDef;
export type IllustrationInstance = KawaiiInstance | SvgInstance;

// =============================================================================
// SHARED CONSTANTS
// =============================================================================

export const KAWAII_MOODS: { id: KawaiiMood; label: string; emoji: string }[] = [
  { id: 'happy', label: 'Fröhlich', emoji: '😊' },
  { id: 'blissful', label: 'Glückselig', emoji: '😌' },
  { id: 'lovestruck', label: 'Verliebt', emoji: '😍' },
  { id: 'shocked', label: 'Überrascht', emoji: '😲' },
  { id: 'sad', label: 'Traurig', emoji: '😢' },
];
