/**
 * Canonical "what can the model cite" view.
 *
 * The model's `[N]` markers must align 1:1 with both:
 *   (a) the source list in the prompt's SUCHERGEBNISSE / QUELLEN block
 *   (b) the Citation[] array the renderer maps `[N]` chips back to
 *
 * Historically these two views were built independently from the same flat
 * SearchResult[] stream, with different filter rules (the citation builder
 * dropped results without a URL; the prompt block did not). When a source
 * type without a URL appeared (Wolke files — private, no public URL) the
 * prompt still numbered them, the model dutifully cited [1]/[2], and the
 * Citation array was empty — producing orphan green-circle inline markers.
 *
 * `CitableSource` is the deduped, ordered view both consumers project from.
 * By construction:
 *   `[N]` in the prompt  ↔  Citations[N-1]  ↔  Sources[N-1]
 *
 * No code outside this module decides citation eligibility or numbering.
 */

import { SOURCE_PREFIX, type SearchResult, type DocumentSourceKind } from '../types.js';

/** UI/grouping discriminator. Inferred from `SearchResult.source` prefix. */
export type CitableSourceKind =
  | 'wolke'
  | 'notebook'
  | 'document'
  | 'document_chat'
  | 'doc_mention'
  | 'web'
  | 'research'
  | 'examples'
  | 'attachment'
  | 'other';

export interface CitableSource {
  /** 1-indexed; matches `[N]` in prompt and `Citation.id`. */
  id: number;
  /** Dedup key used during grouping (debug-friendly, not persisted). */
  key: string;
  kind: CitableSourceKind;
  title: string;
  /** Optional — citation eligibility no longer hinges on URL presence. */
  url?: string | undefined;
  /** All chunks that share this source, ordered by relevance desc. */
  chunks: SearchResult[];
  /** Highest-relevance chunk; representative for snippet/metadata. */
  representative: SearchResult;
}

/**
 * Group key priority — most-specific identifier wins. Avoids both:
 *  - Over-aggregation (notebook chunks across many docs collapsing to 1 chip)
 *  - Under-aggregation (wolke chunks of one file staying as N chips)
 *
 * `documentId` (Qdrant doc-level id) > `documentSourceId` (per-fanout source)
 *    > `url` (web) > `idx:${i}` (defensive fallback for sources missing all)
 */
function dedupKey(r: SearchResult, fallbackIdx: number): string {
  if (r.documentId) return `doc:${r.documentId}`;
  if (r.documentSourceId) return `src:${r.documentSourceId}`;
  if (r.url) return `url:${r.url}`;
  return `idx:${fallbackIdx}`;
}

/**
 * Map a `SearchResult.source` string to a UI/grouping kind. Falls back to
 * `'other'` so the pipeline never throws on an unknown source prefix.
 */
export function inferSourceKind(source: string | undefined): CitableSourceKind {
  if (!source) return 'other';
  if (source.startsWith(SOURCE_PREFIX.WOLKE)) return 'wolke';
  if (source.startsWith(SOURCE_PREFIX.DOCUMENT_CHAT)) return 'document_chat';
  if (source.startsWith(SOURCE_PREFIX.GRUENERATOR)) return 'notebook';
  if (source.startsWith(`${SOURCE_PREFIX.DOCUMENT}:`)) return 'document';
  if (source === SOURCE_PREFIX.WEB || source.startsWith(`${SOURCE_PREFIX.WEB}:`)) return 'web';
  if (
    source === SOURCE_PREFIX.RESEARCH ||
    source === SOURCE_PREFIX.RESEARCH_SYNTHESIS ||
    source.startsWith(`${SOURCE_PREFIX.RESEARCH}:`)
  ) {
    return 'research';
  }
  if (source === SOURCE_PREFIX.EXAMPLES || source.startsWith(`${SOURCE_PREFIX.EXAMPLES}:`)) {
    return 'examples';
  }
  return 'other';
}

/** Optional mapping from a `DocumentSource.kind` to the matching CitableSourceKind. */
export function docKindToCitableKind(kind: DocumentSourceKind): CitableSourceKind {
  switch (kind) {
    case 'wolke':
      return 'wolke';
    case 'notebook':
      return 'notebook';
    case 'document':
      return 'document';
    case 'document_chat':
      return 'document_chat';
    case 'doc_mention':
      return 'doc_mention';
    case 'attachment':
      return 'attachment';
    case 'current_doc':
      return 'document';
    case 'connect':
      // Connect (Nango) file sources have no public URL; group as 'other',
      // matching inferSourceKind's fallback for the `connect:` source prefix.
      return 'other';
    default:
      return 'other';
  }
}

/** Hard cap mirroring the previous `buildCitations` 8-source ceiling. */
const MAX_SOURCES = 8;

/**
 * Group chunked search results into one entry per logical source. Both
 * `buildCitations` and the prompt's source block iterate this list, so by
 * construction the model's `[N]` markers map to a real Citation.
 *
 * Ordering: descending by representative-chunk relevance, then by stable
 * first-appearance for ties. Top {@link MAX_SOURCES} retained.
 */
export function buildCitableSources(results: SearchResult[]): CitableSource[] {
  const groups = new Map<string, CitableSource>();
  results.forEach((r, idx) => {
    const key = dedupKey(r, idx);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        id: 0, // assigned after sort
        key,
        kind: inferSourceKind(r.source),
        title: r.title,
        url: r.url,
        chunks: [r],
        representative: r,
      });
      return;
    }
    existing.chunks.push(r);
    // Promote whichever chunk has the highest relevance to representative; the
    // representative drives title, URL, snippet, domain — anything user-visible
    // for the chip. The full chunk array stays available for the popover.
    if ((r.relevance ?? 0) > (existing.representative.relevance ?? 0)) {
      existing.representative = r;
      existing.title = r.title;
      // Prefer a non-empty URL when promoting — don't lose a usable URL just
      // because a later chunk happened to be higher relevance but URL-less.
      if (r.url) existing.url = r.url;
    } else if (!existing.url && r.url) {
      // Backfill URL from a lower-relevance chunk if the representative lacks one.
      existing.url = r.url;
    }
  });

  // Each group's chunks: keep them sorted by relevance desc so the popover
  // displays best-first.
  for (const g of groups.values()) {
    g.chunks.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
  }

  const ordered = [...groups.values()].sort(
    (a, b) => (b.representative.relevance ?? 0) - (a.representative.relevance ?? 0)
  );

  const top = ordered.slice(0, MAX_SOURCES);
  top.forEach((s, i) => {
    s.id = i + 1;
  });
  return top;
}
