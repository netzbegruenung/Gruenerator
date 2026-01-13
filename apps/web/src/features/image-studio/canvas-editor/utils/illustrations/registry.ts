/**
 * Lazy Illustration Registry Loader
 *
 * Dynamically loads illustration definitions on demand instead of pre-loading all 129 definitions.
 * Each source (Kawaii, OpenDoodles, Undraw) is loaded separately only when needed.
 */

import type {
    KawaiiDef,
    SvgDef,
    IllustrationDef,
    IllustrationInstance,
    KawaiiIllustrationType
} from './types';

// Re-export types and constants for convenience
export type {
    KawaiiDef,
    SvgDef,
    IllustrationDef,
    IllustrationInstance,
    KawaiiInstance,
    SvgInstance,
    KawaiiMood,
    KawaiiIllustrationType
} from './types';

export { ILLUSTRATION_COLORS, KAWAII_MOODS } from './types';

// =============================================================================
// CACHING
// =============================================================================

let kawaiiCache: KawaiiDef[] | null = null;
let opendoodlesCache: SvgDef[] | null = null;
let undrawCache: SvgDef[] | null = null;

// =============================================================================
// LAZY LOADERS
// =============================================================================

export async function loadKawaiiIllustrations(): Promise<KawaiiDef[]> {
    if (!kawaiiCache) {
        const mod = await import('./kawaii');
        kawaiiCache = mod.KAWAII_ILLUSTRATIONS;
    }
    return kawaiiCache;
}

export async function loadOpendoodlesIllustrations(): Promise<SvgDef[]> {
    if (!opendoodlesCache) {
        const mod = await import('./opendoodles');
        opendoodlesCache = mod.OPENDOODLES;
    }
    return opendoodlesCache;
}

export async function loadUndrawIllustrations(): Promise<SvgDef[]> {
    if (!undrawCache) {
        const mod = await import('./undraw');
        undrawCache = mod.UNDRAW_FEATURED;
    }
    return undrawCache;
}

export async function getAllIllustrations(): Promise<IllustrationDef[]> {
    const [kawaii, opendoodles, undraw] = await Promise.all([
        loadKawaiiIllustrations(),
        loadOpendoodlesIllustrations(),
        loadUndrawIllustrations()
    ]);
    return [...kawaii, ...opendoodles, ...undraw];
}

export async function getAllSvgIllustrations(): Promise<SvgDef[]> {
    const [opendoodles, undraw] = await Promise.all([
        loadOpendoodlesIllustrations(),
        loadUndrawIllustrations()
    ]);
    return [...opendoodles, ...undraw];
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getIllustrationPath(illustration: SvgDef): string {
    return `/illustrations/${illustration.source}/${illustration.filename}`;
}

export async function createIllustration(
    illustrationId: string,
    canvasWidth: number,
    canvasHeight: number
): Promise<IllustrationInstance> {
    const kawaiiIllustrations = await loadKawaiiIllustrations();
    const kawaiiDef = kawaiiIllustrations.find(k => k.id === illustrationId);

    if (kawaiiDef) {
        return {
            id: `ill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            illustrationId: kawaiiDef.id,
            source: 'kawaii',
            x: canvasWidth / 2 - 50,
            y: canvasHeight / 2 - 50,
            scale: 1,
            rotation: 0,
            color: '#6CCD87',
            opacity: 1,
            mood: 'happy',
        };
    }

    const allIllustrations = await getAllIllustrations();
    const svgDef = allIllustrations.find(s => s.id === illustrationId);

    if (svgDef && (svgDef.source === 'undraw' || svgDef.source === 'opendoodles')) {
        const svg = svgDef as SvgDef;
        return {
            id: `svg-ill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            illustrationId: svg.id,
            source: svg.source,
            x: canvasWidth / 2 - 100,
            y: canvasHeight / 2 - 100,
            scale: 1.0,
            rotation: 0,
            opacity: 1,
            color: '#005538',
        };
    }

    throw new Error(`Unknown illustration ID: ${illustrationId}`);
}

export async function findIllustrationById(id: string): Promise<IllustrationDef | undefined> {
    const allIllustrations = await getAllIllustrations();
    return allIllustrations.find(ill => ill.id === id);
}

export async function searchIllustrations(query: string): Promise<IllustrationDef[]> {
    const allIllustrations = await getAllIllustrations();
    const lowerQuery = query.toLowerCase();
    return allIllustrations.filter(ill =>
        ill.name.toLowerCase().includes(lowerQuery) ||
        ill.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
        (ill.source !== 'kawaii' && (ill as SvgDef).category?.toLowerCase().includes(lowerQuery))
    );
}

export async function getIllustrationsByCategory(category: string): Promise<SvgDef[]> {
    const allIllustrations = await getAllIllustrations();
    return allIllustrations.filter(ill =>
        ill.source !== 'kawaii' && (ill as SvgDef).category === category
    ) as SvgDef[];
}

export async function getAllSvgCategories(): Promise<string[]> {
    const allIllustrations = await getAllIllustrations();
    const categories = new Set<string>();
    allIllustrations.forEach(ill => {
        if (ill.source !== 'kawaii' && (ill as SvgDef).category) {
            categories.add((ill as SvgDef).category!);
        }
    });
    return Array.from(categories).sort();
}

// =============================================================================
// ALIASES FOR COMPATIBILITY
// =============================================================================

export const getSvgIllustrationsByCategory = getIllustrationsByCategory;
export const searchSvgIllustrations = searchIllustrations;

// Legacy sync exports for backward compatibility
// These will be removed once all code is updated to use async versions
export const KAWAII_ILLUSTRATIONS: KawaiiDef[] = [];
export const OPENDOODLES: SvgDef[] = [];
export const UNDRAW_FEATURED: SvgDef[] = [];
export const ALL_ILLUSTRATIONS: IllustrationDef[] = [];
export const ALL_SVG_ILLUSTRATIONS: SvgDef[] = [];
