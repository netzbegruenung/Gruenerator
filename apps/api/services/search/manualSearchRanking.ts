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
  results: T[];
  sortBy: ManualSearchSort;
  /** Final result count. */
  limit: number;
  /** Documents scoring below this are dropped entirely. */
  minScore: number;
}

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
 * No cross-encoder. It used to rank the `relevance` case here, on the
 * reasoning that bi-encoder embeddings cannot tell "Artenschutz" from
 * "Datenschutz". Measured against the live index it did the opposite of that
 * promise in this pipeline (`EVAL_PIPELINE=manual`, 12 keyword cases):
 *
 *   cross-encoder replaces retrieval order   Hit@1 25.0 %   MRR 0.309
 *   its ranking fused with retrieval (RRF)   Hit@1 41.7 %   MRR 0.542
 *   no cross-encoder                         Hit@1 75.0 %   MRR 0.787
 *
 * It is not a short-query effect: the 52 wordy Q&A queries run through this
 * same pipeline (`EVAL_CASE_KIND=qa`) also score worse with it — Hit@1 44.2 %
 * against 53.8 %. It saturates (1.000 / 0.998 / 0.995 across unrelated
 * documents) and reads only a 500-char excerpt, so it cannot see the one
 * signal a document lookup turns on: whether the document is *about* the term
 * or merely mentions it. Before reintroducing it, re-run both case sets.
 *
 * The chat and Q&A paths keep their own rerank — this finding is about
 * ranking whole documents in a search field, not about picking passages.
 */
export function rankManualSearchResults<T extends RankableSearchResult>(
  options: ManualSearchRankingOptions<T>
): T[] {
  const { results, sortBy, limit, minScore } = options;

  const deduped = dedupeByDocument(results).filter((r) => r.similarity_score >= minScore);

  if (sortBy === 'date_desc' || sortBy === 'date_asc') {
    return deduped.sort(byDateThenScore(sortBy === 'date_desc' ? 'desc' : 'asc')).slice(0, limit);
  }

  return deduped.sort((a, b) => b.similarity_score - a.similarity_score).slice(0, limit);
}
