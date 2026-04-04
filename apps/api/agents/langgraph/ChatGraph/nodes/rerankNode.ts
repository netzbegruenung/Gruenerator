/**
 * Rerank Node
 *
 * Uses Regolo's dedicated Rerank API (Qwen3-Reranker-4B cross-encoder)
 * to rerank search results by semantic relevance. Sits between the search
 * and respond nodes in the graph pipeline.
 *
 * After cross-encoder scoring, applies MMR diversity filtering to reduce
 * redundancy in the final result set.
 */

import { applyMMR } from '../../../../services/search/DiversityReranker.js';
import { regoloRerankService } from '../../../../services/search/RegoloRerankService.js';
import { createLogger } from '../../../../utils/logger.js';

import type { ChatGraphState, SearchResult } from '../types.js';

const log = createLogger('ChatGraph:Rerank');

const RERANK_INPUT_LIMIT = 12;
const RERANK_OUTPUT_LIMIT = 8;

/**
 * Rerank search results using Regolo's cross-encoder reranker.
 * Applies MMR diversity filtering as a second pass.
 */
export async function rerankNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  const { searchResults, searchQuery, hasTemporal, researchBrief } = state;

  // Notebook-scoped searches get higher limits for deeper recall
  const isNotebookScoped = (state.notebookCollectionIds?.length ?? 0) > 0;
  const inputLimit = isNotebookScoped ? 20 : RERANK_INPUT_LIMIT;
  const outputLimit = isNotebookScoped ? 12 : RERANK_OUTPUT_LIMIT;

  if (searchResults.length <= 2) {
    log.info(`[Rerank] Skipping — only ${searchResults.length} results`);
    return { rerankTimeMs: Date.now() - startTime };
  }

  const candidates = searchResults.slice(0, inputLimit);

  log.info(
    `[Rerank] Reranking ${candidates.length} results for query: "${searchQuery?.slice(0, 50)}..."`
  );

  try {
    const documents = candidates.map((r) => `${r.title}\n${r.content.slice(0, 300)}`);

    const instruct = hasTemporal
      ? 'Given a search query, retrieve relevant and current passages that answer the query. Prefer recent sources.'
      : undefined;

    const queryStr = researchBrief ? `${searchQuery}\n${researchBrief}` : searchQuery || '';

    const rerankResults = await regoloRerankService.rerank({
      query: queryStr,
      documents,
      topN: inputLimit,
      instruct,
    });

    const rerankTimeMs = Date.now() - startTime;

    // Map scores back onto SearchResult objects
    const scoreMap = new Map<number, number>();
    for (const r of rerankResults) {
      scoreMap.set(r.originalIndex, r.relevanceScore);
    }

    const scoredResults: SearchResult[] = candidates.map((r, i) => ({
      ...r,
      relevance: scoreMap.get(i) ?? r.relevance ?? 0.5,
    }));

    scoredResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));

    // Filter out low-relevance results
    const filtered = scoredResults.filter((r) => (r.relevance || 0) > 0.2);

    // Apply MMR diversity reranking as second pass
    const diverse = filtered.length > 3 ? applyMMR(filtered, 0.7, 2) : filtered;
    const reranked = diverse.slice(0, outputLimit);

    log.info(
      `[Rerank] Complete: ${candidates.length} → ${reranked.length} results (diversity applied) in ${rerankTimeMs}ms`
    );

    return {
      searchResults: reranked,
      rerankTimeMs,
    };
  } catch (error: any) {
    log.error('[Rerank] Error:', error.message);
    return { rerankTimeMs: Date.now() - startTime };
  }
}
