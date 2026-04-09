/**
 * Rerank utility for notebook search results.
 *
 * Uses the shared rerankPipeline (Regolo cross-encoder + MMR diversity)
 * to score search results by relevance, then filters, applies diversity
 * reranking, and renumbers citations.
 */

import { createLogger } from '../../utils/logger.js';
import { rerankPipeline } from '../search/rerankPipeline.js';

import type { ExpandedChunkResult, ReferencesMap } from '../search/types.js';

const log = createLogger('NotebookRerank');

export interface RerankOptions {
  results: ExpandedChunkResult[];
  referencesMap: ReferencesMap;
  question: string;
  limit?: number;
  inputLimit?: number;
}

export interface RerankResult {
  results: ExpandedChunkResult[];
  referencesMap: ReferencesMap;
  contextSummary: string;
  rerankTimeMs: number;
}

export async function rerankNotebookResults({
  results,
  referencesMap,
  question,
  limit = 10,
  inputLimit = 20,
}: RerankOptions): Promise<RerankResult> {
  const startTime = Date.now();

  if (results.length <= 3) {
    log.info(`[Rerank] Skipping — only ${results.length} results`);
    return {
      results,
      referencesMap,
      contextSummary: buildContextSummary(referencesMap),
      rerankTimeMs: Date.now() - startTime,
    };
  }

  const candidates = results.slice(0, inputLimit);

  const items = candidates.map((r) => ({
    title: r.title,
    content: r.snippet.slice(0, 300),
    relevance: r.similarity,
  }));

  // Pipeline handles errors internally with graceful degradation
  const { rankedIndices, rerankTimeMs } = await rerankPipeline({
    query: question,
    items,
    inputLimit,
    outputLimit: limit,
    minRelevance: 0.05,
    minKeep: Math.min(5, candidates.length),
    applyDiversity: true,
  });

  const rerankedResults = rankedIndices.map((i) => candidates[i]);

  const keptDocIds = new Set(rerankedResults.map((r) => r.document_id));
  const filteredReferencesMap: ReferencesMap = {};
  for (const [key, ref] of Object.entries(referencesMap)) {
    if (keptDocIds.has(ref.document_id)) {
      filteredReferencesMap[key] = ref;
    }
  }

  const renumberedMap: ReferencesMap = {};
  let newIndex = 1;
  for (const ref of Object.values(filteredReferencesMap)) {
    renumberedMap[String(newIndex)] = ref;
    newIndex++;
  }

  log.info(
    `[Rerank] ${candidates.length} → ${rerankedResults.length} results in ${rerankTimeMs}ms`
  );

  return {
    results: rerankedResults,
    referencesMap: renumberedMap,
    contextSummary: buildContextSummary(renumberedMap),
    rerankTimeMs,
  };
}

function buildContextSummary(referencesMap: ReferencesMap): string {
  return Object.keys(referencesMap)
    .map((id) => {
      const ref = referencesMap[id];
      const snippet = ref.snippets[0]?.[0] || '';
      const short = snippet.slice(0, 400).replace(/\s+/g, ' ').trim();
      const collectionTag = ref.collection_name ? `[${ref.collection_name}] ` : '';
      return `${id}. ${collectionTag}${ref.title} — "${short}"`;
    })
    .join('\n');
}
