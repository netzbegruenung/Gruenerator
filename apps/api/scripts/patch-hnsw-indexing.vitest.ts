import { describe, expect, it } from 'vitest';

import { type CollectionIndexInfo, planHnswPatch } from './patch-hnsw-indexing.js';

// landesverbaende_documents' live (working) config — 10000 against 20000, per
// the schema comment in qdrantCollectionsSchema.ts.
const MEDIUM_PRESET = { indexing_threshold: 10000, max_segment_size: 20000 };

function info(overrides: Partial<CollectionIndexInfo>): CollectionIndexInfo {
  return {
    indexingThreshold: null,
    maxSegmentSize: null,
    pointsCount: 0,
    indexedVectorsCount: 0,
    status: 'green',
    ...overrides,
  };
}

describe('planHnswPatch', () => {
  it('skips a collection whose threshold is already at the target and has a built index', () => {
    const plan = planHnswPatch(
      info({
        indexingThreshold: 10000,
        maxSegmentSize: 20000,
        pointsCount: 47584,
        indexedVectorsCount: 47584,
      }),
      MEDIUM_PRESET
    );

    expect(plan).toEqual({ action: 'skip', target: 10000, reason: 'already indexed' });
  });

  it('patches a collection whose threshold sits at or above max_segment_size (the #3119 bug)', () => {
    const plan = planHnswPatch(
      info({
        indexingThreshold: 20000,
        maxSegmentSize: 20000,
        pointsCount: 47584,
        indexedVectorsCount: 0,
      }),
      MEDIUM_PRESET
    );

    expect(plan.action).toBe('patch');
    expect(plan.target).toBe(10000);
    expect(plan.reason).toContain('above the 10000 target');
  });

  it('patches a collection that never had optimizers_config set (null threshold)', () => {
    // Qdrant defaults an unset indexing_threshold to 20000 internally — at or
    // above every preset's max_segment_size, so this must patch too.
    const plan = planHnswPatch(
      info({ indexingThreshold: null, maxSegmentSize: null, pointsCount: 968 }),
      MEDIUM_PRESET
    );

    expect(plan.action).toBe('patch');
    expect(plan.target).toBe(10000);
    expect(plan.reason).toContain('unset');
  });

  it('re-sends the same threshold when it is already fine but indexed_vectors_count is 0', () => {
    // A stalled optimizer ("grey": optimizations pending, awaiting an update
    // operation) resumes on any update-collection call; the value need not
    // change. The plan keeps the live value and says why it patches anyway.
    const plan = planHnswPatch(
      info({
        indexingThreshold: 8000,
        maxSegmentSize: 20000,
        pointsCount: 100,
        indexedVectorsCount: 0,
        status: 'grey',
      }),
      MEDIUM_PRESET
    );

    expect(plan.action).toBe('patch');
    expect(plan.target).toBe(8000);
    expect(plan.reason).toContain('stalled optimizer');
    expect(plan.reason).toContain('grey');
  });
});
