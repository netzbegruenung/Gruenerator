import { describe, expect, it } from 'vitest';

import { rankManualSearchResults, type RankableSearchResult } from './manualSearchRanking.js';

const doc = (
  id: string,
  similarity_score: number,
  extra: Partial<RankableSearchResult> = {}
): RankableSearchResult => ({
  document_id: id,
  relevant_content: `Inhalt von ${id}`,
  similarity_score,
  ...extra,
});

const ids = (results: RankableSearchResult[]): string[] => results.map((r) => r.document_id);

describe('rankManualSearchResults', () => {
  it('orders by score for relevance sorting', () => {
    const ranked = rankManualSearchResults({
      results: [doc('b', 0.6), doc('a', 0.9), doc('c', 0.7)],
      sortBy: 'relevance',
      limit: 30,
      minScore: 0.35,
    });

    expect(ids(ranked)).toEqual(['a', 'c', 'b']);
  });

  it('keeps the best-scoring chunk of a document that appears several times', () => {
    const ranked = rankManualSearchResults({
      results: [doc('a', 0.5), doc('a', 0.9), doc('b', 0.7)],
      sortBy: 'relevance',
      limit: 30,
      minScore: 0.35,
    });

    expect(ids(ranked)).toEqual(['a', 'b']);
    expect(ranked[0]?.similarity_score).toBe(0.9);
  });

  it('treats one source_url as one document even across document ids', () => {
    // The same page can be ingested under several ids (re-scrapes, several
    // collections); showing it twice would waste a result slot.
    const ranked = rankManualSearchResults({
      results: [
        doc('id-1', 0.8, { source_url: 'https://example.org/a' }),
        doc('id-2', 0.6, { source_url: 'https://example.org/a' }),
      ],
      sortBy: 'relevance',
      limit: 30,
      minScore: 0.35,
    });

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.document_id).toBe('id-1');
  });

  it('drops documents below the threshold', () => {
    const ranked = rankManualSearchResults({
      results: [doc('a', 0.9), doc('weak', 0.2)],
      sortBy: 'relevance',
      limit: 30,
      minScore: 0.35,
    });

    expect(ids(ranked)).toEqual(['a']);
  });

  it('keeps a document under the threshold that contains the query', () => {
    // "hitze" → "Senat verschläft Hitzeschutz": only the dense lane finds it
    // (BM25 keeps the compound whole), so its fused rank score sits at 0.33.
    const ranked = rankManualSearchResults({
      results: [
        doc('a', 0.9, { term_chunk_count: 2 }),
        doc('compound', 0.33, { term_chunk_count: 1 }),
        doc('unrelated', 0.33, { term_chunk_count: 0 }),
        doc('legacy', 0.2),
      ],
      sortBy: 'relevance',
      limit: 30,
      minScore: 0.35,
    });

    expect(ids(ranked)).toEqual(['a', 'compound']);
  });

  it('keeps a document under the threshold that covers a multi-word query', () => {
    const ranked = rankManualSearchResults({
      results: [
        doc('a', 0.9),
        doc('covered', 0.3, { covers_query: true }),
        doc('uncovered', 0.3, { covers_query: false }),
      ],
      sortBy: 'relevance',
      limit: 30,
      minScore: 0.35,
    });

    expect(ids(ranked)).toEqual(['a', 'covered']);
  });

  it('sorts by date when asked, newest first, score breaking ties', () => {
    const ranked = rankManualSearchResults({
      results: [
        doc('older', 0.9, { published_at: '2024-01-01' }),
        doc('newer-weak', 0.4, { published_at: '2026-01-01' }),
        doc('newer-strong', 0.8, { published_at: '2026-01-01' }),
      ],
      sortBy: 'date_desc',
      limit: 30,
      minScore: 0.35,
    });

    expect(ids(ranked)).toEqual(['newer-strong', 'newer-weak', 'older']);
  });

  it('sorts oldest first for date_asc', () => {
    const ranked = rankManualSearchResults({
      results: [
        doc('newer', 0.9, { published_at: '2026-01-01' }),
        doc('older', 0.5, { published_at: '2024-01-01' }),
      ],
      sortBy: 'date_asc',
      limit: 30,
      minScore: 0.35,
    });

    expect(ids(ranked)).toEqual(['older', 'newer']);
  });

  it('respects the limit', () => {
    const ranked = rankManualSearchResults({
      results: [doc('a', 0.9), doc('b', 0.8), doc('c', 0.7)],
      sortBy: 'relevance',
      limit: 2,
      minScore: 0.35,
    });

    expect(ids(ranked)).toEqual(['a', 'b']);
  });

  it('returns nothing when every candidate is below the threshold', () => {
    const ranked = rankManualSearchResults({
      results: [doc('a', 0.1), doc('b', 0.2)],
      sortBy: 'relevance',
      limit: 30,
      minScore: 0.35,
    });

    expect(ranked).toEqual([]);
  });
});
