/**
 * Shared post-processing for the manual research surface (the notebook search
 * field): deduplicate per document, drop weak hits, order the survivors, cut to
 * the requested size.
 *
 * Both manual-search doors run this: `/api/research/search` (system
 * collections) and `/api/auth/notebook/:id/research-search` (user notebooks).
 * They used to carry two copies of the block, and the copies had drifted — only
 * the system-collection one reranked, so a user's own notebook got the raw
 * bi-encoder order. Keeping it here means the retrieval eval measures the same
 * code the routes serve.
 */

import { rerankPipeline } from './rerankPipeline.js';

/** The fields the ranking needs; both routers' result types satisfy this. */
export interface RankableSearchResult {
  document_id: string;
  source_url?: string | undefined;
  title?: string | undefined;
  relevant_content: string;
  similarity_score: number;
  published_at?: string | null | undefined;
}

export type ManualSearchSort = 'relevance' | 'date_desc' | 'date_asc';

export interface ManualSearchRankingOptions<T extends RankableSearchResult> {
  query: string;
  results: T[];
  sortBy: ManualSearchSort;
  /** Final result count. */
  limit: number;
  /** Documents scoring below this are dropped entirely. */
  minScore: number;
  /** Run the cross-encoder for `relevance` sorting. */
  rerank: boolean;
}

/** Cross-encoder input size; also the cap on how deep reordering can reach. */
const RERANK_INPUT_LIMIT = 30;
/** Below this many candidates the cross-encoder has nothing to reorder. */
const RERANK_MIN_CANDIDATES = 3;
/** Chars of body text handed to the cross-encoder per document. */
const RERANK_CONTENT_CHARS = 500;

function byDateThenScore<T extends RankableSearchResult>(direction: 'asc' | 'desc') {
  return (a: T, b: T): number => {
    const dateA = a.published_at || '';
    const dateB = b.published_at || '';
    if (dateA !== dateB) {
      return direction === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
    }
    return b.similarity_score - a.similarity_score;
  };
}

/**
 * Collapse chunks of the same document into one entry, keeping the best score.
 * Keyed on `source_url` because the same document can be ingested under several
 * ids (re-scrapes, multiple collections); `document_id` is the fallback.
 */
function dedupeByDocument<T extends RankableSearchResult>(results: T[]): T[] {
  const bestByKey = new Map<string, T>();
  for (const result of results) {
    const key = result.source_url || result.document_id;
    const existing = bestByKey.get(key);
    if (!existing || result.similarity_score > existing.similarity_score) {
      bestByKey.set(key, result);
    }
  }
  return Array.from(bestByKey.values());
}

/**
 * Dedupe → threshold → order → slice.
 *
 * For `relevance` the cross-encoder decides the order when enabled: bi-encoder
 * embeddings cannot tell "Artenschutz" from "Datenschutz" (both project onto
 * "Schutz" topics), while a cross-encoder reads query and document together.
 * Date sorts skip it — the order is already determined.
 */
export async function rankManualSearchResults<T extends RankableSearchResult>(
  options: ManualSearchRankingOptions<T>
): Promise<T[]> {
  const { query, results, sortBy, limit, minScore, rerank } = options;

  const deduped = dedupeByDocument(results).filter((r) => r.similarity_score >= minScore);

  if (sortBy === 'date_desc' || sortBy === 'date_asc') {
    return deduped.sort(byDateThenScore(sortBy === 'date_desc' ? 'desc' : 'asc')).slice(0, limit);
  }

  if (!rerank || deduped.length <= RERANK_MIN_CANDIDATES) {
    return deduped.sort((a, b) => b.similarity_score - a.similarity_score).slice(0, limit);
  }

  // Score order first: the cross-encoder only ever sees this many candidates,
  // so an unordered cut would hand it whichever documents happened to come
  // back first — across several collections that is concatenation order, not
  // relevance, and a strong hit past the cut can never be reranked into view.
  deduped.sort((a, b) => b.similarity_score - a.similarity_score);
  const candidates = deduped.slice(0, RERANK_INPUT_LIMIT);
  const { rankedIndices, scores } = await rerankPipeline({
    query,
    items: candidates.map((r) => ({
      title: r.title ?? '',
      content: (r.relevant_content ?? '').slice(0, RERANK_CONTENT_CHARS),
      relevance: r.similarity_score,
    })),
    inputLimit: RERANK_INPUT_LIMIT,
    outputLimit: limit,
    minRelevance: 0.05,
    minKeep: Math.min(5, candidates.length),
    applyDiversity: true,
  });

  const reranked = rankedIndices.flatMap((i) => {
    const candidate = candidates[i];
    if (!candidate) return [];
    return [{ ...candidate, similarity_score: scores.get(i) ?? candidate.similarity_score }];
  });

  return reranked.slice(0, limit);
}
