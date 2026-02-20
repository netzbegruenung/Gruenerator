/**
 * Citation Utilities
 *
 * Pure functions for building and transforming citations.
 * Extracted from searchNode to enable isolated unit testing
 * (searchNode imports heavyweight services that break under Vitest).
 */

import type { SearchResult, Citation } from '../types.js';

/**
 * Human-readable labels for collection identifiers.
 */
export const COLLECTION_LABELS: Record<string, string> = {
  deutschland: 'Grundsatzprogramm',
  bundestagsfraktion: 'Bundestagsfraktion',
  'gruene-de': 'gruene.de',
  kommunalwiki: 'Kommunalwiki',
  oesterreich: 'Österreich',
  'gruene-at': 'Grüne Österreich',
  web: 'Web',
  research: 'Recherche',
  research_synthesis: 'Recherche',
  examples: 'Beispiele',
  hamburg: 'Hamburg',
  'schleswig-holstein': 'Schleswig-Holstein',
  thueringen: 'Thüringen',
  bayern: 'Bayern',
  'boell-stiftung': 'Böll-Stiftung',
};

/**
 * Human-readable labels for document content types.
 */
export const CONTENT_TYPE_LABELS: Record<string, string> = {
  presse: 'Pressemitteilung',
  pressemitteilung: 'Pressemitteilung',
  beschluss: 'Beschluss',
  antrag: 'Antrag',
  blog: 'Blogbeitrag',
  wahlprogramm: 'Wahlprogramm',
  position: 'Positionspapier',
  rede: 'Rede',
};

/**
 * Generic fallback titles that should be replaced with better alternatives.
 */
const GENERIC_TITLES = new Set(['Untitled', 'Unbekannte Quelle', 'Unknown', '']);

/**
 * Derive a meaningful citation title from available metadata.
 * Priority: real document title → URL-derived title → collection label.
 */
export function deriveCitationTitle(
  source: string | undefined,
  url: string | undefined,
  collection: string
): string {
  if (source && !GENERIC_TITLES.has(source) && source !== collection) {
    return source;
  }

  if (url) {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname
        .split('/')
        .filter((s) => s.length > 0 && !s.match(/^\d+$/));
      if (pathSegments.length > 0) {
        const lastSegment = pathSegments[pathSegments.length - 1]
          .replace(/\.[^.]+$/, '')
          .replace(/[-_]+/g, ' ')
          .trim();
        if (lastSegment.length > 2) {
          return lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1);
        }
      }
    } catch {
      // URL parsing failed, fall through
    }
  }

  return COLLECTION_LABELS[collection] || collection;
}

/**
 * Extract domain from a URL, returning undefined on failure.
 */
export function extractDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Resolve a human-readable collection name from a source identifier.
 * Handles both plain names ("web") and prefixed ("gruenerator:bundestagsfraktion").
 */
export function resolveCollectionName(source: string): string | undefined {
  const key = source.startsWith('gruenerator:') ? source.slice('gruenerator:'.length) : source;
  return COLLECTION_LABELS[key];
}

/**
 * Build citations from search results.
 * Enriched with provenance data for inline popovers and grouped source cards.
 */
export function buildCitations(results: SearchResult[]): Citation[] {
  return results
    .filter((r) => r.url)
    .slice(0, 8)
    .map((r, i) => ({
      id: i + 1,
      title: r.title,
      url: r.url || '',
      snippet: r.content.slice(0, 200),
      citedText: r.content.length > 200 ? r.content.slice(0, 500) : undefined,
      source: r.source,
      collectionName: resolveCollectionName(r.source),
      domain: extractDomain(r.url),
      relevance: r.relevance,
      contentType: r.contentType
        ? CONTENT_TYPE_LABELS[r.contentType.toLowerCase()] || r.contentType
        : undefined,
      documentId: r.documentId,
      chunkIndex: r.chunkIndex,
      similarityScore: r.similarityScore,
      collectionId: r.collectionId,
    }));
}
