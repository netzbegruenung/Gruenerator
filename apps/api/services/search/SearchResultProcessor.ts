/**
 * SearchResultProcessor - Shared utilities for processing search results
 *
 * Consolidates search result processing logic:
 * - Expansion and deduplication
 * - Citation and reference building
 * - Source grouping by collection
 */

import type {
  SearchResultInput,
  ExpandedChunkResult,
  ReferencesMap,
  ReferenceData,
  Citation,
  Source,
  ValidationResult,
  FilterOptions,
  DedupeOptions,
  CollectionConfig,
  SourcesByCollection
} from './types.js';

/**
 * Expand document search results into individual chunk results
 */
export function expandResultsToChunks(
  results: SearchResultInput[],
  collectionId: string | null = null,
  collectionName: string | null = null
): ExpandedChunkResult[] {
  const expanded: ExpandedChunkResult[] = [];

  for (const r of results) {
    const title = r.title || r.document_title || r.filename || 'Unbenanntes Dokument';
    const topChunks = r.top_chunks || [];
    const sourceUrl = r.source_url || r.url || null;
    const docId = r.document_id || sourceUrl || '';

    if (topChunks.length > 0) {
      for (const chunk of topChunks) {
        expanded.push({
          document_id: docId,
          source_url: sourceUrl,
          title,
          snippet: chunk.preview || '',
          filename: r.filename || null,
          similarity: r.similarity_score || 0,
          chunk_index: chunk.chunk_index,
          page_number: chunk.page_number ?? null,
          ...(collectionId && { collection_id: collectionId }),
          ...(collectionName && { collection_name: collectionName })
        });
      }
    } else {
      expanded.push({
        document_id: docId,
        source_url: sourceUrl,
        title,
        snippet: r.relevant_content || r.chunk_text || '',
        filename: r.filename || null,
        similarity: typeof r.similarity_score === 'number' ? r.similarity_score : 0,
        chunk_index: r.chunk_index || 0,
        page_number: null,
        ...(collectionId && { collection_id: collectionId }),
        ...(collectionName && { collection_name: collectionName })
      });
    }
  }

  return expanded;
}

/**
 * Deduplicate results by document ID and chunk index
 */
export function deduplicateResults(
  results: ExpandedChunkResult[],
  includeCollectionInKey: boolean = false
): ExpandedChunkResult[] {
  const keySet = new Set<string>();
  const deduped: ExpandedChunkResult[] = [];

  for (const r of results) {
    const key = includeCollectionInKey
      ? `${r.collection_id}:${r.document_id}:${r.chunk_index}`
      : `${r.document_id}:${r.chunk_index}`;

    if (keySet.has(key)) continue;
    keySet.add(key);
    deduped.push(r);
  }

  return deduped;
}

/**
 * Build references map from search results for citation processing
 */
export function buildReferencesMap(results: ExpandedChunkResult[]): ReferencesMap {
  const referencesMap: ReferencesMap = {};

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const id = String(i + 1);

    referencesMap[id] = {
      title: r.title,
      snippets: [[r.snippet]],
      description: null,
      date: new Date().toISOString(),
      source: 'qa_documents',
      document_id: r.document_id,
      source_url: r.source_url || null,
      filename: r.filename,
      similarity_score: r.similarity,
      chunk_index: r.chunk_index,
      page_number: r.page_number,
      ...(r.collection_id && { collection_id: r.collection_id }),
      ...(r.collection_name && { collection_name: r.collection_name })
    };
  }

  return referencesMap;
}

/**
 * Validate draft content and inject citation markers
 */
