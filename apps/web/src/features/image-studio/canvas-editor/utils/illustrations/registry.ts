/**
 * Illustration Registry
 *
 * Loads all illustration definitions synchronously at module load time,
 * similar to how icons are loaded in canvasIcons.ts.
 */

import type {
  KawaiiDef,
  SvgDef,
  IllustrationDef,
  IllustrationInstance,
  KawaiiIllustrationType,
} from './types';

import { KAWAII_ILLUSTRATIONS } from './kawaii';
import { OPENDOODLES } from './opendoodles';
import { UNDRAW_FEATURED } from './undraw';

// Re-export types and constants for convenience
export type {
  KawaiiDef,
  SvgDef,
  IllustrationDef,
  IllustrationInstance,
  KawaiiInstance,
  SvgInstance,
  KawaiiMood,
  KawaiiIllustrationType,
} from './types';

export { ILLUSTRATION_COLORS, KAWAII_MOODS } from './types';

// =============================================================================
// STATIC EXPORTS (loaded at module initialization, like icons)
// =============================================================================

export const ALL_ILLUSTRATIONS: IllustrationDef[] = [
  ...KAWAII_ILLUSTRATIONS,
  ...OPENDOODLES,
  ...UNDRAW_FEATURED,
];

export const ALL_SVG_ILLUSTRATIONS: SvgDef[] = [...OPENDOODLES, ...UNDRAW_FEATURED];

// =============================================================================
// LEGACY ASYNC LOADERS (kept for backward compatibility)
// =============================================================================

export async function loadKawaiiIllustrations(): Promise<KawaiiDef[]> {
  return KAWAII_ILLUSTRATIONS;
}

export async function loadOpendoodlesIllustrations(): Promise<SvgDef[]> {
  return OPENDOODLES;
}

export async function loadUndrawIllustrations(): Promise<SvgDef[]> {
  return UNDRAW_FEATURED;
}

export async function getAllIllustrations(): Promise<IllustrationDef[]> {
  return ALL_ILLUSTRATIONS;
}

export async function getAllSvgIllustrations(): Promise<SvgDef[]> {
  return ALL_SVG_ILLUSTRATIONS;
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
  const kawaiiDef = kawaiiIllustrations.find((k) => k.id === illustrationId);

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
  const svgDef = allIllustrations.find((s) => s.id === illustrationId);

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
  return allIllustrations.find((ill) => ill.id === id);
}

export async function searchIllustrations(query: string): Promise<IllustrationDef[]> {
  const allIllustrations = await getAllIllustrations();
  const lowerQuery = query.toLowerCase();
  return allIllustrations.filter(
    (ill) =>
      ill.name.toLowerCase().includes(lowerQuery) ||
      ill.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
      (ill.source !== 'kawaii' && (ill as SvgDef).category?.toLowerCase().includes(lowerQuery))
  );
}

export async function getIllustrationsByCategory(category: string): Promise<SvgDef[]> {
  const allIllustrations = await getAllIllustrations();
  return allIllustrations.filter(
    (ill) => ill.source !== 'kawaii' && (ill as SvgDef).category === category
  ) as SvgDef[];
}

export async function getAllSvgCategories(): Promise<string[]> {
  const allIllustrations = await getAllIllustrations();
  const categories = new Set<string>();
  allIllustrations.forEach((ill) => {
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

// Re-export source arrays for direct access if needed
export { KAWAII_ILLUSTRATIONS, OPENDOODLES, UNDRAW_FEATURED };
