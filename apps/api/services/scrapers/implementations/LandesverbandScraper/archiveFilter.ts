/**
 * Qdrant scroll filter for `#archiveStaleDocuments`, as a pure function.
 *
 * Own module for the same reason as recheckSchedule.ts: testable without
 * loading the scraper's Qdrant client. Wolke shares are marked
 * `age_exempt: true` at ingestion (#3564 — dating them from the file name
 * uses `ignoreMaxAge` so a real old date never fails the too_old check there).
 * The archive pass has no notion of `ignoreMaxAge` — it just re-derives
 * staleness from `published_at` — so without this exclusion a dated Wolke
 * point would survive ingestion and then get archived on the very same
 * `scrapeSource` run's cleanup pass. Excluding it in `must_not` means the
 * scroll never even loads it, rather than loading and skipping it per point.
 */
export interface QdrantMatchFilter {
  must: Array<{ key: string; match: { value: unknown } }>;
  must_not: Array<{ key: string; match: { value: unknown } }>;
}

export function staleDocumentsFilter(sourceId: string): QdrantMatchFilter {
  return {
    must: [{ key: 'source_id', match: { value: sourceId } }],
    must_not: [{ key: 'age_exempt', match: { value: true } }],
  };
}
