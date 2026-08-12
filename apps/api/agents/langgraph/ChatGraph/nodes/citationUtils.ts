/**
 * Citation Utilities
 *
 * Pure functions for building and transforming citations.
 * Extracted from searchNode to enable isolated unit testing
 * (searchNode imports heavyweight services that break under Vitest).
 */

import { renumberCitationsInOrder } from '../../../../services/search/SearchResultProcessor.js';

import { buildCitableSources, type CitableSource } from './citableSources.js';

import type { SearchResult, Citation } from '../types.js';

/**
 * Human-readable labels for collection identifiers.
 */
export const COLLECTION_LABELS: Record<string, string> = {
  deutschland: 'Grundsatzprogramm',
  bundestagsfraktion: 'Bundestagsfraktion',
  // Official DIP records (`bundestag` intent) — a DIFFERENT source than the
  // crawled gruene-bundestag.de collection above, which is why both need a
  // label. Missing here, every DIP citation reached the renderer with
  // `collectionName: undefined`, and SourceCard/CitationPopover only print the
  // provenance line when that field is set — so the "Bundestag Wrapped" label
  // that COLLECTION_STYLES already defines was never shown on any of them.
  bundestag: 'Bundestag Wrapped',
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
  grundsatzprogramm: 'Grundsatzprogramm',
  regierungsprogramm: 'Regierungsprogramm',
  wahlpruefstein: 'Wahlprüfstein',
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
      const lastPathSegment = pathSegments[pathSegments.length - 1];
      if (lastPathSegment) {
        const lastSegment = lastPathSegment
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
 * Project a single CitableSource into the Citation shape the renderer
 * consumes. URL is `''` for sources without a public URL (private wolke
 * files, future no-URL types) — existing chip/popover code truthy-checks
 * this field, so empty-string is the safe sentinel.
 */
export function projectCitation(source: CitableSource): Citation {
  const r = source.representative;
  return {
    id: source.id,
    title: source.title || r.title,
    url: source.url ?? '',
    snippet: r.content.slice(0, 200),
    citedText: r.content.length > 50 ? r.content.slice(0, 1500) : undefined,
    source: r.source,
    collectionName: resolveCollectionName(r.source),
    domain: extractDomain(source.url),
    relevance: r.relevance,
    contentType: r.contentType
      ? CONTENT_TYPE_LABELS[r.contentType.toLowerCase()] || r.contentType
      : undefined,
    documentId: r.documentId,
    chunkIndex: r.chunkIndex,
    similarityScore: r.similarityScore,
    collectionId: r.collectionId,
    documentSourceId: typeof r.documentSourceId === 'string' ? r.documentSourceId : undefined,
  };
}

/**
 * Build citations from search results. Thin projection over the canonical
 * CitableSource[] view so the model's `[N]` markers stay in lockstep with
 * the prompt's source numbering.
 *
 * Eligibility: any source with content (URL is metadata, not a gate). This
 * fixes private-file types like Wolke that previously got dropped here.
 */
export function buildCitations(results: SearchResult[]): Citation[] {
  return buildCitableSources(results)
    .filter((s) => (s.representative.content?.length ?? 0) > 0)
    .map(projectCitation);
}

/**
 * Close the gaps a partially-citing answer leaves behind.
 *
 * The prompt numbers every retrieved source 1..N up front and the model then
 * cites a subset, so an answer using 1, 2 and 4 shipped a visible hole where 3
 * should be — and the reader cannot tell a skipped source from a lost one. The
 * notebook path has renumbered since #2137 (NotebookQAService,
 * notebookStreamCore); the web path never got wired up. This is that wiring.
 *
 * Uncited sources are dropped, matching the notebook behaviour: with no marker
 * pointing at them they are unreachable from the text. What the search actually
 * found stays visible through the tool-call chip and persisted `searchResults`.
 *
 * `Citation.id` is rewritten alongside the array order — the renderer resolves
 * `[N]` through both, so leaving either stale would swap the chips' targets.
 */
export function renumberAnswerCitations(
  text: string,
  citations: Citation[]
): { text: string; citations: Citation[] } {
  if (!text || citations.length === 0) return { text, citations };

  const byId: Record<string, Citation> = {};
  for (const citation of citations) byId[String(citation.id)] = citation;

  const { renumberedDraft, newReferencesMap } = renumberCitationsInOrder(text, byId);

  const renumbered = Object.entries(newReferencesMap)
    .map(([newId, citation]) => ({ ...citation, id: Number(newId) }))
    .sort((a, b) => a.id - b.id);

  // An answer that cited nothing at all: keep the original list rather than
  // emptying the sources panel.
  if (renumbered.length === 0) return { text, citations };

  return { text: renumberedDraft, citations: renumbered };
}
