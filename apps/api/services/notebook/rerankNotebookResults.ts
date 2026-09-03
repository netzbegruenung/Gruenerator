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
  const { rankedIndices, scores, failed, rerankTimeMs } = await rerankPipeline({
    query: question,
    items,
    inputLimit,
    outputLimit: limit,
    minRelevance: 0.05,
    minKeep: Math.min(5, candidates.length),
    applyDiversity: true,
  });

  // Die Quellenkarte zeigt „x % Relevanz" — das ist `similarity_score` der
  // Zitation, also der RETRIEVAL-Wert. Sortiert wird die Liste aber vom
  // Cross-Encoder, und ohne Rückschreiben laufen Zahl und Reihenfolge
  // auseinander: Platz 1 trägt dann eine kleinere Zahl als Platz 3.
  //
  // Nur wenn der Rerank wirklich lief: der `failed`-Zweig gibt die
  // Eingangsreihenfolge samt Retrieval-Werten zurück, und der Sprung über den
  // Rerank (≤ 3 Ergebnisse) kommt hier gar nicht erst an.
  const rerankScoreOf = (index: number): number | undefined =>
    failed ? undefined : scores.get(index);

  const rerankedResults = rankedIndices.map((i) => {
    const result = candidates[i];
    const score = rerankScoreOf(i);
    return score === undefined ? result : { ...result, similarity: score };
  });

  // Die Zitationen lesen NICHT aus `results`, sondern aus der referencesMap —
  // dieselbe Chunk-Identität wie in `deduplicateResults` verbindet beide.
  const rerankScoreByChunk = new Map<string, number>();
  for (const i of rankedIndices) {
    const candidate = candidates[i];
    const score = rerankScoreOf(i);
    if (candidate && score !== undefined) {
      rerankScoreByChunk.set(`${candidate.document_id}:${candidate.chunk_index}`, score);
    }
  }

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
    const score = rerankScoreByChunk.get(`${ref.document_id}:${ref.chunk_index}`);
    renumberedMap[String(newIndex)] =
      score === undefined ? ref : { ...ref, similarity_score: score };
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
