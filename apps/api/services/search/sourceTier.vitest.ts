import { describe, expect, it } from 'vitest';

import { applySourceTier, SOURCE_TIER_PENALTY } from './sourceTier.js';

import type { DocumentResult } from '../BaseSearchService/types.js';

const hit = (id: string, contentType: string, score: number): DocumentResult => ({
  document_id: id,
  relevant_content: '',
  similarity_score: score,
  dense_similarity_score: score - 0.1,
  max_similarity: score,
  avg_similarity: score,
  top_chunks: [{ chunk_index: 0, content_type: contentType, preview: '', text: '' }],
  chunk_count: 1,
  term_chunk_count: 0,
  relevance_info: '',
});

const results = [hit('antrag', 'drucksache', 0.8), hit('debatte', 'plenarprotokoll', 0.8)];

describe('applySourceTier', () => {
  it('demotes protocols of a parliament collection by the penalty, both scores', () => {
    const [antrag, debatte] = applySourceTier(results, 'landtag-nrw-system', 'documents-first');
    expect(antrag).toBe(results[0]);
    expect(debatte.similarity_score).toBeCloseTo(0.8 - SOURCE_TIER_PENALTY);
    expect(debatte.dense_similarity_score).toBeCloseTo(0.7 - SOURCE_TIER_PENALTY);
    expect(results[1].similarity_score).toBe(0.8);
  });

  it('leaves everything untouched for the equal tier and without a tier', () => {
    expect(applySourceTier(results, 'landtag-nrw-system', 'equal')).toEqual(results);
    expect(applySourceTier(results, 'landtag-nrw-system', undefined)).toEqual(results);
  });

  it('leaves collections without demoted sources untouched', () => {
    expect(applySourceTier(results, 'landtag-bayern-system', 'documents-first')).toEqual(results);
  });
});
