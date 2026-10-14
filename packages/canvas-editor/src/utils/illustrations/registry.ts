/**
 * Illustration Registry
 *
 * Every catalog is pulled in via dynamic import only when an async lookup
 * first needs it, so none of the metadata lands in the editor-core chunk
 * (this module is reached eagerly through the render layer and action
 * factories). Sync access to the catalogs lives in the per-source modules and
 * illustrationCatalog.ts (used only inside the lazy assets chunk).
 */

import type {
  KawaiiDef,
  SvgDef,
  IllustrationDef,
  IllustrationInstance,
  KawaiiIllustrationType,
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
  KawaiiIllustrationType,
} from './types';

export { ILLUSTRATION_COLORS, KAWAII_MOODS } from './types';

// =============================================================================
// ASYNC LOADERS
// =============================================================================

let undrawAllPromise: Promise<SvgDef[]> | null = null;
function loadUndrawAll(): Promise<SvgDef[]> {
  return (undrawAllPromise ??= import('./undrawAll').then((m) => m.UNDRAW_ALL));
}

export function loadKawaiiIllustrations(): Promise<KawaiiDef[]> {
  return import('./kawaii').then((m) => m.KAWAII_ILLUSTRATIONS);
}

export function loadOpendoodlesIllustrations(): Promise<SvgDef[]> {
  return import('./opendoodles').then((m) => m.OPENDOODLES);
}

export function loadIlllustrations(): Promise<SvgDef[]> {
  return import('./illlustrations').then((m) => m.ILLLUSTRATIONS);
}

export function loadGophers(): Promise<SvgDef[]> {
  return import('./gophers').then((m) => m.GOPHERS);
}

export function loadTranshumans(): Promise<SvgDef[]> {
  return import('./transhumans').then((m) => m.TRANSHUMANS);
}

export function loadHumaaans(): Promise<SvgDef[]> {
  return import('./humaaans').then((m) => m.HUMAAANS);
}

export function loadOpenpeeps(): Promise<SvgDef[]> {
  return import('./openpeeps').then((m) => m.OPENPEEPS);
}

export function loadUndrawIllustrations(): Promise<SvgDef[]> {
  return import('./undraw').then((m) => m.UNDRAW_FEATURED);
}

export async function getAllIllustrations(): Promise<IllustrationDef[]> {
  const [kawaii, svgs] = await Promise.all([loadKawaiiIllustrations(), getAllSvgIllustrations()]);
  return [...kawaii, ...svgs];
}

export async function getAllSvgIllustrations(): Promise<SvgDef[]> {
  const sets = await Promise.all([
    loadOpendoodlesIllustrations(),
    loadIlllustrations(),
    loadGophers(),
    loadTranshumans(),
    loadHumaaans(),
    loadOpenpeeps(),
    loadUndrawAll(),
  ]);
  return sets.flat();
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getIllustrationPath(illustration: SvgDef, baseUrl = ''): string {
  return `${baseUrl}/illustrations/${illustration.source}/${illustration.filename}`;
}

export function getIllustrationThumbPath(illustration: SvgDef, baseUrl = ''): string {
  const pngFilename = illustration.filename.replace(/\.svg$/, '.png');
  return `${baseUrl}/illustrations/thumbs/${illustration.source}/${pngFilename}`;
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

  if (svgDef && svgDef.source !== 'kawaii') {
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
