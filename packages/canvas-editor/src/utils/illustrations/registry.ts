/**
 * Illustration Registry
 *
 * Small illustration sets (kawaii, opendoodles, featured undraw) load
 * statically; the full ~1600-entry undraw catalog (~280 KB of metadata) is
 * pulled in via dynamic import only when an async lookup first needs it, so
 * it stays out of the editor-core chunk. Sync access to the full catalog
 * lives in illustrationCatalog.ts (used only inside the lazy assets chunk).
 */

import type {
  KawaiiDef,
  SvgDef,
  IllustrationDef,
  IllustrationInstance,
  KawaiiIllustrationType,
} from './types';

import { GOPHERS } from './gophers';
import { HUMAAANS } from './humaaans';
import { ILLLUSTRATIONS } from './illlustrations';
import { KAWAII_ILLUSTRATIONS } from './kawaii';
import { OPENDOODLES } from './opendoodles';
import { OPENPEEPS } from './openpeeps';
import { TRANSHUMANS } from './transhumans';
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
// ASYNC LOADERS
// =============================================================================

let undrawAllPromise: Promise<SvgDef[]> | null = null;
function loadUndrawAll(): Promise<SvgDef[]> {
  return (undrawAllPromise ??= import('./undrawAll').then((m) => m.UNDRAW_ALL));
}

export async function loadKawaiiIllustrations(): Promise<KawaiiDef[]> {
  return KAWAII_ILLUSTRATIONS;
}

export async function loadOpendoodlesIllustrations(): Promise<SvgDef[]> {
  return OPENDOODLES;
}

export async function loadIlllustrations(): Promise<SvgDef[]> {
  return ILLLUSTRATIONS;
}

export async function loadGophers(): Promise<SvgDef[]> {
  return GOPHERS;
}

export async function loadTranshumans(): Promise<SvgDef[]> {
  return TRANSHUMANS;
}

export async function loadHumaaans(): Promise<SvgDef[]> {
  return HUMAAANS;
}

export async function loadOpenpeeps(): Promise<SvgDef[]> {
  return OPENPEEPS;
}

export async function loadUndrawIllustrations(): Promise<SvgDef[]> {
  return UNDRAW_FEATURED;
}

export async function getAllIllustrations(): Promise<IllustrationDef[]> {
  const undrawAll = await loadUndrawAll();
  return [
    ...KAWAII_ILLUSTRATIONS,
    ...OPENDOODLES,
    ...ILLLUSTRATIONS,
    ...GOPHERS,
    ...TRANSHUMANS,
    ...HUMAAANS,
    ...OPENPEEPS,
    ...undrawAll,
  ];
}

export async function getAllSvgIllustrations(): Promise<SvgDef[]> {
  const undrawAll = await loadUndrawAll();
  return [
    ...OPENDOODLES,
    ...ILLLUSTRATIONS,
    ...GOPHERS,
    ...TRANSHUMANS,
    ...HUMAAANS,
    ...OPENPEEPS,
    ...undrawAll,
  ];
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

// Re-export the small static source arrays for direct access if needed.
// The full undraw catalog is intentionally NOT re-exported here — sync
// consumers use illustrationCatalog.ts so the data stays in a lazy chunk.
export {
  KAWAII_ILLUSTRATIONS,
  OPENDOODLES,
  UNDRAW_FEATURED,
  ILLLUSTRATIONS,
  GOPHERS,
  TRANSHUMANS,
  HUMAAANS,
  OPENPEEPS,
};
