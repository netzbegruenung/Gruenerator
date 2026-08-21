import { describe, expect, it } from 'vitest';

import { COLLECTION_SCHEMAS, OPTIMIZER_PRESETS } from './qdrantCollectionsSchema.js';

describe('optimizer presets', () => {
  // A segment never grows past max_segment_size, so a threshold at or above the
  // cap means HNSW is never built. That is not a slow build, it is permanent:
  // `documents` sat at indexed_vectors_count 0 with 33,175 points.
  it('keeps indexing_threshold below max_segment_size in every preset', () => {
    for (const [name, preset] of Object.entries(OPTIMIZER_PRESETS)) {
      expect(
        preset.indexing_threshold,
        `preset "${name}" would never build an HNSW index`
      ).toBeLessThan(preset.max_segment_size);
    }
  });
});

describe('documents collection indexes', () => {
  // documents draws its chunk_text/title/filename/user_id indexes from
  // TEXT_SEARCH_INDEXES, so a purely-filtered field is easy to forget here.
  it('indexes the fields the notebook search filters on', () => {
    const fields = COLLECTION_SCHEMAS.documents!.indexes.map((i) => i.field);
    expect(fields).toContain('document_id');
    expect(fields).toContain('source_type');
  });
});