export function validateAndInjectCitations(draft: string, referencesMap: ReferencesMap): ValidationResult {
  const validIds = new Set(Object.keys(referencesMap));
  const errors: string[] = [];

  let content = draft.replace(/^```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/m, '$1');

  content = content.replace(/\n+Quellen:[\s\S]*$/i, '');

  content = content.replace(/\[(\s*\d+(?:\s*,\s*\d+)+\s*)\]/g, (m, inner) => {
    const nums = inner.split(',').map((s: string) => s.trim()).filter(Boolean);
    return nums.map((n: string) => `[${n}]`).join('');
  });

  const usedIds = new Set<string>();
  const citationPattern = /\[(\d+)\]/g;
  let match;

  while ((match = citationPattern.exec(content)) !== null) {
    const n = match[1];
    if (validIds.has(n)) {
      usedIds.add(n);
    } else {
      errors.push(`Invalid citation [${n}]`);
    }
  }

  for (const id of usedIds) {
    const re = new RegExp(`\\[${id}\\]`, 'g');
    content = content.replace(re, `⚡CITE${id}⚡`);
  }

  const citations: Citation[] = [...usedIds].map(id => {
    const ref = referencesMap[id];
    return {
      index: id,
      cited_text: ref.snippets[0]?.[0] || '',
      document_title: ref.title,
      document_id: ref.document_id,
      source_url: ref.source_url || null,
      similarity_score: ref.similarity_score,
      chunk_index: ref.chunk_index,
      filename: ref.filename,
      page_number: ref.page_number,
      ...(ref.collection_id && { collection_id: ref.collection_id }),
      ...(ref.collection_name && { collection_name: ref.collection_name })
    };
  });

  const byDoc = new Map<string, {
    document_id: string;
    document_title: string;
    source_url: string | null;
    chunk_texts: string[];
    similarity_scores: number[];
    citations: Citation[];
  }>();

  for (const c of citations) {
    const key = c.document_id || c.document_title;
    if (!byDoc.has(key)) {
      byDoc.set(key, {
        document_id: c.document_id,
        document_title: c.document_title,
        source_url: c.source_url || null,
        chunk_texts: [c.cited_text],
        similarity_scores: [c.similarity_score],
        citations: []
      });
    } else {
      const doc = byDoc.get(key)!;
      doc.chunk_texts.push(c.cited_text);
      doc.similarity_scores.push(c.similarity_score);
    }
    byDoc.get(key)!.citations.push(c);
  }

  const sources: Source[] = [...byDoc.values()].map(source => ({
    document_id: source.document_id,
    document_title: source.document_title,
    source_url: source.source_url || null,
    chunk_text: source.chunk_texts.join(' [...] '),
    similarity_score: Math.max(...source.similarity_scores),
    citations: source.citations
  }));

  return {
    cleanDraft: content,
    citations,
    sources,
    errors: errors.length > 0 ? errors : null
  };
}

/**
 * Renumber citations in order of appearance for logical UX
 */
export function renumberCitationsInOrder(
  draft: string,
  originalReferencesMap: ReferencesMap
): { renumberedDraft: string; newReferencesMap: ReferencesMap } {
  const citationPattern = /\[(\d+)\]/g;
  const seenOrder: string[] = [];
  let match;

  while ((match = citationPattern.exec(draft)) !== null) {
    const id = match[1];
    if (!seenOrder.includes(id) && originalReferencesMap[id]) {
      seenOrder.push(id);
    }
  }

  const oldToNew: { [oldId: string]: string } = {};
  seenOrder.forEach((oldId, index) => {
    oldToNew[oldId] = String(index + 1);
  });

  let renumberedDraft = draft;
  for (const [oldId, newId] of Object.entries(oldToNew)) {
    const re = new RegExp(`\\[${oldId}\\]`, 'g');
    renumberedDraft = renumberedDraft.replace(re, `⟦${newId}⟧`);
  }
  renumberedDraft = renumberedDraft.replace(/⟦(\d+)⟧/g, '[$1]');

  const newReferencesMap: ReferencesMap = {};
  for (const [oldId, newId] of Object.entries(oldToNew)) {
    newReferencesMap[newId] = originalReferencesMap[oldId];
  }

  return { renumberedDraft, newReferencesMap };
}

/**
 * Sort results by similarity score and apply quality threshold
 */
export function filterAndSortResults(
  results: ExpandedChunkResult[],
  options: FilterOptions = {}
): ExpandedChunkResult[] {
  const { threshold = 0.35, limit = 40 } = options;

  return results
    .filter(r => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * Group sources by collection for multi-collection responses
 */
export function groupSourcesByCollection(
  citations: Citation[],
  allResults: ExpandedChunkResult[],
  collectionsConfig: { [collectionId: string]: CollectionConfig }
): SourcesByCollection {
  const sourcesByCollection: SourcesByCollection = {};

  for (const [collectionId, config] of Object.entries(collectionsConfig)) {
    const collectionCitations = citations.filter(c => c.collection_id === collectionId);
    const collectionResults = allResults.filter(r => r.collection_id === collectionId);
    const citedDocChunks = new Set(collectionCitations.map(c => `${c.document_id}:${c.chunk_index}`));

    const byDoc = new Map<string, {
      document_id: string;
      document_title: string;
      source_url: string | null;
      chunk_texts: string[];
      similarity_scores: number[];
      citations: Citation[];
    }>();

    for (const c of collectionCitations) {
      const key = c.document_id || c.document_title;
      if (!byDoc.has(key)) {
        byDoc.set(key, {
          document_id: c.document_id,
          document_title: c.document_title,
          source_url: c.source_url || null,
          chunk_texts: [c.cited_text],
          similarity_scores: [c.similarity_score],
          citations: []
        });
      } else {
        const doc = byDoc.get(key)!;
        doc.chunk_texts.push(c.cited_text);
        doc.similarity_scores.push(c.similarity_score);
      }
      byDoc.get(key)!.citations.push(c);
    }

    const sources: Source[] = [...byDoc.values()].map(source => ({
      document_id: source.document_id,
      document_title: source.document_title,
      source_url: source.source_url || null,
      chunk_text: source.chunk_texts.join(' [...] '),
      similarity_score: Math.max(...source.similarity_scores),
      citations: source.citations
    }));

    const allSources: ExpandedChunkResult[] = collectionResults
      .filter(r => !citedDocChunks.has(`${r.document_id}:${r.chunk_index}`))
      .map(r => r);

    sourcesByCollection[collectionId] = {
      name: config.name,
      sources,
      allSources
    };
  }

  return sourcesByCollection;
}

/**
 * Normalize a single search result for consistent processing
 */
export function normalizeSearchResult(r: any): ExpandedChunkResult {
  const title = r.title || r.document_title || r.filename || 'Unbenanntes Dokument';
  const snippet = (r.relevant_content || r.chunk_text || r.content || r.snippet || '').slice(0, 500);
  const top = r.top_chunks?.[0] || {};
  return {
    document_id: r.document_id || '',
    title,
    snippet,
    filename: r.filename || null,
    similarity: typeof r.similarity_score === 'number' ? r.similarity_score : 0,
    chunk_index: (top.chunk_index ?? r.chunk_index) || 0,
    page_number: top.page_number ?? null,
    source_url: r.source_url || r.url || null
  };
}

/**
 * Deduplicate and diversify results with per-document limits
 */
export function dedupeAndDiversify(
  results: ExpandedChunkResult[],
  opts: DedupeOptions = {}
): ExpandedChunkResult[] {
  const limitPerDoc = opts.limitPerDoc ?? 4;
  const maxTotal = opts.maxTotal ?? 12;

  const sorted = [...results].sort((a, b) =>
    (b.similarity - a.similarity) || String(a.title).localeCompare(String(b.title))
  );

  const seenPerDoc = new Map<string, number>();
  const out: ExpandedChunkResult[] = [];

  for (const r of sorted) {
    const key = r.document_id || r.source_url || r.title;
    const count = seenPerDoc.get(key) || 0;
    if (count >= limitPerDoc) continue;
    seenPerDoc.set(key, count + 1);
    out.push(r);
    if (out.length >= maxTotal) break;
  }

  return out;
}

/**
 * Summarize references map for AI prompts
 */
export function summarizeReferencesForPrompt(refMap: ReferencesMap, maxChars: number = 4000): string {
  const lines: string[] = [];
  for (const id of Object.keys(refMap)) {
    const ref = refMap[id];
    const snippet = Array.isArray(ref.snippets) && ref.snippets[0] && Array.isArray(ref.snippets[0])
      ? String(ref.snippets[0].join(' '))
      : '';
    const short = snippet.slice(0, 150).replace(/\s+/g, ' ').trim();
    lines.push(`${id}. ${ref.title} — "${short}"`);
  }
  const joined = lines.join('\n');
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined;
}

/**
 * Parse AI JSON response with code fence stripping and fallback
 */
export function parseAIJsonResponse(content: string, fallback: any = {}): any {
  try {
    if (!content) return fallback;
    let clean = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/g, '')
      .replace(/\*\*/g, '')
      .trim();
    return JSON.parse(clean);
  } catch (e) {
    return fallback;
  }
}
