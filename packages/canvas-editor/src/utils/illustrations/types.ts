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
}

// Unified Union Types
export type IllustrationDef = KawaiiDef | SvgDef;
export type IllustrationInstance = KawaiiInstance | SvgInstance;

// =============================================================================
// SHARED CONSTANTS
// =============================================================================

export const ILLUSTRATION_COLORS = [
  { id: 'tanne', label: 'Tanne', color: '#005538' },
  { id: 'klee', label: 'Klee', color: '#008939' },
  { id: 'grashalm', label: 'Grashalm', color: '#8ABD24' },
  { id: 'himmel', label: 'Himmel', color: '#0BA1DD' },
  { id: 'sand', label: 'Sand', color: '#F5F1E9' },
  { id: 'hellgruen', label: 'Hellgrün', color: '#6CCD87' },
  { id: 'dunkelgrau', label: 'Dunkelgrau', color: '#2E2E3D' },
  { id: 'white', label: 'Weiß', color: '#FFFFFF' },
  { id: 'black', label: 'Schwarz', color: '#000000' },
] as const;

export const KAWAII_MOODS: { id: KawaiiMood; label: string; emoji: string }[] = [
  { id: 'happy', label: 'Fröhlich', emoji: '😊' },
  { id: 'blissful', label: 'Glückselig', emoji: '😌' },
  { id: 'lovestruck', label: 'Verliebt', emoji: '😍' },
  { id: 'shocked', label: 'Überrascht', emoji: '😲' },
  { id: 'sad', label: 'Traurig', emoji: '😢' },
];
