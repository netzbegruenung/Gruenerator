/**
 * Rerank utility for notebook search results.
 *
 * Uses Regolo's dedicated Rerank API (Qwen3-Reranker-4B cross-encoder)
 * to score search results by relevance, then filters and returns the top N.
 */

import { createLogger } from '../../utils/logger.js';
import { regoloRerankService } from '../search/RegoloRerankService.js';

import type { ExpandedChunkResult } from '../search/types.js';

const log = createLogger('NotebookRerank');

export interface RerankOptions {
  results: ExpandedChunkResult[];
  referencesMap: Record<string, any>;
  question: string;
  limit?: number;
  inputLimit?: number;
}

export interface RerankResult {
  results: ExpandedChunkResult[];
  referencesMap: Record<string, any>;
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

  try {
    const documents = candidates.map((r) => `${r.title}\n${r.snippet.slice(0, 300)}`);

    const rerankResults = await regoloRerankService.rerank({
      query: question,
      documents,
      topN: limit,
    });

    const rerankTimeMs = Date.now() - startTime;

    // Map back to candidates, keeping at least MIN_KEEP results for LLM breadth
    const MIN_KEEP = Math.min(5, rerankResults.length);
    const scored = rerankResults
      .filter((r, i) => r.relevanceScore > 0.05 || i < MIN_KEEP)
      .map((r) => ({
        result: candidates[r.originalIndex],
        relevanceScore: r.relevanceScore,
      }));

    const rerankedResults = scored.map((s) => s.result);

    // Build a set of kept document_ids to filter the referencesMap
    const keptDocIds = new Set(rerankedResults.map((r) => r.document_id));
    const filteredReferencesMap: Record<string, any> = {};
    for (const [key, ref] of Object.entries(referencesMap)) {
      if (keptDocIds.has(ref.document_id)) {
        filteredReferencesMap[key] = ref;
      }
    }

    // Renumber references 1..N sequentially
    const renumberedMap: Record<string, any> = {};
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
  } catch (error: any) {
    log.error('[Rerank] Error:', error.message);
    return {
      results,
      referencesMap,
      contextSummary: buildContextSummary(referencesMap),
      rerankTimeMs: Date.now() - startTime,
    };
  }
}

function buildContextSummary(referencesMap: Record<string, any>): string {
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
