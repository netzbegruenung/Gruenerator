/**
 * Rerank utility for notebook search results.
 *
 * Uses the shared rerankPipeline (Regolo cross-encoder + MMR diversity)
 * to score search results by relevance, then filters, applies diversity
 * reranking, and renumbers citations.
 */

import { createLogger } from '../../utils/logger.js';
import { buildContextSummary } from '../search/contextSummary.js';
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

  // The cross-encoder used to judge `snippet`, which on a semantic hit is the
  // chunk's opening 300 characters and not the passage that matched — it was
  // ranking sources by their first sentences. Give it the chunk.
  //
  // Und zwar den GANZEN: das 1200er-Fenster, das hier stand, kostete dieselben
  // Punkte wie das in `rerankNode` und fiel mit ihm (#2998). Ein Chunk ist rund
  // 1500 Zeichen und durch den Indexer begrenzt — hier gab es nie etwas
  // Unbegrenztes abzuwehren. Die Decke pro Aufruf zieht `rerankPipeline`.
  const items = candidates.map((r) => {
    return {
      title: r.title,
      content: r.chunk_text || r.snippet,
      relevance: r.similarity,
    };
  });

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
