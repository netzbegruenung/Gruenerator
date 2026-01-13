/**
 * Shared types and constants for illustration registry
 */

// =============================================================================
// TYPES
// =============================================================================

// React Kawaii types
export type KawaiiMood = 'sad' | 'shocked' | 'happy' | 'blissful' | 'lovestruck';

export type KawaiiIllustrationType =
    | 'planet' | 'cat' | 'ghost' | 'iceCream' | 'browser'
    | 'mug' | 'speechBubble' | 'backpack' | 'creditCard' | 'file' | 'folder';

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
export interface SvgDef {
    id: string;
    name: string;
    filename: string;
    source: 'undraw' | 'opendoodles';
    tags: string[];
    category?: string;
}

export interface SvgInstance {
    id: string;
    illustrationId: string;
    source: 'undraw' | 'opendoodles';
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
    { id: 'green', label: 'Grün', color: '#005538' },
    { id: 'sunflower', label: 'Sonnenblume', color: '#FFED00' },
    { id: 'magenta', label: 'Magenta', color: '#E5007D' },
    { id: 'turquoise', label: 'Türkis', color: '#009EE0' },
    { id: 'klee', label: 'Klee', color: '#6CCD87' },
    { id: 'white', label: 'Weiß', color: '#FFFFFF' },
    { id: 'black', label: 'Schwarz', color: '#262626' },
    { id: 'pink', label: 'Rosa', color: '#FFB6C1' },
] as const;

export const KAWAII_MOODS: { id: KawaiiMood; label: string; emoji: string }[] = [
    { id: 'happy', label: 'Fröhlich', emoji: '😊' },
    { id: 'blissful', label: 'Glückselig', emoji: '😌' },
    { id: 'lovestruck', label: 'Verliebt', emoji: '😍' },
    { id: 'shocked', label: 'Überrascht', emoji: '😲' },
    { id: 'sad', label: 'Traurig', emoji: '😢' },
];
