/**
 * Per-case improved/worsened/unchanged buckets, comparing the raw rank
 * against the post-rerank rank for a single run — the "does reranking help
 * this case" question the Hit@k/MRR tables alone don't answer.
 *
 * Cases the rerank step never scored (`rerankRank === undefined`: too few
 * candidates, or the pipeline call itself failed) are excluded rather than
 * counted as "unchanged" — nothing was compared for them.
 */
export interface RerankDeltaOutcome {
  id: string;
  rank: number | null;
  rerankRank?: number | null;
}

export interface RerankDeltaResult {
  improved: string[];
  worsened: string[];
  unchanged: string[];
}

/** `null` (miss) ranks worse than any real position — same convention as compareOutcomes.ts. */
const rankOrMiss = (x: number | null): number => (x === null ? Infinity : x);

export function rerankDelta(outcomes: RerankDeltaOutcome[]): RerankDeltaResult {
  const improved: string[] = [];
  const worsened: string[] = [];
  const unchanged: string[] = [];
  for (const o of outcomes) {
    if (o.rerankRank === undefined) continue;
    const before = rankOrMiss(o.rank);
    const after = rankOrMiss(o.rerankRank);
    if (after < before) improved.push(o.id);
    else if (after > before) worsened.push(o.id);
    else unchanged.push(o.id);
  }
  return { improved, worsened, unchanged };
}
