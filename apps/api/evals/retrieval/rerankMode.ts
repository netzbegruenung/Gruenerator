/**
 * Combines a retrieval-order ranking and a rerank-order ranking into one
 * final order, three ways — the `EVAL_RERANK_MODE` arms in
 * `runRetrievalEval.ts`. Pure and index-only: the two input arrays are
 * whatever identifiers the caller assigned (an original candidate index for
 * the qa arm, a synthetic index for the notebook arm's identity mapping) —
 * this function never looks at the candidates themselves.
 *
 * `rerankOrder` may be a strict subset of `retrievalOrder`: an index present
 * in `retrievalOrder` but absent from `rerankOrder` was dropped by the
 * reranker (below `minRelevance`, or past its `outputLimit`) and is treated
 * as having no rerank rank.
 */
export type RerankMode = 'sort' | 'filter' | 'blend';

/** Same constant in both RRF terms — standard choice, not tuned here. */
const RRF_K = 60;

export function applyRerankMode(
  mode: RerankMode,
  retrievalOrder: number[],
  rerankOrder: number[],
  keepHead: number
): number[] {
  if (mode === 'sort') return [...rerankOrder];

  const rerankRankOf = new Map(rerankOrder.map((index, rank) => [index, rank]));

  if (mode === 'filter') {
    // Retrieval order for the head, but only among candidates the reranker
    // did not drop — a dropped candidate must never reappear, head or tail.
    const head = retrievalOrder.filter((index) => rerankRankOf.has(index)).slice(0, keepHead);
    const headSet = new Set(head);
    const tail = rerankOrder.filter((index) => !headSet.has(index));
    return [...head, ...tail];
  }

  // blend: reciprocal-rank fusion over the union of both orders. A dropped
  // candidate keeps its retrieval term but contributes no rerank term —
  // it stays in the list, just without the reranker's vote.
  const retrievalRankOf = new Map(retrievalOrder.map((index, rank) => [index, rank]));
  const universe = [...retrievalOrder];
  for (const index of rerankOrder) {
    if (!retrievalRankOf.has(index)) universe.push(index);
  }

  const scoreOf = (index: number): number => {
    const retrievalRank = retrievalRankOf.get(index);
    const rerankRank = rerankRankOf.get(index);
    const retrievalTerm = retrievalRank === undefined ? 0 : 1 / (RRF_K + retrievalRank + 1);
    const rerankTerm = rerankRank === undefined ? 0 : 1 / (RRF_K + rerankRank + 1);
    return retrievalTerm + rerankTerm;
  };

  return [...universe].sort((a, b) => scoreOf(b) - scoreOf(a));
}
