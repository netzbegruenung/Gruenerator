import { describe, expect, it } from 'vitest';

import {
  COLLECTION_SCHEMAS,
  getCollectionConfig,
  OPTIMIZER_PRESETS,
} from './qdrantCollectionsSchema.js';
import { SYSTEM_COLLECTIONS } from './systemCollectionsConfig.js';

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

describe('date_range filter fields', () => {
  // getDateRange scrolls with order_by, which Qdrant rejects without a range
  // index — the filter UI then shows unbounded pickers (#3711).
  it('have a range-capable index in every system collection that offers them', () => {
    for (const config of Object.values(SYSTEM_COLLECTIONS)) {
      const schema = COLLECTION_SCHEMAS[config.qdrantCollection];
      if (!schema) continue;
      for (const field of config.filterableFields ?? []) {
        if (field.type !== 'date_range') continue;
        const index = schema.indexes.find((i) => i.field === field.field);
        expect(
          index?.type,
          `${config.qdrantCollection}.${field.field} needs a datetime index`
        ).toMatch(/^(datetime|integer|float)$/);
      }
    }
  });
});

describe('vector datatype', () => {
  it('creates float16 collections as float16 and leaves the rest float32', () => {
    expect(
      getCollectionConfig(1024, COLLECTION_SCHEMAS.landtag_nrw_documents).vectors.datatype
    ).toBe('float16');
    expect(getCollectionConfig(1024, COLLECTION_SCHEMAS.documents).vectors).not.toHaveProperty(
      'datatype'
    );
  });
});
